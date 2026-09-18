<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import StatusPopup from '../components/StatusPopup.vue';
import RemoteSendTrackerModal from '@beverly/tokens/RemoteSendTrackerModal.vue';
import { api, ApiError } from '../lib/api';
import { naira, kwh } from '../lib/format';
import { downloadReceipt, purchaseReceipt, viewReceipt } from '../lib/receipts';

type Step = 'meter' | 'amount' | 'preview' | 'success' | 'failed';

const step = ref<Step>('meter');
const meterId = ref('');
const amountNaira = ref(2000);
const loading = ref(false);
const error = ref<{ title: string; message: string; action?: string; code?: string; reference?: string } | null>(null);
const authOpen = ref(false);
const authorization = ref('');
const authError = ref('');
const copied = ref(false);
const remoteTrackerOpen = ref(false);
const resultPopup = ref<{ tone: 'success' | 'danger' | 'info'; title: string; message: string } | null>(null);

interface FailedSendDetails {
    title?: string;
    message?: string;
    action?: string;
    code?: string;
    reference?: string;
    meterId?: string;
    customerName?: string;
    stationId?: string;
    amountMinor?: number;
    orderId?: string;
}
const failedSend = ref<FailedSendDetails | null>(null);

function showResultPopup(tone: 'success' | 'danger' | 'info', title: string, message: string) {
    resultPopup.value = { tone, title, message };
}
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

// ── Remote delivery auto-polling (exponential backoff) ─────────────
const polling = ref(false);
let pollTimer: number | undefined;
const POLL_DELAYS_MS = [2000, 3000, 5000, 8000, 13000]; // capped backoff, then stop

function stopPolling() {
    if (pollTimer) { window.clearTimeout(pollTimer); pollTimer = undefined; }
    polling.value = false;
}

function schedulePoll(attempt: number) {
    const orderId = result.value?.purchaseOrder?.id;
    if (!orderId) return;
    const state = String(result.value?.purchaseOrder?.delivery_state ?? result.value?.remoteSend?.deliveryState ?? '');
    if (!['remote_send_pending', 'remote_send_pending_review'].includes(state)) { stopPolling(); return; }
    if (attempt >= POLL_DELAYS_MS.length) { stopPolling(); return; }
    polling.value = true;
    pollTimer = window.setTimeout(() => pollDeliveryStatus(orderId, attempt), POLL_DELAYS_MS[attempt]);
}

async function pollDeliveryStatus(orderId: string, attempt: number) {
    try {
        const response = await api.post<{
            remoteTaskId: string;
            status: 'pending' | 'success' | 'failed' | 'unknown';
            deliveryState: string;
            remark?: string | null;
            purchaseOrder?: any;
        }>(`/api/v1/vendor/vend/${orderId}/remote-send`, {});
        if (result.value) {
            result.value = {
                ...result.value,
                purchaseOrder: { ...result.value.purchaseOrder, ...(response.purchaseOrder ?? {}), delivery_state: response.deliveryState },
                remoteSend: { status: response.status, deliveryState: response.deliveryState, remark: response.remark ?? null },
            };
        }
    } catch {
        // transient — keep backing off and retry
    } finally {
        schedulePoll(attempt + 1);
    }
}

interface MeterInfo {
    meterId: string;
    customerId: string;
    customerName: string;
    stationId: string;
    tariffId: string;
    protocolVersion?: string | null;
    isThreePhase?: boolean | null;
    liveVerified?: boolean;
    resolutionSource?: string;
}
interface Preview { amountMinor: number; units: number; effectivePricePerKwh: number; tariffId: string; }

const meter = ref<MeterInfo | null>(null);
const preview = ref<Preview | null>(null);
const result = ref<{
    remoteTaskId: string | null;
    token: string | null;
    receiptId: string | null;
    units: number;
    purchaseOrder: any;
    remoteSend?: { status: 'pending' | 'success' | 'failed' | 'unknown'; deliveryState: string; remark?: string | null };
} | null>(null);

