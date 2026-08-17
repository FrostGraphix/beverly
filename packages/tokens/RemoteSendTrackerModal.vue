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
    const clean = val.replace(/\D/g, '');
    return clean.replace(/(.{4})/g, '$1 ').trim();
}

function formatNaira(minor?: number | null): string {
    if (minor == null) return '₦0.00';
    return `₦${(minor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const formattedToken = computed(() => formatToken(currentToken.value ?? props.token));

const isSuccess = computed(() => ['remote_send_delivered', 'delivered'].includes(currentState.value));
const isFailed = computed(() => String(currentState.value).includes('failed'));
const isPending = computed(() => ['remote_send_pending', 'remote_send_pending_review', 'token_generated', 'dispatching', 'hold_active'].includes(currentState.value));

const statusHeadline = computed(() => {
    if (isSuccess.value) return 'Token delivered to meter';
    if (isFailed.value) return 'Remote send failed — manual entry required';
    if (polling.value) return 'Dispatching token to physical meter…';
    return 'Remote send status';
});

const statusSubhead = computed(() => {
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
            if (res.deliveryState) currentState.value = res.deliveryState;
            else if (res.purchaseOrder?.delivery_state) currentState.value = res.purchaseOrder.delivery_state;
            if (res.remoteTaskId) currentTaskId.value = res.remoteTaskId;
            if (res.remark) currentRemark.value = res.remark;
            if (res.token) currentToken.value = res.token;
            emit('updated', res);
        }
    } catch {
        // Transient error — backoff continues
    }

    if (!isSuccess.value && !isFailed.value && attempt + 1 < POLL_DELAYS_MS.length) {
        pollTimer = window.setTimeout(() => triggerPoll(attempt + 1), POLL_DELAYS_MS[attempt]);
    } else {
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

onUnmounted(() => {
    stopPolling();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="rst-fade">
      <div v-if="open" class="rst-scrim" @click.self="closeModal">
        <div class="rst-dialog" role="dialog" aria-modal="true">
          <header class="rst-head">
            <div class="rst-head-title">
              <span class="rst-badge-icon" :class="{ success: isSuccess, danger: isFailed, pending: isPending }">
                <svg v-if="isSuccess" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                <svg v-else-if="isFailed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                <svg v-else class="rst-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
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
            <button v-if="isFailed && apiEndpoint && fetcher" class="rst-btn primary" :disabled="polling" @click="startPolling">
              {{ polling ? 'Retrying dispatch…' : 'Retry Remote Send' }}
            </button>
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
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.rst-dialog {
  background: var(--bg-surface, #12161f);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.12));
  border-radius: 16px;
  width: 100%;
  max-width: 540px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  color: var(--text-main, #f3f4f6);
  font-family: var(--font-sans, 'Inter', system-ui, sans-serif);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.rst-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.rst-head-title {
  display: flex;
  align-items: center;
  gap: 14px;
}

.rst-badge-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);
  color: #9ca3af;
}

.rst-badge-icon svg {
  width: 22px;
  height: 22px;
}

.rst-badge-icon.success {
  background: rgba(34, 197, 94, 0.16);
  color: #4ade80;
}

.rst-badge-icon.danger {
  background: rgba(239, 68, 68, 0.16);
  color: #f87171;
}

.rst-badge-icon.pending {
  background: rgba(59, 130, 246, 0.16);
  color: #60a5fa;
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
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.3;
}

.rst-subtitle {
  margin: 4px 0 0;
  font-size: 0.85rem;
  color: var(--text-dim, #9ca3af);
  line-height: 1.4;
}

.rst-close {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  line-height: 1;
}
.rst-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* 4-Step Stepper */
.rst-pipeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  padding-left: 4px;
}

.rst-step {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  position: relative;
}

.rst-step:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 28px;
  left: 13px;
  width: 2px;
  height: calc(100% + 4px);
  background: rgba(255, 255, 255, 0.12);
}

.rst-step.completed:not(:last-child)::after {
  background: #22c55e;
}

.rst-step-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.1);
  color: #9ca3af;
  z-index: 1;
}

.rst-step.completed .rst-step-icon {
  background: #22c55e;
  color: #000;
}

.rst-step.active .rst-step-icon {
  background: #3b82f6;
  color: #fff;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.5);
}

.rst-step.failed .rst-step-icon {
  background: #ef4444;
  color: #fff;
}

.rst-active-dot {
  width: 8px;
  height: 8px;
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
  gap: 2px;
  padding-top: 3px;
}

.rst-step-label {
  font-size: 0.9rem;
  font-weight: 600;
}

.rst-step-desc {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-dim, #9ca3af);
}

/* Token Box */
.rst-token-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rst-token-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
}

.rst-token-tag {
  color: #4ade80;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.rst-token-meter {
  color: #9ca3af;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}

.rst-token-value {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
  padding: 8px 0;
  color: #fff;
}

.rst-token-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.rst-token-note {
  font-size: 0.75rem;
  color: #9ca3af;
}

/* Meta grid */
.rst-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  background: rgba(0, 0, 0, 0.2);
  padding: 12px;
  border-radius: 8px;
}

.rst-meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rst-meta-label {
  font-size: 0.7rem;
  color: #9ca3af;
  text-transform: uppercase;
}

.rst-meta-val {
  font-size: 0.85rem;
  font-weight: 600;
}

.rst-meta-val.mono {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}

.rst-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.rst-btn {
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
}

.rst-btn.primary {
  background: var(--brand, #22c55e);
  color: #000;
}
.rst-btn.primary:hover {
  filter: brightness(1.1);
}

.rst-btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.rst-btn.secondary:hover {
  background: rgba(255, 255, 255, 0.16);
}

.rst-btn.sm {
  padding: 6px 12px;
  font-size: 0.8rem;
}

/* Transition */
.rst-fade-enter-active, .rst-fade-leave-active {
  transition: opacity 0.2s ease;
}
.rst-fade-enter-from, .rst-fade-leave-to {
  opacity: 0;
}
</style>
