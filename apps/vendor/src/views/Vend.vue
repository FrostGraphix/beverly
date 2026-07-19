<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import StatusPopup from '../components/StatusPopup.vue';
import { api, ApiError } from '../lib/api';
import { naira, kwh } from '../lib/format';
import { downloadReceipt, printReceipt, purchaseReceipt, viewReceipt } from '../lib/receipts';

type Step = 'meter' | 'amount' | 'preview' | 'success';

const step = ref<Step>('meter');
const meterId = ref('');
const amountNaira = ref(2000);
const loading = ref(false);
const error = ref<{ title: string; message: string; action?: string; code?: string } | null>(null);
const notice = ref<{ tone: 'success' | 'info' | 'danger'; title: string; message: string; code?: string } | null>(null);
const remoteSending = ref(false);
const copied = ref(false);
const resultPopup = ref<{ tone: 'success' | 'danger' | 'info'; title: string; message: string } | null>(null);

function showResultPopup(tone: 'success' | 'danger' | 'info', title: string, message: string) {
    resultPopup.value = { tone, title, message };
}
const authOpen = ref(false);
const authorization = ref('');
const authError = ref('');
const router = useRouter();
const route = useRoute();

interface MeterInfo {
    meterId: string;
    customerId: string;
    customerName: string;
    stationId: string;
    tariffId: string;
    isThreePhase?: boolean | null;
    liveVerified?: boolean;
    resolutionSource?: string;
}
interface Preview {
    amountMinor: number;
    units: number;
    effectivePricePerKwh: number;
    tariffId: string;
    energyAmountMinor?: number;
    taxAmountMinor?: number;
    vatRateBasisPoints?: number;
}

const meter = ref<MeterInfo | null>(null);
const preview = ref<Preview | null>(null);
const result = ref<{ token: string | null; units: number; receiptId: string | null; purchaseOrder: any } | null>(null);

const amountMinor = computed(() => Math.max(0, Math.round(amountNaira.value * 100)));
const canVend = computed(() => meter.value?.liveVerified !== false);
const remoteState = computed(() => String(result.value?.purchaseOrder?.delivery_state ?? 'token_generated'));
const canRemoteSendToken = computed(() => {
    if (!result.value?.token || !result.value.purchaseOrder?.id || remoteSending.value) return false;
    return remoteState.value !== 'remote_send_delivered';
});
const remoteSendLabel = computed(() => {
    if (remoteSending.value) return 'Sending...';
    if (remoteState.value === 'remote_send_delivered') return 'Remote sent';
    if (['remote_send_pending', 'remote_send_pending_review'].includes(remoteState.value)) return 'Check remote status';
    if (remoteState.value.includes('failed')) return 'Retry remote send';
    return 'Remote send';
});
const flowSteps = computed(() => [
    { label: 'Meter', active: step.value === 'meter', done: ['amount', 'preview', 'success'].includes(step.value) },
    { label: 'Amount', active: step.value === 'amount', done: ['preview', 'success'].includes(step.value) },
    { label: 'Confirm', active: step.value === 'preview', done: step.value === 'success' },
    { label: 'Receipt', active: step.value === 'success', done: false },
]);
const confirmLabel = computed(() => {
    if (loading.value) return 'Generating token...';
    if (!canVend.value) return 'Bind meter before vend';
    return `Confirm - ${naira(preview.value?.amountMinor)}`;
});

function meterTypeLabel(isThreePhase?: boolean | null) {
    return isThreePhase ? 'Three Phase' : 'Single Phase';
}

