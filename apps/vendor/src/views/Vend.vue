<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import StatusPopup from '../components/StatusPopup.vue';
import RemoteSendTrackerModal from '@beverly/tokens/RemoteSendTrackerModal.vue';
import { api, ApiError, idempotencyHeaders, newIdempotencyKey } from '../lib/api';
import { naira, kwh } from '../lib/format';
import { downloadReceipt, purchaseReceipt, viewReceipt } from '../lib/receipts';

type Step = 'meter' | 'amount' | 'preview' | 'success';

const step = ref<Step>('meter');
const meterId = ref('');
const amountNaira = ref(2000);
const loading = ref(false);
const error = ref<{ title: string; message: string; action?: string; code?: string } | null>(null);
const notice = ref<{ tone: 'success' | 'info' | 'danger'; title: string; message: string; code?: string } | null>(null);
const remoteSending = ref(false);
const remoteTrackerOpen = ref(false);
const copied = ref(false);
const resultPopup = ref<{ tone: 'success' | 'danger' | 'info'; title: string; message: string } | null>(null);
const vendIntentKey = ref(newIdempotencyKey());
const vendIntentFingerprint = ref('');

async function fetchRemoteSendStatus(endpoint: string) {
    return await api.get<any>(endpoint);
}

function showResultPopup(tone: 'success' | 'danger' | 'info', title: string, message: string) {
    resultPopup.value = { tone, title, message };
}
const authOpen = ref(false);
const authorization = ref('');
const authError = ref('');
const router = useRouter();
const route = useRoute();

// ── PIN brute-force lockout ────────────────────────────────────────
const MAX_PIN_ATTEMPTS = 3;
const LOCKOUT_MS = 30_000;
const pinAttempts = ref(0);
const lockedUntil = ref(0);
const now = ref(Date.now());
let lockTimer: number | undefined;
const isLocked = computed(() => lockedUntil.value > now.value);
const lockSecondsLeft = computed(() => Math.max(0, Math.ceil((lockedUntil.value - now.value) / 1000)));

function tickLock() {
    now.value = Date.now();
    if (lockedUntil.value > now.value) {
        lockTimer = window.setTimeout(tickLock, 500);
    } else {
        lockTimer = undefined;
    }
}

function registerFailedAttempt() {
    pinAttempts.value += 1;
    if (pinAttempts.value >= MAX_PIN_ATTEMPTS) {
        lockedUntil.value = Date.now() + LOCKOUT_MS;
        pinAttempts.value = 0;
        if (!lockTimer) tickLock();
    }
}

function registerSuccessfulAttempt() {
    pinAttempts.value = 0;
}

// ── In-flight vend recovery ─────────────────────────────────────────
// A network drop between "confirm" and the response must not strand the
// vendor without their token — the idempotency key + fingerprint let a
// retried POST safely replay the original result instead of double-vending.
const PENDING_VEND_KEY = 'beverly.vend.pending';
const PENDING_MAX_AGE_MS = 30 * 60_000;
interface PendingVend { key: string; fingerprint: string; meterId: string; amountMinor: number; savedAt: number; }
const recoverableVend = ref<PendingVend | null>(null);
const recovering = ref(false);

function savePendingVend() {
    if (!meter.value) return;
    try {
        const pending: PendingVend = {
            key: vendIntentKey.value,
            fingerprint: vendIntentFingerprint.value,
            meterId: meter.value.meterId,
            amountMinor: amountMinor.value,
            savedAt: Date.now(),
        };
        localStorage.setItem(PENDING_VEND_KEY, JSON.stringify(pending));
    } catch { /* storage unavailable */ }
}

function clearPendingVend() {
    try { localStorage.removeItem(PENDING_VEND_KEY); } catch { /* noop */ }
    recoverableVend.value = null;
}

onMounted(() => {
    try {
        const raw = localStorage.getItem(PENDING_VEND_KEY);
        if (!raw) return;
        const pending: PendingVend = JSON.parse(raw);
        if (Date.now() - pending.savedAt > PENDING_MAX_AGE_MS) {
            localStorage.removeItem(PENDING_VEND_KEY);
            return;
        }
        recoverableVend.value = pending;
    } catch { /* malformed — ignore */ }
});

