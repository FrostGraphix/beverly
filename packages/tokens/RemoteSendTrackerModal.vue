<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';

export interface RemoteSendStep {
    id: 'token_ready' | 'oem_queue' | 'transmission' | 'meter_ack';
    number: number;
    label: string;
    description: string;
    status: 'completed' | 'active' | 'pending' | 'failed';
    timestamp?: string | null;
}

const props = withDefaults(
    defineProps<{
        open: boolean;
        orderId?: string | null;
        meterId?: string | null;
        token?: string | null;
        amountMinor?: number | null;
        unitsKwh?: number | null;
        customerName?: string | null;
        deliveryState?: string | null;
        remoteTaskId?: string | null;
        remark?: string | null;
        apiEndpoint?: string | null;
        fetcher?: ((endpoint: string) => Promise<any>) | null;
    }>(),
    {
        open: false,
        orderId: null,
        meterId: null,
        token: null,
        amountMinor: null,
        unitsKwh: null,
        customerName: null,
        deliveryState: null,
        remoteTaskId: null,
        remark: null,
        apiEndpoint: null,
        fetcher: null,
    }
);

const emit = defineEmits<{
    (e: 'update:open', value: boolean): void;
    (e: 'close'): void;
    (e: 'updated', result: any): void;
}>();

const loading = ref(false);
const polling = ref(false);
const copied = ref(false);
const pollCount = ref(0);
let pollTimer: number | undefined;

const currentTaskId = ref<string | null>(props.remoteTaskId ?? null);
const currentState = ref<string>(props.deliveryState ?? 'remote_send_pending');
const currentRemark = ref<string | null>(props.remark ?? null);
const currentToken = ref<string | null>(props.token ?? null);

const POLL_DELAYS_MS = [2000, 3000, 5000, 8000, 13000];

function formatToken(val?: string | null): string {
    if (!val) return '•••• •••• •••• •••• ••••';
    const str = String(val).trim();
    const clean = str.replace(/\D/g, '');
    if (clean.length === 20) {
        return `${clean.slice(0,4)} ${clean.slice(4,8)} ${clean.slice(8,12)} ${clean.slice(12,16)} ${clean.slice(16,20)}`;
    }
    if (clean.length > 0) {
        return clean.replace(/(.{4})/g, '$1 ').trim();
    }
    return str;
}

function formatNaira(minor?: number | null): string {
    if (minor == null) return '₦0.00';
    return `₦${(minor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const formattedToken = computed(() => formatToken(currentToken.value ?? props.token));

const isAlreadyUsed = computed(() => (
    ['already_delivered', 'already_credited', 'already_used', 'token_already_used', 'token_already_sent'].includes(String(currentState.value)) ||
    Boolean(currentRemark.value?.toLowerCase().includes('already used')) ||
    Boolean(currentRemark.value?.toLowerCase().includes('used token')) ||
    Boolean(currentRemark.value?.toLowerCase().includes('already been used')) ||
    Boolean(currentRemark.value?.toLowerCase().includes('already sent'))
));

const isSuccess = computed(() => ['remote_send_delivered', 'delivered', 'already_delivered', 'already_credited', 'already_used', 'token_already_used', 'token_already_sent'].includes(String(currentState.value)) || isAlreadyUsed.value);
const isFailed = computed(() => !isAlreadyUsed.value && (String(currentState.value).includes('failed') || String(currentState.value).includes('error')));
const isPending = computed(() => ['remote_send_pending', 'remote_send_pending_review', 'token_generated', 'dispatching', 'hold_active'].includes(String(currentState.value)));

const statusHeadline = computed(() => {
    if (isAlreadyUsed.value) return 'Token already credited / sent to meter';
    if (isSuccess.value) return 'Token delivered to meter';
    if (isFailed.value) return 'Remote send failed — manual entry required';
    if (polling.value) return 'Dispatching token to physical meter…';
    return 'Remote send status';
});

const statusSubhead = computed(() => {
    if (isAlreadyUsed.value) return currentRemark.value || 'This token has already been entered or sent over-the-air to the physical meter. No further action is required.';
    if (isSuccess.value) return 'The physical meter acknowledged receiving this credit token.';
    if (isFailed.value) return currentRemark.value || 'Wireless delivery encountered an issue. The token below is 100% valid for keypad entry.';
    if (polling.value) return 'Beverly is transmitting the credit payload over-the-air to your meter.';
    return 'Review live transmission milestones below.';
});

const steps = computed<RemoteSendStep[]>(() => {
    const state = currentState.value;
    const failed = isFailed.value;
    const success = isSuccess.value;

    return [
        {
            id: 'token_ready',
            number: 1,
            label: 'Token Generated',
            description: 'Credit token generated and cryptographically signed.',
            status: 'completed',
        },
        {
            id: 'oem_queue',
            number: 2,
            label: 'OEM Gateway Queue',
            description: currentTaskId.value ? `Task #${String(currentTaskId.value).slice(0, 10)} allocated on OEM gateway.` : 'Submitting to OEM gateway queue…',
            status: 'completed',
        },
        {
            id: 'transmission',
            number: 3,
            label: 'Wireless Dispatch',
            description: failed ? 'Over-the-air dispatch unconfirmed.' : success ? 'Wireless payload transmitted via GPRS/PLC.' : 'Transmitting payload to meter…',
            status: success ? 'completed' : failed ? 'failed' : 'active',
        },
        {
            id: 'meter_ack',
            number: 4,
            label: 'Meter Confirmation',
            description: success ? 'Meter acknowledged token & updated credit.' : failed ? 'Meter rejected or timed out. Enter token manually.' : 'Awaiting meter ACK signal…',
            status: success ? 'completed' : failed ? 'failed' : 'pending',
        },
    ];
});