function describeApiError(e: unknown, fallback: string) {
    if (e instanceof ApiError) {
        if (e.code === 'vend_credential_required') {
            return {
                title: 'Vendor authorization required',
                message: e.message,
                action: 'Create your vendor PIN or password, then retry this vend.',
                code: e.code,
            };
        }
        if (e.code === 'invalid_vend_credential') {
            return {
                title: 'Invalid authorization',
                message: e.message,
                action: 'Enter the PIN or password created on Vendor Authorization.',
                code: e.code,
            };
        }
        if (e.code === 'insufficient_balance') {
            return {
                title: 'Insufficient wallet balance',
                message: e.message,
                action: 'Fund this vendor wallet before generating another token.',
                code: e.code,
            };
        }
        if (['wallet_inactive', 'wallet_frozen', 'wallet_closed'].includes(String(e.code))) {
            return {
                title: 'Wallet cannot vend',
                message: e.message,
                action: 'Contact Beverly admin before retrying this sale.',
                code: e.code,
            };
        }
        if (e.code === 'remote_token_rejected') {
            return {
                title: 'Remote send rejected',
                message: e.message,
                action: 'The token is still visible. Enter it manually or contact support.',
                code: e.code,
            };
        }
        if (e.code === 'remote_send_metadata_missing') {
            return {
                title: 'Remote send unavailable',
                message: e.message,
                action: 'The token is still valid. Enter it manually while admin fixes the meter binding.',
                code: e.code,
            };
        }
        if (e.code === 'meter_lookup_unavailable' || e.status === 503) {
            return {
                title: 'Live lookup unavailable',
                message: e.message,
                action: 'No wallet debit or vend was attempted. Retry shortly, or ask an admin to bind this meter before selling.',
                code: e.code,
            };
        }
        if (e.code === 'meter_not_found' || e.status === 404) {
            return {
                title: 'Meter not in catalog',
                message: e.message,
                action: 'Confirm the meter number, then bind the customer meter in admin if it is a valid live meter.',
                code: e.code,
            };
        }
        return {
            title: 'Request failed',
            message: e.message,
            action: 'No vend was attempted. Please retry or contact support if this repeats.',
            code: e.code,
        };
    }
    return { title: 'Request failed', message: fallback };
}

async function lookupMeter() {
    if (!meterId.value.trim()) return;
    loading.value = true; error.value = null; notice.value = null;
    try {
        const r = await api.post<{ meter: MeterInfo; preview: Preview }>('/api/v1/vendor/vend/preview', {
            meterId: meterId.value.trim(),
            amountMinor: 100000,
        });
        meter.value = r.meter;
        step.value = 'amount';
    } catch (e: any) {
        error.value = describeApiError(e, e?.message ?? 'Meter lookup failed');
    } finally {
        loading.value = false;
    }
}

async function loadPreview() {
    if (!meter.value) return;
    loading.value = true; error.value = null; notice.value = null;
    try {
        const r = await api.post<{ meter: MeterInfo; preview: Preview }>('/api/v1/vendor/vend/preview', {
            meterId: meter.value.meterId,
            amountMinor: amountMinor.value,
        });
        preview.value = r.preview;
        step.value = 'preview';
    } catch (e: any) {
        error.value = describeApiError(e, e?.message ?? 'Preview failed');
    } finally {
        loading.value = false;
    }
}

async function confirm() {
    if (!meter.value || !preview.value) return;
    if (!canVend.value) {
        error.value = {
            title: 'Live vend blocked for safety',
            message: 'This meter must be live-verified or locally bound before token generation.',
            action: 'No wallet debit or vend was attempted.',
            code: 'meter_requires_live_binding',
        };
        return;
    }
    authError.value = '';
    authOpen.value = true;
}

async function submitAuthorization() {
    if (!meter.value || !preview.value || !authorization.value) return;
    loading.value = true; error.value = null; notice.value = null;
    authError.value = '';
    try {
        const r = await api.post<{ token: string | null; units: number; receiptId: string | null; purchaseOrder: any }>(
            '/api/v1/vendor/vend',
            {
                meterId: meter.value.meterId,
                amountMinor: amountMinor.value,
                mode: 'wallet',
                authorization: authorization.value,
            },
        );
        result.value = r;
        notice.value = {
            tone: 'success',
            title: 'Token generated successfully',
            message: 'Receipt is ready. Copy, download, view, or remote send now.',
        };
        authorization.value = '';
        authOpen.value = false;
        step.value = 'success';
    } catch (e: any) {
        if (e instanceof ApiError && e.code === 'vend_credential_required') {
            authOpen.value = false;
            authorization.value = '';
            await router.push({ path: '/vend-access', query: { redirect: route.fullPath } });
            return;
        }
        if (e instanceof ApiError && e.code === 'invalid_vend_credential') {
            authError.value = 'Invalid vendor authorization.';
            return;
        }
        error.value = describeApiError(e, e?.message ?? 'Vending failed');
    } finally {
        loading.value = false;
    }
}

function reset() {
    step.value = 'meter';
    meterId.value = '';
    amountNaira.value = 2000;
    meter.value = null;
    preview.value = null;
    result.value = null;
    error.value = null;
    notice.value = null;
    copied.value = false;
    remoteSending.value = false;
}