function resumePendingVend() {
    if (!recoverableVend.value) return;
    recovering.value = true;
    meterId.value = recoverableVend.value.meterId;
    step.value = 'meter';
    void lookupMeter().then(() => {
        if (!recoverableVend.value || !meter.value) { recovering.value = false; return; }
        amountNaira.value = recoverableVend.value.amountMinor / 100;
        vendIntentKey.value = recoverableVend.value.key;
        vendIntentFingerprint.value = recoverableVend.value.fingerprint;
        return loadPreview().then(() => {
            authError.value = '';
            authOpen.value = true;
            recovering.value = false;
        });
    });
}

function dismissRecoverableVend() {
    clearPendingVend();
}

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

const normalizedMeterId = computed(() => meterId.value.trim());
const meterIdValid = computed(() => normalizedMeterId.value.length >= 4 && normalizedMeterId.value.length <= 80);
const amountMinor = computed(() => Math.max(0, Math.round(amountNaira.value * 100)));
const canVend = computed(() => meter.value?.liveVerified !== false);
const vendingConfigurationBlocked = computed(() => [
    'energy_authorization_missing',
    'energy_authorization_misconfigured',
    'energy_authorization_rejected',
].includes(String(error.value?.code ?? '')));
const remoteState = computed(() => String(result.value?.purchaseOrder?.delivery_state ?? 'token_generated'));
const tokenGroups = computed(() => String(result.value?.token ?? '').trim().split(/\s+/).filter(Boolean));
const showReceiptNotice = computed(() => Boolean(notice.value && notice.value.title !== 'Token generated successfully'));
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
    { label: 'Meter', icon: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M7 7h10v4H7z', 'm13 13-3 4h3l-2 3'], active: step.value === 'meter', done: ['amount', 'preview', 'success'].includes(step.value) },
    { label: 'Amount', icon: ['M3 6h18v12H3z', 'M7 9.5h4.5a2.5 2.5 0 0 1 0 5H7', 'M9 8v8'], active: step.value === 'amount', done: ['preview', 'success'].includes(step.value) },
    { label: 'Confirm', icon: ['M12 3 4.5 6v5.5c0 4.7 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.8 7.5-9.5V6L12 3Z', 'm8.5 12 2.2 2.2 4.8-5'], active: step.value === 'preview', done: step.value === 'success' },
    { label: 'Receipt', icon: ['M6 3h12v18l-3-2-3 2-3-2-3 2V3Z', 'M9 8h6', 'M9 12h6', 'M9 16h4'], active: step.value === 'success', done: false },
]);
const confirmLabel = computed(() => {
    if (loading.value) return 'Generating token...';
    if (vendingConfigurationBlocked.value) return 'Vending unavailable';
    if (!canVend.value) return 'Bind meter before vend';
    return `Confirm - ${naira(preview.value?.amountMinor)}`;
});

function meterTypeLabel(isThreePhase?: boolean | null) {
    return isThreePhase ? 'Three Phase' : 'Single Phase';
}

function isMeterOfflineError(code: unknown, message: unknown) {
    if (code === 'meter_offline') return true;
    const normalized = String(message ?? '').toLowerCase();
    return /meter\s*(?:no\.?\s*)?\(?[a-z0-9-]+\)?\s+is\s+offline/.test(normalized)
        || /reading\s+fail/.test(normalized)
        || /meter[^.]{0,80}(?:offline|not\s+online|unreachable)/.test(normalized);
}