const amountMinor = computed(() => Math.max(0, Math.round(amountNaira.value * 100)));
// Remote send writes a token straight to the physical meter — never allow it
// for meters that are only resolvable from archived/read-only metadata.
const canDispatch = computed(() => meter.value?.liveVerified !== false);

function meterTypeLabel(isThreePhase?: boolean | null) {
    return isThreePhase ? 'Three Phase' : 'Single Phase';
}

function describeApiError(e: unknown, fallback: string) {
    if (e instanceof ApiError) {
        if (e.code === 'vend_meter_lookup_unavailable') {
            return {
                title: 'Live meter verification unavailable',
                message: e.message,
                action: 'No wallet debit or dispatch was attempted. Retry shortly, then contact support if it repeats.',
                code: e.code,
            };
        }
        if (e.code === 'vend_pricing_unavailable') {
            return {
                title: 'Vending price unavailable',
                message: e.message,
                action: 'No wallet debit or dispatch was attempted. Retry shortly, then contact support if it repeats.',
                code: e.code,
            };
        }
        if (e.code === 'remote_send_service_unavailable') {
            return {
                title: 'Remote delivery unavailable',
                message: e.message,
                action: 'The generated token remains valid. Enter it manually, or retry remote send shortly.',
                code: e.code,
            };
        }
        if (['wallet_backend_not_configured', 'wallet_backend_unavailable'].includes(String(e.code))) {
            return {
                title: 'Wallet service unavailable',
                message: e.message,
                action: 'No wallet debit or dispatch was attempted. Contact Beverly support before retrying.',
                code: e.code,
            };
        }
        if (e.code === 'meter_lookup_unavailable' || e.status === 503) {
            return {
                title: 'Live lookup unavailable',
                message: e.message,
                action: 'No wallet debit or dispatch was attempted. Retry shortly, or ask an admin to bind this meter first.',
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
        if (e.code === 'remote_token_rejected') {
            return {
                title: 'Meter rejected the token',
                message: e.message,
                action: 'Verify the meter phase and key data (SGC/KRN/TI/KT) match this meter, then retry.',
                code: e.code,
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
        return {
            title: 'Dispatch failed',
            message: e.message,
            action: 'No token was delivered. Please retry or contact support if this repeats.',
            code: e.code,
        };
    }
    return { title: 'Dispatch failed', message: fallback };
}

async function lookupMeter() {
    if (!meterId.value.trim()) return;
    loading.value = true; error.value = null;
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
    loading.value = true; error.value = null;
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

function confirm() {
    if (!meter.value || !preview.value) return;
    if (!canDispatch.value) {
        error.value = {
            title: 'Remote send blocked for safety',
            message: 'This meter must be live-verified or locally bound before a token can be dispatched to it.',
            action: 'No wallet debit or dispatch was attempted.',
            code: 'meter_requires_live_binding',
        };
        return;
    }
    authError.value = '';
    authOpen.value = true;
}

async function fetchRemoteSendStatus(endpoint: string) {
    try {
        return await api.get<any>(endpoint);
    } catch (err: any) {
        const data = err?.details || err?.data || err?.response?.data;
        if (data && typeof data === 'object') {
            return {
                status: 'failed',
                deliveryState: data.delivery_state || data.deliveryState || 'remote_send_failed_needs_manual_entry',
                remark: data.message || data.remark || data.error || err.message || 'Remote send failed',
                purchaseOrder: data.purchaseOrder,
                remoteTaskId: data.remoteTaskId || data.remote_task_id,
            };
        }
        try {
            return await api.post<any>(endpoint, {});
        } catch (postErr: any) {
            const postData = postErr?.details || postErr?.data || postErr?.response?.data;
            if (postData && typeof postData === 'object') {
                return {
                    status: 'failed',
                    deliveryState: postData.delivery_state || postData.deliveryState || 'remote_send_failed_needs_manual_entry',
                    remark: postData.message || postData.remark || postData.error || postErr.message || 'Remote send failed',
                    purchaseOrder: postData.purchaseOrder,
                    remoteTaskId: postData.remoteTaskId || postData.remote_task_id,
                };
            }
            return {
                status: 'failed',
                deliveryState: 'remote_send_failed_needs_manual_entry',
                remark: postErr?.message || err?.message || 'Remote send failed',
            };
        }
    }
}

async function submitAuthorization() {
    if (!meter.value || !preview.value || !/^\d{4}$/.test(authorization.value)) return;
    if (isLocked.value) {
        authError.value = `Too many incorrect attempts. Try again in ${lockSecondsLeft.value}s.`;
        return;
    }
    loading.value = true; error.value = null;
    authError.value = '';
    try {
        const r = await api.post<{
            remoteTaskId: string | null;
            token: string | null;
            receiptId: string | null;
            units: number;
            purchaseOrder: any;
            remoteSend?: { status: 'pending' | 'success' | 'failed' | 'unknown'; deliveryState: string; remark?: string | null };
        }>(
            '/api/v1/vendor/vend',
            {
                meterId: meter.value.meterId,
                amountMinor: amountMinor.value,
                mode: 'remote_send',
                authorization: authorization.value,
            },
        );
        registerSuccessfulAttempt();
        authorization.value = '';
        authOpen.value = false;

        const rawToken = String(r?.token || r?.purchaseOrder?.token || '').trim();
        const isPoFailed = r?.purchaseOrder?.status === 'failed'
            || r?.purchaseOrder?.delivery_state === 'vend_failed'
            || (r as any)?.status === 'failed';

        if (!rawToken || isPoFailed) {
            result.value = null;
            remoteTrackerOpen.value = false;
            const failureReason = r?.purchaseOrder?.remark
                || r?.purchaseOrder?.failure_reason
                || (r as any)?.message
                || 'Token generation failed. No token was returned by the vending service.';
            const errDetails = {
                title: 'Token Generation Failed',
                message: failureReason,
                action: 'No wallet debit occurred. Your balance is safe. Check the meter binding or retry.',
                code: r?.purchaseOrder?.delivery_state || (r as any)?.code || 'token_not_generated',
                meterId: meter.value?.meterId,
                customerName: meter.value?.customerName,
                stationId: meter.value?.stationId,
                amountMinor: amountMinor.value,
                orderId: r?.purchaseOrder?.id,
            };
            failedSend.value = errDetails;
            error.value = errDetails;
            step.value = 'failed';
            showResultPopup(
                'danger',
                'Remote Send Failed',
                `${errDetails.message} No wallet debit occurred.`,
            );
            return;
        }

        result.value = {
            ...r,
            token: rawToken,
        };
        failedSend.value = null;
        step.value = 'success';
        schedulePoll(0);
        showResultPopup(
            'success',
            'Token generated successfully',
            `Credit token is ready for meter ${meter.value?.meterId || ''}. Remote send dispatching...`,
        );
        window.setTimeout(() => {
            remoteTrackerOpen.value = true;
        }, 500);
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
        const errDetails = describeApiError(e, e?.message ?? 'Remote send failed');
        error.value = errDetails;
        authOpen.value = false;
        authorization.value = '';
        remoteTrackerOpen.value = false;
        result.value = null;

        failedSend.value = {
            title: errDetails.title || 'Remote Send Failed',
            message: errDetails.message,
            action: errDetails.action,
            code: errDetails.code,
            reference: (errDetails as any).reference,
            meterId: meter.value?.meterId,
            customerName: meter.value?.customerName,
            stationId: meter.value?.stationId,
            amountMinor: amountMinor.value,
        };

        step.value = 'failed';

        showResultPopup(
            'danger',
            errDetails.title || 'Vend Failed',
            `${errDetails.message}${errDetails.action ? ' ' + errDetails.action : ''}`,
        );
    } finally {
        loading.value = false;
    }
}

function retryFromPreview() {
    error.value = null;
    failedSend.value = null;
    step.value = 'preview';
}

function reset() {
    stopPolling();
    step.value = 'meter';
    meterId.value = '';
    amountNaira.value = 2000;
    meter.value = null;
    preview.value = null;
    result.value = null;
    failedSend.value = null;
    error.value = null;
    copied.value = false;
    remoteTrackerOpen.value = false;
}

onUnmounted(stopPolling);

async function copyToken() {
    if (!result.value?.token) return;
    try {
        await navigator.clipboard.writeText(result.value.token);
        copied.value = true;
        window.setTimeout(() => { copied.value = false; }, 2000);
    } catch {
        error.value = { title: 'Copy failed', message: 'Select the token and copy it manually.' };
    }
}

function receiptRow() {
    if (!result.value) return null;
    return {
        ...(result.value.purchaseOrder ?? {}),
        token: result.value.token,
        receipt_id: result.value.receiptId,
        purchase_order_id: result.value.purchaseOrder?.id,
        units_kwh: result.value.units,
        customer_name: meter.value?.customerName,
        meter_id: meter.value?.meterId,
        meter_type: meter.value?.isThreePhase ? 'three_phase' : 'single_phase',
        station_id: meter.value?.stationId,
        amount_minor: result.value.purchaseOrder?.amount_minor ?? preview.value?.amountMinor,
    };
}

function viewResultReceipt() {
    const row = receiptRow();
    if (row) viewReceipt(purchaseReceipt(row));
}

function downloadResultReceipt() {
    const row = receiptRow();
    if (row) downloadReceipt(purchaseReceipt(row));
}
</script>

<template>
  <AppShell title="Remote Send">
    <div style="max-width: 560px; margin: 0 auto">

      <!-- Step: meter lookup -->
      <div v-if="step === 'meter'" class="bw-card">
        <h1 class="bw-h1">Remote send</h1>
        <p class="bw-muted" style="margin: 0 0 var(--s-5)">
          Beverly generates your token first, then sends it to the meter. The token remains available for manual entry.
        </p>
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
      <div v-else-if="step === 'amount'" class="bw-card">
        <button class="bw-btn sm" style="margin-bottom: var(--s-4)" @click="step = 'meter'">← Back</button>
        <p class="bw-label">Customer</p>
        <h2 class="bw-h2" style="margin: 0">{{ meter?.customerName }}</h2>
        <p class="bw-muted bw-mono" style="font-size: var(--t-sm); margin-top: 4px">
          {{ meter?.meterId }} · {{ meter?.stationId }} · {{ meter?.tariffId }}
        </p>

        <span :class="['bw-badge', meter?.isThreePhase ? 'info' : 'neutral']" style="margin-top: var(--s-2)">
          {{ meterTypeLabel(meter?.isThreePhase) }}
        </span>

        <div v-if="!canDispatch" class="bw-alert" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>Preview-only meter metadata</strong>
          <span>This meter was resolved from archived read-only records, not the live account catalog. Bind or confirm it live before dispatching a token.</span>
          <small v-if="meter?.resolutionSource" class="bw-mono">Source: {{ meter.resolutionSource }}</small>
        </div>

        <div style="margin-top: var(--s-5)">
          <label class="bw-label">Amount (₦)</label>
          <input class="bw-input bw-mono" type="number" min="100" step="100" v-model.number="amountNaira" style="font-size: var(--t-xl)" />
          <div class="bw-row" style="margin-top: var(--s-3); gap: var(--s-2); flex-wrap: wrap">
            <button v-for="n in [1000, 2000, 5000, 10000, 25000]" :key="n"
                    class="bw-btn sm" @click="amountNaira = n">₦{{ n.toLocaleString() }}</button>
          </div>
        </div>

        <div v-if="error" class="bw-alert danger" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>{{ error.title }}</strong>
          <span>{{ error.message }}</span>
          <small v-if="error.action" class="bw-muted">{{ error.action }}</small>
        </div>
        <button class="bw-btn primary" style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 44px"
                @click="loadPreview" :disabled="loading || amountNaira < 100">
          {{ loading ? 'Calculating…' : 'Preview' }}
        </button>
      </div>

      <!-- Step: preview / confirm -->
      <div v-else-if="step === 'preview'" class="bw-card">
        <button class="bw-btn sm" style="margin-bottom: var(--s-4)" @click="step = 'amount'">← Back</button>
        <p class="bw-label">Confirm remote send</p>
        <h2 class="bw-h2 bw-mono" style="font-size: var(--t-3xl); margin: 0">{{ naira(preview?.amountMinor) }}</h2>
        <p class="bw-muted bw-mono">{{ kwh(preview?.units) }} @ ₦{{ preview?.effectivePricePerKwh.toFixed(2) }}/kWh</p>

        <div style="border-top: 1px solid var(--border); margin-top: var(--s-4); padding-top: var(--s-4); display: grid; gap: var(--s-2)">
          <div class="bw-row"><span class="bw-muted">Customer</span><span class="bw-spacer"></span><strong>{{ meter?.customerName }}</strong></div>
          <div class="bw-row"><span class="bw-muted">Meter</span><span class="bw-spacer"></span><span class="bw-mono">{{ meter?.meterId }}</span></div>
          <div class="bw-row"><span class="bw-muted">Phase</span><span class="bw-spacer"></span><span>{{ meterTypeLabel(meter?.isThreePhase) }}</span></div>
          <div class="bw-row"><span class="bw-muted">Station</span><span class="bw-spacer"></span><span>{{ meter?.stationId }}</span></div>
          <div class="bw-row"><span class="bw-muted">Tariff</span><span class="bw-spacer"></span><span>{{ meter?.tariffId }}</span></div>
          <div class="bw-row"><span class="bw-muted">Delivery</span><span class="bw-spacer"></span><span>Direct to meter</span></div>
        </div>

        <div class="bw-alert" style="margin-top: var(--s-3); display: grid; gap: 4px">
          <strong>Token first, remote delivery second</strong>
          <span>Your token and receipt remain available if the meter needs manual entry.</span>
        </div>
        <div v-if="!canDispatch" class="bw-alert danger" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>Remote send blocked for safety</strong>
          <span>This preview is allowed, but dispatch is blocked until the meter is live-verified or locally bound.</span>
        </div>

        <div v-if="error" class="bw-alert danger" style="margin-top: var(--s-3); display: grid; gap: 6px">
          <strong>{{ error.title }}</strong>
          <span>{{ error.message }}</span>
          <small v-if="error.action" class="bw-muted">{{ error.action }}</small>
          <small v-if="error.code" class="bw-mono">Code: {{ error.code }}</small>
        </div>
        <button class="bw-btn primary" style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 44px"
                @click="confirm" :disabled="loading || !canDispatch">
          {{ loading ? 'Dispatching…' : `Dispatch — ${naira(preview?.amountMinor)}` }}
        </button>
      </div>

      <!-- Step: success -->
      <div v-else-if="step === 'success' && result?.token" class="bw-stack">
        <div class="bw-token-box">
          <p class="bw-label" style="color: var(--brand)">{{ result?.remoteSend?.status === 'success' ? 'Delivered' : 'Token generated' }}</p>
          <h1 class="bw-h1" style="margin: var(--s-2) 0">{{ result?.remoteSend?.status === 'success' ? 'Token sent to meter' : 'Token ready for entry' }}</h1>
          <p class="bw-token-value">{{ result?.token }}</p>
          <p class="bw-muted bw-mono" style="font-size: var(--t-sm)">
            Task #{{ String(result?.remoteTaskId ?? '').slice(0, 12) }}
          </p>
          <p class="bw-muted bw-mono" style="font-size: var(--t-sm)">{{ kwh(result?.units) }} · {{ naira(preview?.amountMinor) }}</p>
        </div>
        <div v-if="polling" class="bw-alert" style="display: grid; gap: 4px">
          <strong>Checking delivery status…</strong>
          <span>Beverly is polling the meter for confirmation. The token above is already valid for manual entry.</span>
        </div>
        <div class="bw-card">
          <div class="bw-row"><span class="bw-muted">Customer</span><span class="bw-spacer"></span><strong>{{ meter?.customerName }}</strong></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">Meter</span><span class="bw-spacer"></span><span class="bw-mono">{{ meter?.meterId }}</span></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">Phase</span><span class="bw-spacer"></span><span>{{ meterTypeLabel(meter?.isThreePhase) }}</span></div>
          <div class="bw-row" style="margin-top: var(--s-2)"><span class="bw-muted">Order</span><span class="bw-spacer"></span><span class="bw-mono">#{{ String(result?.purchaseOrder?.id ?? '').slice(0, 8) }}</span></div>
          <p class="bw-muted" style="font-size: var(--t-sm); margin-top: var(--s-3)">
            {{ result?.remoteSend?.status === 'success'
              ? 'Delivery confirmed by the meter.'
              : result?.remoteSend?.remark || 'Remote delivery needs review. Enter this valid token manually if needed.' }}
          </p>
        </div>
        <div class="bw-row" style="gap: var(--s-2); flex-wrap: wrap">
          <button class="bw-btn primary" @click="copyToken">{{ copied ? 'Copied' : 'Copy token' }}</button>
          <button class="bw-btn" @click="downloadResultReceipt">Download receipt</button>
          <button class="bw-btn" @click="viewResultReceipt">View receipt</button>
        </div>
        <button class="bw-btn primary" style="justify-content: center; height: 44px" @click="reset">New send</button>
      </div>

      <!-- Step: failed (Explicit Remote Send Failure Screen) -->
      <div v-else-if="step === 'failed'" class="bw-stack">
        <div class="bw-card vend-failed-card">
          <div class="vend-failed-header">
            <div class="failed-icon-circle">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <p class="token-failed-badge"><span></span>Dispatch Unsuccessful</p>
              <h1 class="failed-title">{{ failedSend?.title || error?.title || 'Remote Send Failed' }}</h1>
            </div>
          </div>

          <div class="vend-safety-notice">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
            <div>
              <strong>Wallet Safe &amp; Untouched</strong>
              <p>No funds were debited from your vendor wallet. Any preliminary hold was immediately released.</p>
            </div>
          </div>

          <div class="failed-reason-box">
            <p class="failed-reason-msg">{{ failedSend?.message || error?.message || 'Remote dispatch failed before a token could be generated.' }}</p>
            <p v-if="failedSend?.action || error?.action" class="failed-reason-action">{{ failedSend?.action || error?.action }}</p>
            <div class="failed-reason-meta">
              <span v-if="failedSend?.code || error?.code" class="bw-mono">Code: {{ failedSend?.code || error?.code }}</span>
              <span v-if="failedSend?.reference || error?.reference" class="bw-mono">Ref: {{ failedSend?.reference || error?.reference }}</span>
              <span v-if="failedSend?.orderId" class="bw-mono">Order: #{{ String(failedSend.orderId).slice(0, 8) }}</span>
            </div>
          </div>

          <div class="failed-transaction-facts">
            <div><dt>Customer</dt><dd>{{ failedSend?.customerName || meter?.customerName || '—' }}</dd></div>
            <div><dt>Meter</dt><dd class="bw-mono">{{ failedSend?.meterId || meter?.meterId || '—' }}</dd></div>
            <div><dt>Amount Attempted</dt><dd>{{ naira(failedSend?.amountMinor ?? preview?.amountMinor) }}</dd></div>
            <div><dt>Station</dt><dd>{{ failedSend?.stationId || meter?.stationId || '—' }}</dd></div>
          </div>
        </div>

        <div class="bw-row" style="gap: var(--s-2); flex-wrap: wrap">
          <button class="bw-btn primary" style="flex: 1; justify-content: center; height: 44px" @click="retryFromPreview">
            Try Again
          </button>
          <button class="bw-btn" style="flex: 1; justify-content: center; height: 44px" @click="step = 'amount'">
            Change Amount
          </button>
        </div>
        <button class="bw-btn" style="justify-content: center; height: 44px" @click="reset">New Send</button>
      </div>
    </div>

    <ConfirmDialog
      v-model:open="authOpen"
      title="Authorize remote send"
      description="Enter your four-digit vending PIN."
      confirm-label="Dispatch token"
      tone="warn"
      :loading="loading"
      :disable-confirm="!/^\d{4}$/.test(authorization) || isLocked"
      @confirm="submitAuthorization"
    >
      <label class="bw-label">Vendor authorization</label>
      <input
        class="bw-input bw-mono cd-input-target"
        v-model="authorization"
        type="password"
        inputmode="numeric"
        maxlength="4"
        pattern="[0-9]{4}"
        autocomplete="one-time-code"
        :disabled="isLocked"
        placeholder="••••"
      />
      <p v-if="isLocked" class="bw-alert danger" style="margin-top: var(--s-2)">
        Too many incorrect attempts. Try again in {{ lockSecondsLeft }}s.
      </p>
      <p v-else-if="authError" class="bw-alert danger" style="margin-top: var(--s-2)">
        {{ authError }}
      </p>
      <p class="bw-muted" style="font-size: var(--t-xs); margin-top: var(--s-2)">
        This protects remote token dispatch and confirms the wallet debit.
      </p>
    </ConfirmDialog>

    <StatusPopup
      :open="Boolean(resultPopup)"
      :tone="resultPopup?.tone ?? 'info'"
      :title="resultPopup?.title ?? ''"
      :message="resultPopup?.message ?? ''"
      @update:open="(v) => { if (!v) resultPopup = null; }"
    />

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
.vend-failed-card {
  padding: var(--s-5);
  border: 1px solid color-mix(in srgb, var(--danger, #dc2626) 35%, var(--border));
  background: color-mix(in srgb, var(--danger, #dc2626) 4%, var(--surface));
  display: grid;
  gap: var(--s-4);
}

.vend-failed-header {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}

.failed-icon-circle {
  width: 48px;
  height: 48px;
  border-radius: var(--r-full);
  display: grid;
  place-items: center;
  flex: none;
  background: color-mix(in srgb, var(--danger, #dc2626) 15%, transparent);
  color: var(--danger, #dc2626);
}

.token-failed-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 4px;
  color: var(--danger, #dc2626);
  font-size: var(--t-xs);
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.token-failed-badge span {
  width: 6px;
  height: 6px;
  border-radius: var(--r-full);
  background: var(--danger, #dc2626);
}

.failed-title {
  margin: 0;
  color: var(--text);
  font-size: var(--t-lg);
  line-height: 1.2;
}

.vend-safety-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--success, #16a34a) 12%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--success, #16a34a) 30%, transparent);
  color: color-mix(in srgb, var(--text) 90%, transparent);
}

.vend-safety-notice svg {
  color: var(--success, #16a34a);
  flex: none;
  margin-top: 2px;
}

.vend-safety-notice strong {
  display: block;
  font-size: var(--t-sm);
  color: var(--success, #16a34a);
  margin-bottom: 2px;
}

.vend-safety-notice p {
  margin: 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.4;
}

.failed-reason-box {
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--danger, #dc2626) 8%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--danger, #dc2626) 20%, transparent);
  display: grid;
  gap: var(--s-2);
}

.failed-reason-msg {
  margin: 0;
  font-weight: 600;
  font-size: var(--t-sm);
  color: var(--text);
}

.failed-reason-action {
  margin: 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.failed-reason-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-4);
  margin-top: 2px;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.failed-transaction-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
  padding-top: var(--s-3);
  border-top: 1px solid var(--border);
}

.failed-transaction-facts dt {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.failed-transaction-facts dd {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
  color: var(--text);
  font-size: var(--t-sm);
  font-weight: 700;
}
</style>