async function copyToken() {
    if (!result.value?.token) return;
    try {
        await navigator.clipboard.writeText(result.value.token);
        copied.value = true;
        notice.value = { tone: 'success', title: 'Token copied', message: 'Paste it into the meter keypad when needed.' };
        window.setTimeout(() => { copied.value = false; }, 1800);
    } catch {
        notice.value = { tone: 'danger', title: 'Copy failed', message: 'Select the token and copy it manually.' };
    }
}

function resultReceiptRow() {
    if (!result.value) return null;
    return {
        ...(result.value.purchaseOrder ?? {}),
        token: result.value.token,
        units_kwh: result.value.units,
        receipt_id: result.value.receiptId,
        purchase_order_id: result.value.purchaseOrder?.id,
        amount_minor: result.value.purchaseOrder?.amount_minor ?? preview.value?.amountMinor,
        energy_amount_minor: result.value.purchaseOrder?.energy_amount_minor ?? preview.value?.energyAmountMinor,
        vat_amount_minor: result.value.purchaseOrder?.vat_amount_minor ?? preview.value?.taxAmountMinor,
        vat_rate_basis_points: result.value.purchaseOrder?.vat_rate_basis_points ?? preview.value?.vatRateBasisPoints,
        customer_name: result.value.purchaseOrder?.customer_name ?? meter.value?.customerName,
        meter_id: result.value.purchaseOrder?.meter_id ?? meter.value?.meterId,
        meter_type: result.value.purchaseOrder?.meter_type ?? (meter.value?.isThreePhase ? 'three_phase' : 'single_phase'),
        station_id: result.value.purchaseOrder?.station_id ?? meter.value?.stationId,
    };
}

function viewResultReceipt() {
    const row = resultReceiptRow();
    if (row) viewReceipt(purchaseReceipt(row));
}

function printResultReceipt() {
    const row = resultReceiptRow();
    if (row) printReceipt(purchaseReceipt(row));
}

function downloadResultReceipt() {
    const row = resultReceiptRow();
    if (row) downloadReceipt(purchaseReceipt(row));
}

async function remoteSendGeneratedToken() {
    const current = result.value;
    const orderId = current?.purchaseOrder?.id;
    if (!orderId) return;
    remoteSending.value = true;
    error.value = null;
    notice.value = {
        tone: 'info',
        title: ['remote_send_pending', 'remote_send_pending_review'].includes(remoteState.value) ? 'Checking remote delivery' : 'Remote send started',
        message: ['remote_send_pending', 'remote_send_pending_review'].includes(remoteState.value)
            ? 'Beverly is checking the meter delivery status now.'
            : 'Beverly is sending this token to the meter now.',
    };
    try {
        const response = await api.post<{
            remoteTaskId: string;
            status: 'pending' | 'success' | 'failed' | 'unknown';
            deliveryState: string;
            remark?: string | null;
            purchaseOrder?: any;
        }>(`/api/v1/vendor/vend/${orderId}/remote-send`, {});
        result.value = {
            ...current,
            purchaseOrder: {
                ...current.purchaseOrder,
                ...(response.purchaseOrder ?? {}),
                remote_task_id: response.remoteTaskId,
                delivery_state: response.deliveryState,
            },
        };
        if (response.status === 'success') {
            notice.value = { tone: 'success', title: 'Remote send delivered', message: 'The meter accepted the generated token.' };
            showResultPopup('success', 'Remote send delivered', 'The meter accepted the generated token.');
            return;
        }
        const followUpTitle = response.status === 'failed' ? 'Remote send needs manual entry' : response.status === 'unknown' ? 'Remote status unknown' : 'Remote delivery needs review';
        const followUpMessage = response.remark || 'The token remains visible for manual entry if needed.';
        notice.value = {
            tone: response.status === 'failed' ? 'danger' : 'info',
            title: followUpTitle,
            message: followUpMessage,
        };
        showResultPopup(response.status === 'failed' ? 'danger' : 'info', followUpTitle, followUpMessage);
    } catch (e: any) {
        const details = describeApiError(e, e?.message ?? 'Remote send failed');
        notice.value = {
            tone: 'danger',
            title: details.title,
            message: `${details.message}${details.action ? ` ${details.action}` : ''}`,
            code: details.code,
        };
        showResultPopup('danger', details.title, `${details.message}${details.action ? ` ${details.action}` : ''}`);
    } finally {
        remoteSending.value = false;
    }
}
</script>