function stopPolling() {
    if (pollTimer) {
        window.clearTimeout(pollTimer);
        pollTimer = undefined;
    }
    polling.value = false;
}

async function triggerPoll(attempt: number) {
    if (!props.apiEndpoint || !props.fetcher) return;
    if (isSuccess.value || attempt >= POLL_DELAYS_MS.length) {
        stopPolling();
        return;
    }
    polling.value = true;
    pollCount.value = attempt + 1;

    try {
        const res = await props.fetcher(props.apiEndpoint);
        if (res) {
            const nextState = res.deliveryState || res.delivery_state || res.purchaseOrder?.delivery_state;
            if (nextState) currentState.value = nextState;
            const nextTaskId = res.remoteTaskId || res.remote_task_id || res.purchaseOrder?.remote_task_id;
            if (nextTaskId) currentTaskId.value = nextTaskId;
            const nextRemark = res.remark || res.message || res.failure_reason;
            if (nextRemark) currentRemark.value = nextRemark;
            const nextToken = res.token || res.purchaseOrder?.token;
            if (nextToken) currentToken.value = nextToken;
            emit('updated', res);
        }
    } catch (err: any) {
        const errData = err?.details || err?.data || err?.response?.data || err;
        const fallbackState = errData?.deliveryState || errData?.delivery_state || errData?.purchaseOrder?.delivery_state || (attempt + 1 >= POLL_DELAYS_MS.length ? 'remote_send_failed_needs_manual_entry' : null);
        if (fallbackState) currentState.value = fallbackState;
        const fallbackRemark = errData?.remark || errData?.message || errData?.error || err?.message;
        if (fallbackRemark) currentRemark.value = fallbackRemark;
    }

    if (!isSuccess.value && !isFailed.value && attempt + 1 < POLL_DELAYS_MS.length) {
        pollTimer = window.setTimeout(() => triggerPoll(attempt + 1), POLL_DELAYS_MS[attempt]);
    } else {
        if (!isSuccess.value && !isFailed.value) {
            currentState.value = 'remote_send_failed_needs_manual_entry';
            if (!currentRemark.value) {
                currentRemark.value = 'Meter delivery acknowledgement pending over-the-air. The 20-digit token is valid for keypad entry.';
            }
        }
        stopPolling();
    }
}

function startPolling() {
    stopPolling();
    if (props.apiEndpoint && props.fetcher && !isSuccess.value && !isFailed.value) {
        triggerPoll(0);
    }
}