function describeApiError(e: unknown, fallback: string) {
    if (e instanceof ApiError) {
        if (isMeterOfflineError(e.code, e.message)) {
            return {
                title: 'Meter currently offline',
                message: 'The meter cannot receive remote commands right now.',
                action: 'The token remains valid. Enter it manually, or retry after the meter reconnects.',
                code: 'meter_offline',
            };
        }
        if (e.code === 'vend_credential_required') {
            return {
                title: 'Vendor authorization required',
                message: e.message,
                action: 'Create your four-digit vending PIN, then retry.',
                code: e.code,
            };
        }
        if (e.code === 'invalid_vend_credential') {
            return {
                title: 'Invalid authorization',
                message: e.message,
                action: 'Enter your four-digit vending PIN.',
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
        if (['energy_authorization_missing', 'energy_authorization_misconfigured', 'energy_authorization_rejected'].includes(String(e.code))) {
            return {
                title: 'Vending temporarily unavailable',
                message: e.message,
                action: 'No wallet hold, debit, or token request occurred. Contact Beverly support.',
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
        if (e.code === 'station_assignment_required') {
            return {
                title: 'Station not assigned',
                message: 'Your account does not have a vending station assigned.',
                action: 'Contact your Beverly administrator to assign a station to your account before you can vend.',
                code: e.code,
            };
        }
        if (e.code === 'cross_station_vend_forbidden') {
            return {
                title: 'Station mismatch',
                message: e.message,
                action: 'You can only vend meters that belong to your assigned station. Contact support if this is incorrect.',
                code: e.code,
            };
        }
        if (e.code === 'meter_station_unavailable') {
            return {
                title: 'Meter station unavailable',
                message: e.message,
                action: 'The meter\'s station could not be verified. Ask an admin to check the meter binding.',
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
    if (!meterIdValid.value) {
        error.value = {
            title: 'Check meter number',
            message: 'Enter at least 4 characters.',
            action: 'No meter lookup was attempted.',
        };
        return;
    }
    loading.value = true; error.value = null; notice.value = null;
    try {
        const r = await api.post<{ meter: MeterInfo; preview: Preview }>('/api/v1/vendor/vend/preview', {
            meterId: normalizedMeterId.value,
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
    if (!meter.value || !preview.value || !/^\d{4}$/.test(authorization.value) || loading.value) return;
    if (isLocked.value) {
        authError.value = `Too many incorrect attempts. Try again in ${lockSecondsLeft.value}s.`;
        return;
    }
    loading.value = true; error.value = null; notice.value = null;
    authError.value = '';
    const fingerprint = `${meter.value.meterId}:${amountMinor.value}:wallet`;
    if (vendIntentFingerprint.value !== fingerprint) {
        vendIntentKey.value = newIdempotencyKey();
        vendIntentFingerprint.value = fingerprint;
    }
    savePendingVend();
    try {
        const r = await api.post<{ token: string | null; units: number; receiptId: string | null; purchaseOrder: any }>(
            '/api/v1/vendor/vend',
            {
                meterId: meter.value.meterId,
                amountMinor: amountMinor.value,
                mode: 'wallet',
                authorization: authorization.value,
            },
            idempotencyHeaders(vendIntentKey.value),
        );
        result.value = r;
        registerSuccessfulAttempt();
        clearPendingVend();
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
            registerFailedAttempt();
            authError.value = isLocked.value
                ? `Too many incorrect attempts. Try again in ${lockSecondsLeft.value}s.`
                : 'Invalid vendor authorization.';
            return;
        }
        if (e instanceof ApiError) {
            // A definitive server response means this vend will not retry-succeed with the same key.
            clearPendingVend();
        }
        error.value = describeApiError(e, e?.message ?? 'Vending failed');
    } finally {
        loading.value = false;
    }
}

function reset() {
    clearPendingVend();
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
    vendIntentKey.value = newIdempotencyKey();
    vendIntentFingerprint.value = '';
}

async function copyToken() {
    if (!result.value?.token) return;
    try {
        await navigator.clipboard.writeText(result.value.token);
        copied.value = true;
        window.setTimeout(() => {
            copied.value = false;
        }, 1800);
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

function downloadResultReceipt() {
    const row = resultReceiptRow();
    if (row) downloadReceipt(purchaseReceipt(row));
}

async function remoteSendGeneratedToken() {
    const current = result.value;
    const orderId = current?.purchaseOrder?.id;
    if (!orderId) return;
    remoteSending.value = true;
    remoteTrackerOpen.value = true;
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
        const errCode = e?.code || 'remote_send_failed';
        const errMsg = e?.message ?? 'Remote send failed';
        const meterOffline = errCode === 'meter_offline';
        notice.value = {
            tone: meterOffline ? 'info' : 'danger',
            title: 'Remote send issue',
            message: errMsg,
            code: errCode,
        };
        showResultPopup(meterOffline ? 'info' : 'danger', 'Remote send issue', errMsg);
    } finally {
        remoteSending.value = false;
    }
}
</script>

<template>
  <AppShell title="Buy Token">
    <div class="vend-page">
      <ol class="vend-flow" aria-label="Vending progress">
        <li v-for="item in flowSteps" :key="item.label" :class="['vend-flow-step', { active: item.active, done: item.done }]" :aria-current="item.active ? 'step' : undefined">
          <svg class="vend-flow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path v-for="path in item.icon" :key="path" :d="path" />
          </svg>
          <strong>{{ item.label }}</strong>
        </li>
      </ol>

      <div v-if="recoverableVend" class="bw-alert" style="margin-bottom: var(--s-3); display: grid; gap: 6px">
        <strong>Unfinished vend from earlier</strong>
        <span>A vend for meter {{ recoverableVend.meterId }} ({{ naira(recoverableVend.amountMinor) }}) did not confirm. No wallet debit was confirmed on this device — check its status before retrying.</span>
        <div style="display:flex; gap: var(--s-2)">
          <button class="bw-btn primary sm" :disabled="recovering" @click="resumePendingVend">
            {{ recovering ? 'Checking…' : 'Check in-flight vend' }}
          </button>
          <button class="bw-btn sm" @click="dismissRecoverableVend">Dismiss</button>
        </div>
      </div>

      <Transition name="step-anim" mode="out-in">
      <!-- Step: meter lookup -->
      <form v-if="step === 'meter'" key="meter" class="bw-card" @submit.prevent="lookupMeter">
        <h1 class="bw-h1">Vend electricity</h1>
        <p class="bw-muted" style="margin: 0 0 var(--s-5)">Enter the customer's meter number to begin.</p>
        <label class="bw-label" for="vend-meter-id">Meter number</label>
        <input id="vend-meter-id" class="bw-input bw-mono" inputmode="numeric"
               v-model="meterId" minlength="4" maxlength="80" autocomplete="off"
               aria-describedby="vend-meter-help vend-meter-error"
               :aria-invalid="Boolean(error)"
               placeholder="44120…" autofocus />
        <small id="vend-meter-help" class="bw-muted">Use at least 4 characters.</small>
        <div v-if="error" id="vend-meter-error" class="bw-alert danger" role="alert" aria-live="polite" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>{{ error.title }}</strong>
          <span>{{ error.message }}</span>
          <small v-if="error.action" class="bw-muted">{{ error.action }}</small>
          <small v-if="error.code" class="bw-mono">Code: {{ error.code }}</small>
        </div>
        <button type="submit" class="bw-btn primary" style="margin-top: var(--s-4); width: 100%; justify-content: center; height: 44px"
                :disabled="loading || !meterIdValid" :aria-busy="loading">
          {{ loading ? 'Looking up…' : 'Continue' }}
        </button>
      </form>

      <!-- Step: amount -->
      <div v-else-if="step === 'amount'" key="amount" class="bw-card">
        <button type="button" class="bw-btn sm" style="margin-bottom: var(--s-4)" @click="step = 'meter'">← Back</button>
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
          <label class="bw-label" for="vend-amount">Energy amount (₦)</label>
          <input id="vend-amount" class="bw-input bw-mono" type="number" min="100" step="100" v-model.number="amountNaira" style="font-size: var(--t-xl)" />
          <div class="bw-recharge-quick-grid" style="margin-top: var(--s-3)">
            <button v-for="n in [1000, 2000, 5000, 10000, 25000]" :key="n" type="button"
                    class="bw-btn sm" @click="amountNaira = n">₦{{ n.toLocaleString() }}</button>
          </div>
        </div>

        <div v-if="error" class="bw-alert danger" role="alert" aria-live="polite" style="margin-top: var(--s-3); display: grid; gap: 6px">
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
                @click="confirm" :disabled="loading || !canVend || vendingConfigurationBlocked">
          {{ confirmLabel }}
        </button>
      </div>

      <!-- Step: success / receipt -->
      <div v-else-if="step === 'success'" key="success" class="bw-stack vend-success">
        <div v-if="showReceiptNotice" :class="['bw-alert', notice?.tone === 'danger' ? 'danger' : notice?.tone === 'info' ? 'info' : 'success']" style="display: grid; gap: 6px">
          <strong>{{ notice?.title }}</strong>
          <span>{{ notice?.message }}</span>
          <small v-if="notice?.code" class="bw-mono">Code: {{ notice.code }}</small>
        </div>
        <section class="bw-token-box" aria-labelledby="vend-token-title">
          <div class="token-ready-row">
            <div>
              <p class="token-eyebrow">Credit token</p>
              <h1 id="vend-token-title">Token ready</h1>
            </div>
            <span class="token-ready-badge"><span aria-hidden="true"></span>Generated</span>
          </div>
          <p class="bw-token-value" :aria-label="`Token ${result?.token ?? ''}`">
            <span v-for="(group, index) in tokenGroups" :key="`${group}-${index}`">{{ group }}</span>
          </p>
          <div class="token-meta">
            <span>{{ kwh(result?.units) }}</span><span aria-hidden="true">·</span><strong>{{ naira(preview?.amountMinor) }}</strong>
          </div>
          <button class="bw-btn primary token-copy-btn" @click="copyToken" aria-live="polite">
            {{ copied ? 'Token copied' : 'Copy token' }}
          </button>
          <p class="token-help">Enter this token manually, or send it remotely.</p>
        </section>
        <section class="bw-card vend-receipt-summary" aria-labelledby="vend-receipt-title">
          <div class="receipt-summary-head">
            <div>
              <p class="token-eyebrow">Receipt details</p>
              <h2 id="vend-receipt-title">{{ meter?.customerName }}</h2>
            </div>
            <span class="receipt-state">{{ remoteState.replace(/_/g, ' ') }}</span>
          </div>
          <dl class="receipt-facts">
            <div><dt>Meter</dt><dd class="bw-mono">{{ meter?.meterId }}</dd></div>
            <div><dt>Amount</dt><dd>{{ naira(preview?.amountMinor) }}</dd></div>
            <div><dt>Phase</dt><dd>{{ meterTypeLabel(meter?.isThreePhase) }}</dd></div>
            <div><dt>Station</dt><dd>{{ meter?.stationId }}</dd></div>
            <div><dt>Energy value</dt><dd>{{ naira(result?.purchaseOrder?.energy_amount_minor ?? preview?.energyAmountMinor) }}</dd></div>
            <div><dt>VAT ({{ Number(result?.purchaseOrder?.vat_rate_basis_points ?? preview?.vatRateBasisPoints ?? 0) / 100 }}%)</dt><dd>{{ naira(result?.purchaseOrder?.vat_amount_minor ?? preview?.taxAmountMinor) }}</dd></div>
          </dl>
          <p class="receipt-order bw-mono">Order #{{ String(result?.purchaseOrder?.id).slice(0, 8) }}</p>
        </section>
        <div class="vend-action-grid">
          <button class="bw-btn primary action-remote" @click="remoteSendGeneratedToken" :disabled="!canRemoteSendToken">{{ remoteSendLabel }}</button>
          <button class="bw-btn" @click="downloadResultReceipt">Download receipt</button>
          <button class="bw-btn" @click="viewResultReceipt">View receipt</button>
          <button class="bw-btn action-new" @click="reset">New vend</button>
        </div>
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
      description="Enter your four-digit vending PIN."
      confirm-label="Generate token"
      tone="warn"
      :loading="loading"
      :disable-confirm="!/^\d{4}$/.test(authorization) || isLocked"
      @confirm="submitAuthorization"
    >
      <label class="bw-label" for="vend-authorization">Vendor authorization</label>
      <input
        id="vend-authorization"
        class="bw-input bw-mono cd-input-target"
        v-model="authorization"
        type="password"
        inputmode="numeric"
        maxlength="4"
        pattern="[0-9]{4}"
        autocomplete="one-time-code"
        :disabled="isLocked"
        :aria-invalid="Boolean(authError)"
        aria-describedby="vend-authorization-error"
        placeholder="••••"
      />
      <p v-if="isLocked" class="bw-alert danger" role="alert" style="margin-top: var(--s-2)">
        Too many incorrect attempts. Try again in {{ lockSecondsLeft }}s.
      </p>
      <p v-else-if="authError" id="vend-authorization-error" class="bw-alert danger" role="alert" style="margin-top: var(--s-2)">
        {{ authError }}
      </p>
      <p class="bw-muted" style="font-size: var(--t-xs); margin-top: var(--s-2)">
        This confirms the wallet debit.
      </p>
    </ConfirmDialog>

    <RemoteSendTrackerModal
      v-model:open="remoteTrackerOpen"
      :order-id="result?.purchaseOrder?.id"
      :meter-id="result?.purchaseOrder?.meter_id ?? meter?.meterId"
      :token="result?.token"
      :amount-minor="result?.purchaseOrder?.amount_minor ?? preview?.amountMinor"
      :units-kwh="result?.units"
      :customer-name="meter?.customerName"
      :delivery-state="result?.purchaseOrder?.delivery_state"
      :remote-task-id="result?.purchaseOrder?.remote_task_id"
      :api-endpoint="result?.purchaseOrder?.id ? `/api/v1/vendor/vend/${result.purchaseOrder.id}/remote-send` : null"
      :fetcher="fetchRemoteSendStatus"
      @updated="(res: any) => { if (res.purchaseOrder && result) result.purchaseOrder = { ...result.purchaseOrder, ...res.purchaseOrder }; }"
    />
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
  padding: 0;
  list-style: none;
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

.vend-flow-icon {
  width: 18px;
  height: 18px;
  flex: none;
  transition: transform var(--dur-fast, 0.14s) var(--ease-spring, ease);
}

.vend-flow-step.active .vend-flow-icon {
  transform: scale(1.08);
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

.vend-action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-2);
}

.vend-action-grid .bw-btn {
  min-width: 0;
  justify-content: center;
}

.action-remote,
.action-new { grid-column: 1 / -1; }

.bw-token-box {
  --token-ring-angle: 0deg;
  position: relative;
  overflow: hidden;
  padding: var(--s-5);
  border: 1px solid transparent;
  background:
    linear-gradient(var(--surface), var(--surface)) padding-box,
    conic-gradient(
      from var(--token-ring-angle),
      transparent 0 72%,
      color-mix(in srgb, var(--brand) 38%, transparent) 78%,
      var(--brand) 84%,
      transparent 92%
    ) border-box;
  animation: token-outline-orbit 3.2s linear infinite;
  text-align: left;
}

.token-ready-row,
.receipt-summary-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-3);
}

.token-eyebrow {
  margin: 0 0 4px;
  color: var(--brand);
  font-size: var(--t-xs);
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.token-ready-row h1,
.receipt-summary-head h2 {
  margin: 0;
  color: var(--text);
  font-size: var(--t-lg);
  line-height: 1.2;
}

.token-ready-badge,
.receipt-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 48%;
  padding: 5px 9px;
  border-radius: var(--r-full);
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  color: var(--brand);
  font-size: 10px;
  font-weight: 800;
  line-height: 1.2;
  text-align: right;
  text-transform: capitalize;
}

.token-ready-badge span {
  width: 6px;
  height: 6px;
  border-radius: var(--r-full);
  background: var(--brand);
  box-shadow: 0 0 12px var(--brand);
}

.bw-token-value {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 7px 13px;
  margin: var(--s-5) 0 var(--s-3);
  word-break: normal;
}

.bw-token-value span {
  font-size: clamp(1.2rem, 5.2vw, 1.75rem);
  letter-spacing: 0.1em;
  white-space: nowrap;
}

.token-meta {
  display: flex;
  justify-content: center;
  gap: var(--s-2);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
}

.token-meta strong { color: var(--text); }

.token-copy-btn {
  width: 100%;
  min-height: 42px;
  justify-content: center;
  margin-top: var(--s-4);
}

.token-help {
  margin: var(--s-2) 0 0;
  color: var(--text-muted);
  font-size: var(--t-xs);
  text-align: center;
}

.vend-receipt-summary { padding: var(--s-4); }
.receipt-summary-head { padding-bottom: var(--s-3); border-bottom: 1px solid var(--border); }
.receipt-state { color: var(--text-muted); background: var(--surface-2); }

.receipt-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
  margin: var(--s-3) 0 0;
}

.receipt-facts div { min-width: 0; }
.receipt-facts dt { color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.receipt-facts dd { margin: 3px 0 0; overflow-wrap: anywhere; color: var(--text); font-size: var(--t-sm); font-weight: 700; }
.receipt-order { margin: var(--s-3) 0 0; padding-top: var(--s-3); border-top: 1px solid var(--border); color: var(--text-muted); font-size: var(--t-xs); }

@property --token-ring-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

@keyframes token-outline-orbit {
  to { --token-ring-angle: 360deg; }
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
  .vend-flow-icon {
    transition: none !important;
  }
  .bw-token-box {
    animation: none;
    border-color: color-mix(in srgb, var(--brand) 48%, transparent);
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
    gap: 6px;
    padding: 9px 4px;
  }

  .vend-success { gap: var(--s-3); }
  .receipt-facts { gap: var(--s-2) var(--s-3); }
}
</style>