<template>
  <AppShell title="Buy Token">
    <div class="vend-page">
      <div class="vend-flow" aria-label="Vending progress">
        <div v-for="item in flowSteps" :key="item.label" :class="['vend-flow-step', { active: item.active, done: item.done }]">
          <span></span>
          <strong>{{ item.label }}</strong>
        </div>
      </div>

      <Transition name="step-anim" mode="out-in">
      <!-- Step: meter lookup -->
      <div v-if="step === 'meter'" key="meter" class="bw-card">
        <h1 class="bw-h1">Vend electricity</h1>
        <p class="bw-muted" style="margin: 0 0 var(--s-5)">Enter the customer's meter number to begin.</p>
        <label class="bw-label">Meter number</label>
        <input class="bw-input bw-mono" inputmode="numeric"
               v-model="meterId" @keyup.enter="lookupMeter"
               placeholder="44120…" autofocus />
        <div v-if="error" class="bw-alert danger" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>{{ error.title }}</strong>
          <span>{{ error.message }}</span>
          <small v-if="error.action" class="bw-muted">{{ error.action }}</small>
          <small v-if="error.code" class="bw-mono">Code: {{ error.code }}</small>
        </div>
        <button class="bw-btn primary" style="margin-top: var(--s-4); width: 100%; justify-content: center; height: 44px"
                @click="lookupMeter" :disabled="loading || !meterId.trim()">
          {{ loading ? 'Looking up…' : 'Continue' }}
        </button>
      </div>

      <!-- Step: amount -->
      <div v-else-if="step === 'amount'" key="amount" class="bw-card">
        <button class="bw-btn sm" style="margin-bottom: var(--s-4)" @click="step = 'meter'">← Back</button>
        <section class="bw-recharge-summary" aria-label="Selected meter">
          <div><span>Customer</span><strong>{{ meter?.customerName }}</strong></div>
          <div><span>Meter</span><strong class="bw-mono">{{ meter?.meterId }}</strong></div>
          <div><span>Tariff</span><strong>{{ meter?.tariffId }}</strong></div>
          <div><span>Station</span><strong>{{ meter?.stationId }}</strong></div>
          <div><span>Phase</span><strong>{{ meterTypeLabel(meter?.isThreePhase) }}</strong></div>
        </section>

        <div v-if="!canVend" class="bw-alert" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>Preview-only meter metadata</strong>
          <span>This meter was resolved from archived read-only records, not the live account catalog. Bind or confirm it live before taking payment.</span>
          <small v-if="meter?.resolutionSource" class="bw-mono">Source: {{ meter.resolutionSource }}</small>
        </div>

        <div style="margin-top: var(--s-5)">
          <label class="bw-label">Energy amount (₦)</label>
          <input class="bw-input bw-mono" type="number" min="100" step="100" v-model.number="amountNaira" style="font-size: var(--t-xl)" />
          <div class="bw-recharge-quick-grid" style="margin-top: var(--s-3)">
            <button v-for="n in [1000, 2000, 5000, 10000, 25000]" :key="n"
                    class="bw-btn sm" @click="amountNaira = n">₦{{ n.toLocaleString() }}</button>
          </div>
        </div>

        <div v-if="error" class="bw-alert danger" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>{{ error.title }}</strong>
          <span>{{ error.message }}</span>
          <small v-if="error.action" class="bw-muted">{{ error.action }}</small>
          <small v-if="error.code" class="bw-mono">Code: {{ error.code }}</small>
        </div>
        <button class="bw-btn primary" style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 44px"
                @click="loadPreview" :disabled="loading || amountNaira < 100">
          {{ loading ? 'Calculating…' : 'Preview' }}
        </button>
      </div>

      <!-- Step: preview / confirm -->
      <div v-else-if="step === 'preview'" key="preview" class="bw-card vend-preview-card">
        <button class="bw-btn sm" style="margin-bottom: var(--s-4)" @click="step = 'amount'">← Back</button>
        <p class="bw-label">Confirm purchase</p>
        <h2 class="bw-h2 bw-mono" style="font-size: var(--t-3xl); margin: 0">{{ naira(preview?.amountMinor) }}</h2>
        <p class="bw-muted bw-mono">{{ kwh(preview?.units) }} @ ₦{{ preview?.effectivePricePerKwh.toFixed(2) }}/kWh</p>

        <div style="border-top: 1px solid var(--border); margin-top: var(--s-4); padding-top: var(--s-4); display: grid; gap: var(--s-2)">
          <div class="bw-row"><span class="bw-muted">Amount paid</span><span class="bw-spacer"></span><strong>{{ naira(preview?.amountMinor) }}</strong></div>
          <div class="bw-row"><span class="bw-muted">Energy value</span><span class="bw-spacer"></span><strong>{{ naira(preview?.energyAmountMinor) }}</strong></div>
          <div class="bw-row"><span class="bw-muted">VAT ({{ Number(preview?.vatRateBasisPoints ?? 0) / 100 }}%)</span><span class="bw-spacer"></span><strong>{{ naira(preview?.taxAmountMinor) }}</strong></div>
          <div class="bw-row"><span class="bw-muted">Customer</span><span class="bw-spacer"></span><strong>{{ meter?.customerName }}</strong></div>
          <div class="bw-row"><span class="bw-muted">Meter</span><span class="bw-spacer"></span><span class="bw-mono">{{ meter?.meterId }}</span></div>
          <div class="bw-row"><span class="bw-muted">Phase</span><span class="bw-spacer"></span><span>{{ meterTypeLabel(meter?.isThreePhase) }}</span></div>
          <div class="bw-row"><span class="bw-muted">Station</span><span class="bw-spacer"></span><span>{{ meter?.stationId }}</span></div>
          <div class="bw-row"><span class="bw-muted">Tariff</span><span class="bw-spacer"></span><span>{{ meter?.tariffId }}</span></div>
        </div>
        <div v-if="!canVend" class="bw-alert" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>Live vend blocked for safety</strong>
          <span>This preview is allowed, but token generation is blocked until the meter is live-verified or locally bound.</span>
        </div>

        <div v-if="error" class="bw-alert danger" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>{{ error.title }}</strong>
          <span>{{ error.message }}</span>
          <small v-if="error.action" class="bw-muted">{{ error.action }}</small>
          <small v-if="error.code" class="bw-mono">Code: {{ error.code }}</small>
        </div>
        <button class="bw-btn primary" style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 44px"
                @click="confirm" :disabled="loading || !canVend">
          {{ confirmLabel }}
        </button>
      </div>

      <!-- Step: success / receipt -->
      <div v-else-if="step === 'success'" key="success" class="bw-stack">
        <div v-if="notice" :class="['bw-alert', notice.tone === 'danger' ? 'danger' : '']" style="display: grid; gap: 6px">
          <strong>{{ notice.title }}</strong>
          <span>{{ notice.message }}</span>
          <small v-if="notice.code" class="bw-mono">Code: {{ notice.code }}</small>
        </div>
        <div class="bw-token-box">
          <p class="bw-label" style="color: var(--brand)">Token generated</p>
          <p class="bw-token-value">{{ result?.token }}</p>
          <p class="bw-muted bw-mono" style="font-size: var(--t-sm)">{{ kwh(result?.units) }} · {{ naira(preview?.amountMinor) }}</p>
          <button class="bw-btn" @click="copyToken" style="margin-top: var(--s-4)">{{ copied ? 'Copied' : 'Copy token' }}</button>
        </div>
        <div class="bw-card">
          <div class="bw-row"><span class="bw-muted">Customer</span><span class="bw-spacer"></span><strong>{{ meter?.customerName }}</strong></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">Meter</span><span class="bw-spacer"></span><span class="bw-mono">{{ meter?.meterId }}</span></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">Phase</span><span class="bw-spacer"></span><span>{{ meterTypeLabel(meter?.isThreePhase) }}</span></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">Amount</span><span class="bw-spacer"></span><strong>{{ naira(preview?.amountMinor) }}</strong></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">Remote state</span><span class="bw-spacer"></span><strong>{{ remoteState.replace(/_/g, ' ') }}</strong></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">Order</span><span class="bw-spacer"></span><span class="bw-mono">#{{ String(result?.purchaseOrder?.id).slice(0, 8) }}</span></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">Energy value</span><span class="bw-spacer"></span><strong>{{ naira(result?.purchaseOrder?.energy_amount_minor ?? preview?.energyAmountMinor) }}</strong></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">VAT ({{ Number(result?.purchaseOrder?.vat_rate_basis_points ?? preview?.vatRateBasisPoints ?? 0) / 100 }}%)</span><span class="bw-spacer"></span><strong>{{ naira(result?.purchaseOrder?.vat_amount_minor ?? preview?.taxAmountMinor) }}</strong></div>
        </div>
        <div class="vend-actions">
          <button class="bw-btn primary" @click="remoteSendGeneratedToken" :disabled="!canRemoteSendToken">
            {{ remoteSendLabel }}
          </button>
          <button class="bw-btn" @click="downloadResultReceipt">Download receipt</button>
          <button class="bw-btn" style="flex:1; justify-content:center" @click="viewResultReceipt">View receipt</button>
          <button class="bw-btn" style="flex:1; justify-content:center" @click="printResultReceipt">Print receipt</button>
        </div>
        <button class="bw-btn primary" style="justify-content: center; height: 44px" @click="reset">New vend</button>
      </div>
      </Transition>
    </div>

    <StatusPopup
      :open="Boolean(resultPopup)"
      :tone="resultPopup?.tone ?? 'info'"
      :title="resultPopup?.title ?? ''"
      :message="resultPopup?.message ?? ''"
      @update:open="(v) => { if (!v) resultPopup = null; }"
    />

    <ConfirmDialog
      v-model:open="authOpen"
      title="Authorize credit token"
      description="Enter your vendor PIN or password. Beverly never shows the energy authorization password."
      confirm-label="Generate token"
      tone="warn"
      :loading="loading"
      :disable-confirm="!authorization"
      @confirm="submitAuthorization"
    >
      <label class="bw-label">Vendor authorization</label>
      <input
        class="bw-input bw-mono cd-input-target"
        v-model="authorization"
        type="password"
        autocomplete="off"
        placeholder="PIN or password"
      />
      <p v-if="authError" class="bw-alert danger" style="margin-top: var(--s-2)">
        {{ authError }}
      </p>
      <p class="bw-muted" style="font-size: var(--t-xs); margin-top: var(--s-2)">
        This confirms the wallet debit.
      </p>
    </ConfirmDialog>
  </AppShell>