async function copyToken() {
    const t = currentToken.value ?? props.token;
    if (t) {
        try {
            await navigator.clipboard.writeText(t);
            copied.value = true;
            setTimeout(() => { copied.value = false; }, 2200);
        } catch {}
    }
}

async function forceResend() {
    if (!props.apiEndpoint || !props.fetcher || polling.value) return;
    polling.value = true;
    currentState.value = 'remote_send_pending';
    currentRemark.value = 'Re-transmitting credit payload over-the-air to meter...';
    try {
        const forceEndpoint = props.apiEndpoint.includes('?') ? `${props.apiEndpoint}&force=true` : `${props.apiEndpoint}?force=true`;
        const res = await props.fetcher(forceEndpoint);
        if (res) {
            const nextState = res.deliveryState || res.delivery_state || res.purchaseOrder?.delivery_state;
            if (nextState) currentState.value = nextState;
            const nextTaskId = res.remoteTaskId || res.remote_task_id || res.purchaseOrder?.remote_task_id;
            if (nextTaskId) currentTaskId.value = nextTaskId;
            const nextRemark = res.remark || res.message || res.failure_reason;
            if (nextRemark) currentRemark.value = nextRemark;
            emit('updated', res);
        }
    } catch (err: any) {
        const errData = err?.details || err?.data || err?.response?.data || err;
        const fallbackRemark = errData?.remark || errData?.message || errData?.error || err?.message;
        if (fallbackRemark) currentRemark.value = fallbackRemark;
    } finally {
        polling.value = false;
    }
}

function closeModal() {
    stopPolling();
    emit('update:open', false);
    emit('close');
}

watch(
    () => props.open,
    (val) => {
        if (val) {
            currentState.value = props.deliveryState ?? 'remote_send_pending';
            currentTaskId.value = props.remoteTaskId ?? null;
            currentRemark.value = props.remark ?? null;
            currentToken.value = props.token ?? null;
            startPolling();
        } else {
            stopPolling();
        }
    },
    { immediate: true }
);

watch(
    () => [props.deliveryState, props.remoteTaskId, props.remark, props.token],
    ([ds, tid, rem, tok]) => {
        if (ds) currentState.value = ds as string;
        if (tid) currentTaskId.value = tid as string;
        if (rem) currentRemark.value = rem as string;
        if (tok) currentToken.value = tok as string;
    }
);