</template>

<style scoped>
.vend-page {
  width: 100%;
  max-width: 560px;
  min-width: 0;
  margin-inline: auto;
  position: relative;
}

.vend-preview-card .bw-row { min-width: 0; gap: var(--s-2); }
.vend-preview-card .bw-row > :last-child {
  min-width: 0;
  max-width: 60%;
  overflow-wrap: anywhere;
  text-align: right;
}

.vend-flow {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: var(--s-4);
}

.vend-flow-step {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  padding: 8px 9px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--surface) 78%, transparent);
  color: var(--text-muted);
  transition: color var(--dur-base, 0.22s) var(--ease-out, ease),
              border-color var(--dur-base, 0.22s) var(--ease-out, ease),
              background var(--dur-base, 0.22s) var(--ease-out, ease);
}

.vend-flow-step span {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: currentColor;
  transition: transform var(--dur-fast, 0.14s) var(--ease-spring, ease), background var(--dur-base, 0.22s) var(--ease-out, ease);
}

.vend-flow-step.active span {
  transform: scale(1.3);
}

.vend-flow-step strong {
  min-width: 0;
  font-size: var(--t-xs);
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vend-flow-step.active,
.vend-flow-step.done {
  color: var(--brand);
  border-color: color-mix(in srgb, var(--brand) 40%, transparent);
  background: color-mix(in srgb, var(--brand) 12%, var(--surface));
}

.vend-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
}

.vend-actions .bw-btn {
  min-width: 0;
  justify-content: center;
}

.bw-token-box {
  position: relative;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--brand) 35%, transparent);
  background:
    radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--brand) 18%, transparent), transparent 62%),
    linear-gradient(145deg, color-mix(in srgb, var(--surface) 90%, #0d3b2a), var(--surface));
}

.bw-token-box::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--brand), transparent);
}

.step-anim-enter-active {
  transition: opacity 0.26s var(--ease-out, ease), transform 0.26s var(--ease-out, ease);
}
.step-anim-leave-active {
  transition: opacity 0.16s var(--ease-out, ease), transform 0.16s var(--ease-out, ease);
  position: absolute;
  inset-inline: 0;
}
.step-anim-enter-from {
  opacity: 0;
  transform: translateX(18px);
}
.step-anim-leave-to {
  opacity: 0;
  transform: translateX(-18px);
}

@media (prefers-reduced-motion: reduce) {
  .step-anim-enter-active,
  .step-anim-leave-active,
  .vend-flow-step,
  .vend-flow-step span {
    transition: none !important;
  }
}

@media (max-width: 520px) {
  .vend-page {
    max-width: none;
    margin-inline: 0;
  }

  .vend-flow {
    gap: 6px;
  }

  .vend-flow-step {
    grid-template-columns: 1fr;
    justify-items: center;
    padding: 8px 4px;
  }

  .vend-actions {
    grid-template-columns: 1fr;
  }
}
</style>