onUnmounted(() => {
    stopPolling();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="rst-fade">
      <div v-if="open" class="rst-scrim" @click.self="closeModal">
        <!-- SUCCESS MODAL (When Remote Send is Confirmed Delivered) -->
        <div v-if="isSuccess" class="rst-dialog rst-dialog--success" role="dialog" aria-modal="true">
          <header class="rst-head text-center">
            <div class="rst-success-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--brand, #22c55e)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h3 class="rst-title bold-title" style="color: var(--brand, #22c55e)">Remote Send Confirmed & Delivered!</h3>
            <p class="rst-subtitle">The physical meter acknowledged wireless dispatch and updated its credit balance.</p>
          </header>

          <div class="rst-success-details-card">
            <div class="rst-detail-row">
              <span class="rst-detail-label">Meter Number</span>
              <strong class="rst-detail-val mono">{{ meterId || '—' }}</strong>
            </div>
            <div v-if="customerName" class="rst-detail-row">
              <span class="rst-detail-label">Customer</span>
              <strong class="rst-detail-val">{{ customerName }}</strong>
            </div>
            <div v-if="amountMinor" class="rst-detail-row">
              <span class="rst-detail-label">Amount Paid</span>
              <strong class="rst-detail-val">{{ formatNaira(amountMinor) }}</strong>
            </div>
            <div v-if="unitsKwh" class="rst-detail-row">
              <span class="rst-detail-label">Credited Units</span>
              <strong class="rst-detail-val mono" style="color: var(--brand, #22c55e)">{{ Number(unitsKwh).toFixed(2) }} kWh</strong>
            </div>
            <div v-if="currentTaskId" class="rst-detail-row">
              <span class="rst-detail-label">Transmission Task</span>
              <strong class="rst-detail-val mono">#{{ String(currentTaskId).slice(0, 10) }}</strong>
            </div>
          </div>

          <!-- Token Box -->
          <div class="rst-token-card">
            <div class="rst-token-header">
              <span class="rst-token-tag">Delivered Credit Token</span>
              <span v-if="meterId" class="rst-token-meter">Meter: {{ meterId }}</span>
            </div>
            <div class="rst-token-value">{{ formattedToken }}</div>
            <div class="rst-token-actions">
              <button class="rst-btn primary sm" @click="copyToken">
                {{ copied ? 'Copied to Clipboard ✓' : 'Copy 20-Digit Token' }}
              </button>
            </div>
          </div>

          <footer class="rst-foot" style="display: flex; gap: var(--s-2); justify-content: flex-end">
            <button v-if="apiEndpoint && fetcher" type="button" class="rst-btn secondary" :disabled="polling" @click="forceResend">
              {{ polling ? 'Transmitting…' : 'Re-send Over-the-Air' }}
            </button>
            <button type="button" class="rst-btn primary" @click="closeModal">
              Done & Close
            </button>
          </footer>
        </div>

        <!-- FAILURE MODAL WITH REASONS (When Remote Send encounters an error) -->
        <div v-else-if="isFailed" class="rst-dialog rst-dialog--failed" role="dialog" aria-modal="true">
          <header class="rst-head text-center">
            <div class="rst-failed-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h3 class="rst-title bold-title" style="color: #ef4444">Remote Dispatch Unconfirmed</h3>
            <p class="rst-subtitle">Wireless payload delivery could not be verified by the physical meter.</p>
          </header>

          <!-- Failure Reasons Card -->
          <div class="rst-reason-card">
            <div class="rst-reason-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <strong>Failure Cause & Diagnostics</strong>
            </div>
            <p class="rst-reason-text">
              {{ currentRemark || 'The physical meter was offline or GPRS signal timed out before payload acknowledgement.' }}
            </p>
            <ul class="rst-reason-bullets">
              <li>Signal status: Meter un-acknowledged over GPRS/PLC.</li>
              <li>Token status: <strong>{{ currentToken || props.token ? '100% Valid' : 'Pending Generation' }}</strong> {{ currentToken || props.token ? 'for manual keypad entry.' : 'or release by admin.' }}</li>
            </ul>
          </div>

          <!-- Token Box for Manual Fallback -->
          <div class="rst-token-card">
            <div class="rst-token-header">
              <span class="rst-token-tag" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5">Manual Keypad Token</span>
              <span v-if="meterId" class="rst-token-meter">Meter: {{ meterId }}</span>
            </div>
            <div class="rst-token-value">{{ formattedToken }}</div>
            <div class="rst-token-actions">
              <button class="rst-btn primary sm" @click="copyToken">
                {{ copied ? 'Copied to Clipboard ✓' : 'Copy Token for Manual Entry' }}
              </button>
            </div>
          </div>

          <footer class="rst-foot">
            <button class="rst-btn secondary" @click="closeModal">Close</button>
            <button v-if="apiEndpoint && fetcher" class="rst-btn primary" :disabled="polling" @click="startPolling">
              {{ polling ? 'Retrying dispatch…' : 'Retry Remote Send' }}
            </button>
          </footer>
        </div>

        <!-- TRACKING / PROGRESS PIPELINE MODAL (In progress) -->
        <div v-else class="rst-dialog" role="dialog" aria-modal="true">
          <header class="rst-head">
            <div class="rst-head-title">
              <span class="rst-badge-icon pending">
                <svg class="rst-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
              </span>
              <div>
                <h3 class="rst-title">{{ statusHeadline }}</h3>
                <p class="rst-subtitle">{{ statusSubhead }}</p>
              </div>
            </div>
            <button class="rst-close" @click="closeModal" aria-label="Close modal">×</button>
          </header>

          <!-- 4-Step Pipeline Progress Stepper -->
          <div class="rst-pipeline">
            <div
              v-for="step in steps"
              :key="step.id"
              class="rst-step"
              :class="[step.status]"
            >
              <div class="rst-step-icon">
                <span v-if="step.status === 'completed'" class="rst-check">✓</span>
                <span v-else-if="step.status === 'failed'" class="rst-cross">!</span>
                <span v-else-if="step.status === 'active'" class="rst-active-dot"></span>
                <span v-else class="rst-num">{{ step.number }}</span>
              </div>
              <div class="rst-step-body">
                <strong class="rst-step-label">{{ step.label }}</strong>
                <p class="rst-step-desc">{{ step.description }}</p>
              </div>
            </div>
          </div>

          <!-- Token Box -->
          <div class="rst-token-card">
            <div class="rst-token-header">
              <span class="rst-token-tag">Valid Credit Token</span>
              <span v-if="meterId" class="rst-token-meter">Meter: {{ meterId }}</span>
            </div>
            <div class="rst-token-value">{{ formattedToken }}</div>
            <div class="rst-token-actions">
              <button class="rst-btn primary sm" @click="copyToken">
                {{ copied ? 'Copied to Clipboard ✓' : 'Copy 20-Digit Token' }}
              </button>
              <span class="rst-token-note">Always valid for direct keypad entry</span>
            </div>
          </div>

          <!-- Order Summary Meta Bar -->
          <div v-if="meterId || amountMinor || customerName" class="rst-meta-grid">
            <div v-if="customerName" class="rst-meta-item">
              <span class="rst-meta-label">Customer</span>
              <span class="rst-meta-val">{{ customerName }}</span>
            </div>
            <div v-if="meterId" class="rst-meta-item">
              <span class="rst-meta-label">Meter Number</span>
              <span class="rst-meta-val mono">{{ meterId }}</span>
            </div>
            <div v-if="amountMinor" class="rst-meta-item">
              <span class="rst-meta-label">Amount</span>
              <span class="rst-meta-val">{{ formatNaira(amountMinor) }}</span>
            </div>
            <div v-if="unitsKwh" class="rst-meta-item">
              <span class="rst-meta-label">Units</span>
              <span class="rst-meta-val mono">{{ Number(unitsKwh).toFixed(2) }} kWh</span>
            </div>
          </div>

          <footer class="rst-foot">
            <button class="rst-btn secondary" @click="closeModal">Close</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.rst-scrim {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--glass-bg-strong, rgba(0, 0, 0, 0.75));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}

.rst-dialog {
  background: var(--surface-1, #0f172a);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: var(--r-lg, 16px);
  width: 100%;
  max-width: 440px;
  box-shadow: var(--shadow-lg, 0 20px 50px rgba(0, 0, 0, 0.5));
  color: var(--text, #f3f4f6);
  font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: relative;
  overflow: hidden;
}

.rst-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.rst-head-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rst-badge-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--r-md, 10px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--surface-2, rgba(255, 255, 255, 0.08));
  color: var(--text-muted, #9ca3af);
}

.rst-badge-icon svg {
  width: 18px;
  height: 18px;
}

.rst-badge-icon.success {
  background: var(--brand-glow, rgba(34, 197, 94, 0.16));
  color: var(--brand-on-surface, var(--brand, #22c55e));
}

.rst-badge-icon.danger {
  background: rgba(239, 68, 68, 0.16);
  color: var(--danger, #ef4444);
}

.rst-badge-icon.pending {
  background: rgba(59, 130, 246, 0.16);
  color: var(--info, #3b82f6);
}

.rst-spin {
  animation: rst-spin-anim 1.2s linear infinite;
}

@keyframes rst-spin-anim {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.rst-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--text, #f3f4f6);
}

.rst-subtitle {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--text-muted, #9ca3af);
  line-height: 1.35;
}

.rst-close {
  background: transparent;
  border: none;
  color: var(--text-muted, #9ca3af);
  font-size: 1.35rem;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: var(--r-sm, 6px);
  line-height: 1;
  transition: all var(--dur-fast, 0.15s) ease;
}
.rst-close:hover {
  background: var(--surface-2, rgba(255, 255, 255, 0.1));
  color: var(--text, #fff);
}

/* Pipeline Stepper */
.rst-pipeline {
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  padding-left: 2px;
}

.rst-step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  position: relative;
}

.rst-step:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 22px;
  left: 10px;
  width: 2px;
  height: calc(100% + 2px);
  background: var(--border, rgba(255, 255, 255, 0.1));
}

.rst-step.completed:not(:last-child)::after {
  background: var(--brand, #22c55e);
}

.rst-step-icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  flex-shrink: 0;
  background: var(--surface-2, rgba(255, 255, 255, 0.08));
  color: var(--text-muted, #9ca3af);
  z-index: 1;
}

.rst-step.completed .rst-step-icon {
  background: var(--brand, #22c55e);
  color: #000;
}

.rst-step.active .rst-step-icon {
  background: var(--info, #3b82f6);
  color: #fff;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
}

.rst-step.failed .rst-step-icon {
  background: var(--danger, #ef4444);
  color: #fff;
}

.rst-active-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
  animation: rst-pulse 1s infinite alternate;
}

@keyframes rst-pulse {
  from { opacity: 0.4; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1.2); }
}

.rst-step-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-top: 1px;
}

.rst-step-label {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text, #f3f4f6);
}

.rst-step-desc {
  margin: 0;
  font-size: 0.76rem;
  color: var(--text-muted, #9ca3af);
  line-height: 1.3;
}

/* Theme-Aware Token Box with Rotating Shimmering CSS Gradient */
.rst-token-card {
  position: relative;
  background: var(--surface-2, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: var(--r-md, 12px);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

/* Rotating shimmering background accent */
.rst-token-card::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    var(--brand-glow, rgba(34, 197, 94, 0.18)) 90deg,
    var(--brand, #22c55e) 180deg,
    var(--brand-glow, rgba(34, 197, 94, 0.18)) 270deg,
    transparent 360deg
  );
  animation: bw-rotate-shimmer 6s linear infinite;
  opacity: 0.35;
  pointer-events: none;
  z-index: 0;
}

@keyframes bw-rotate-shimmer {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.rst-token-card > * {
  position: relative;
  z-index: 1;
}

.rst-token-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.74rem;
}

.rst-token-tag {
  color: var(--brand-on-surface, var(--brand, #22c55e));
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.rst-token-meter {
  color: var(--text-muted, #9ca3af);
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
}

.rst-token-value {
  position: relative;
  z-index: 10;
  font-family: var(--font-mono, 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace);
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-align: center;
  color: var(--brand-on-surface, var(--brand, #22c55e)) !important;
  -webkit-text-fill-color: var(--brand-on-surface, var(--brand, #22c55e)) !important;
  -webkit-background-clip: border-box !important;
  background-clip: border-box !important;
  padding: 14px 16px;
  background: var(--surface-1, #090d16) !important;
  border-radius: var(--r-md, 10px);
  border: 1.5px solid var(--brand, #22c55e);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.4), var(--brand-glow, 0 0 20px rgba(34, 197, 94, 0.25));
  overflow: hidden;
}

.rst-token-value::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.15) 50%,
    transparent 100%
  );
  animation: bw-token-shimmer-pass 2.8s ease-in-out infinite;
  pointer-events: none;
}

@keyframes bw-token-shimmer-pass {
  0% { left: -100%; }
  100% { left: 200%; }
}

.rst-token-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.rst-token-note {
  font-size: 0.72rem;
  color: var(--text-muted, #9ca3af);
}

/* Order Summary Meta Grid */
.rst-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  background: var(--surface-2, rgba(0, 0, 0, 0.2));
  padding: 10px 12px;
  border-radius: var(--r-md, 8px);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.06));
}

.rst-meta-item {
  display: flex;
  flex-direction: column;
}

.rst-meta-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--text-muted, #9ca3af);
  letter-spacing: 0.04em;
}

.rst-meta-val {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text, #f3f4f6);
}

.rst-meta-val.mono {
  font-family: var(--font-mono, monospace);
}

.rst-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

.rst-btn {
  border-radius: var(--r-md, 8px);
  font-size: 0.84rem;
  font-weight: 600;
  padding: 8px 16px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all var(--dur-fast, 0.15s) ease;
  font-family: inherit;
}

.rst-btn.sm {
  padding: 6px 12px;
  font-size: 0.78rem;
}

.rst-btn.primary {
  background: var(--brand, #22c55e);
  color: #000;
  border-color: var(--brand, #22c55e);
  box-shadow: var(--brand-glow, 0 0 12px rgba(34, 197, 94, 0.25));
}
.rst-btn.primary:hover {
  filter: brightness(1.08);
}

.rst-btn.secondary {
  background: var(--surface-2, rgba(255, 255, 255, 0.1));
  color: var(--text, #fff);
  border-color: var(--border, rgba(255, 255, 255, 0.12));
}
.rst-btn.secondary:hover {
  background: var(--surface-3, rgba(255, 255, 255, 0.16));
}

/* Success & Failure Modal Variants */
.rst-dialog--success {
  border-color: var(--brand, #22c55e);
  box-shadow: var(--brand-glow, 0 0 40px rgba(34, 197, 94, 0.2)), var(--shadow-lg, 0 20px 50px rgba(0, 0, 0, 0.5));
}

.rst-dialog--failed {
  border-color: var(--danger, #ef4444);
  box-shadow: 0 0 40px rgba(239, 68, 68, 0.2), var(--shadow-lg, 0 20px 50px rgba(0, 0, 0, 0.5));
}

.rst-success-icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--brand-glow, rgba(34, 197, 94, 0.16));
  display: grid;
  place-items: center;
  margin: 4px auto 10px;
  box-shadow: var(--brand-glow, 0 0 24px rgba(34, 197, 94, 0.3));
}
.rst-success-icon-wrap svg {
  width: 28px;
  height: 28px;
}

.rst-failed-icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.15);
  display: grid;
  place-items: center;
  margin: 4px auto 10px;
  box-shadow: 0 0 24px rgba(239, 68, 68, 0.3);
}
.rst-failed-icon-wrap svg {
  width: 28px;
  height: 28px;
}

.text-center {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.bold-title {
  font-size: 1.15rem;
  font-weight: 700;
}

.rst-success-details-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--r-md, 10px);
  background: var(--surface-2, rgba(0, 0, 0, 0.25));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
}

.rst-detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.84rem;
}
.rst-detail-label {
  color: var(--text-muted, #9ca3af);
}
.rst-detail-val {
  color: var(--text, #f3f4f6);
}

.rst-reason-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--r-md, 10px);
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.rst-reason-header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--danger, #ef4444);
  font-size: 0.84rem;
}

.rst-reason-text {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text, #e5e7eb);
  line-height: 1.4;
}

.rst-reason-bullets {
  margin: 0;
  padding-left: 18px;
  font-size: 0.76rem;
  color: var(--text-muted, #9ca3af);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Light Theme Support */
:root[data-theme="light"] .rst-dialog {
  background: var(--surface-1, #ffffff);
  border-color: var(--border, rgba(0, 0, 0, 0.15));
  color: var(--text, #0f172a);
}
:root[data-theme="light"] .rst-title {
  color: var(--text, #0f172a);
}
:root[data-theme="light"] .rst-subtitle {
  color: var(--text-muted, #475569);
}
:root[data-theme="light"] .rst-token-card {
  background: var(--surface-2, #f8fafc);
  border-color: var(--border, rgba(0, 0, 0, 0.12));
}
:root[data-theme="light"] .rst-token-value {
  background: var(--surface-1, #ffffff) !important;
  color: var(--brand-on-surface, oklch(42% 0.12 145)) !important;
  -webkit-text-fill-color: var(--brand-on-surface, oklch(42% 0.12 145)) !important;
  border-color: var(--brand, #22c55e) !important;
}
:root[data-theme="light"] .rst-meta-grid {
  background: var(--surface-2, #f1f5f9);
  border-color: var(--border, rgba(0, 0, 0, 0.08));
}
:root[data-theme="light"] .rst-meta-val {
  color: var(--text, #0f172a);
}
:root[data-theme="light"] .rst-success-details-card {
  background: var(--surface-2, #f0fdf4);
  border-color: var(--border, rgba(34, 197, 94, 0.3));
}
:root[data-theme="light"] .rst-detail-label {
  color: var(--text-muted, #475569);
}
:root[data-theme="light"] .rst-detail-val {
  color: var(--text, #0f172a);
}

/* Transition */
.rst-fade-enter-active, .rst-fade-leave-active {
  transition: opacity 0.2s ease;
}
.rst-fade-enter-from, .rst-fade-leave-to {
  opacity: 0;
}
</style>
