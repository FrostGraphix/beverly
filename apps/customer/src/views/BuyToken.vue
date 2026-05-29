<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, redirectToPayment, navigateToError, ApiError } from '../lib/api';
import { naira, kwh } from '../lib/format';
import { downloadReceipt, printReceipt, purchaseReceipt, viewReceipt } from '../lib/receipts';
import { useAuthStore } from '../stores/auth';

const auth    = useAuthStore();
const step    = ref<1 | 2 | 3 | 4>(1);

// Step 1 — meter
const meters    = ref<any[]>([]);
const selMeter  = ref<any>(null);

// Step 2 — amount
const amountRaw  = ref('');
const quickAmts  = [500_00, 1000_00, 2000_00, 5000_00, 10000_00, 20000_00];
const amountMinor = computed(() => Math.round(parseFloat(amountRaw.value || '0') * 100));

// Step 3 — preview
const preview  = ref<any>(null);
const mode     = ref<'wallet' | 'direct_pay'>('wallet');
const walletBal = ref(0);
const loadingPreview = ref(false);

// Step 4 — result
const result   = ref<any>(null);
const loading  = ref(false);
const error    = ref<{ title: string; message: string; action?: string; code?: string } | null>(null);
const notice   = ref<{ tone: 'success' | 'info' | 'danger'; title: string; message: string; code?: string } | null>(null);
const copied   = ref(false);
const remoteSending = ref(false);

// Step-up auth
const stepUpRequired  = ref(false);
const stepUpChallengeId = ref('');
const stepUpExpiry    = ref('');
const stepUpOtp       = ref('');
const stepUpLoading   = ref(false);
const stepUpError     = ref<string | null>(null);
// Keep purchase params so we can resubmit after OTP
let pendingPurchaseParams: {
    meter_id: string;
    meter_type?: 'single_phase' | 'three_phase';
    amount_minor: number;
    mode: 'wallet' | 'direct_pay';
    idempotency_key: string;
} | null = null;

function meterTypeLabel(type?: string | null) {
    if (type === 'three_phase') return 'Three Phase';
    if (type === 'single_phase') return 'Single Phase';
    return 'Phase Unknown';
}

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

function describeApiError(e: unknown, fallback: string) {
    if (e instanceof ApiError) {
        if (e.code === 'amount_too_low') return { title: 'Amount too low', message: e.message, action: 'Choose at least ₦500.', code: e.code };
        if (e.code === 'insufficient_balance') return { title: 'Insufficient wallet balance', message: e.message, action: 'Top up or pay with card.', code: e.code };
        if (['wallet_inactive', 'wallet_frozen', 'wallet_closed'].includes(String(e.code))) {
            return { title: 'Wallet cannot buy token', message: e.message, action: 'Contact Beverly support.', code: e.code };
        }
        if (e.code === 'remote_token_rejected') return { title: 'Remote send rejected', message: e.message, action: 'The token remains visible. Enter it manually.', code: e.code };
        if (e.code === 'remote_send_metadata_missing') return { title: 'Remote send unavailable', message: e.message, action: 'The token remains valid for manual entry.', code: e.code };
        if (e.code === 'request_timeout') return { title: 'Request timed out', message: e.message, action: 'Check your network and retry.', code: e.code };
        return { title: 'Request failed', message: e.message, action: 'Retry or contact support if this repeats.', code: e.code };
    }
    return { title: 'Request failed', message: fallback };
}

onMounted(async () => {
    const [m, w] = await Promise.all([
        api.get<{ meters: any[] }>('/api/v1/customer/meters'),
        api.get<any>('/api/v1/customer/wallet').catch(() => null),
    ]);
    meters.value = m.meters;
    walletBal.value = w?.available_minor ?? 0;
    if (w?.status === 'frozen' || w?.status === 'inactive') {
        navigateToError('wallet_frozen'); return;
    }
    if (meters.value.length === 1) selMeter.value = meters.value[0];
    const query = new URLSearchParams(window.location.search);
    const reference = query.get('reference') ?? query.get('trxref');
    if (reference) {
        try {
            const payment = await api.post<{ status: string; fulfillmentStatus: string }>(
                `/api/v1/customer/payments/${encodeURIComponent(reference)}/verify`,
            );
            if (payment.status === 'succeeded' && ['fulfilled', 'already_fulfilled'].includes(payment.fulfillmentStatus)) {
                notice.value = { tone: 'success', title: 'Payment confirmed', message: 'Your token is ready in Transactions and Receipts.' };
            } else if (payment.fulfillmentStatus === 'blocked' || payment.status === 'requires_review') {
                notice.value = { tone: 'danger', title: 'Delivery needs review', message: 'Payment was confirmed, but token delivery needs support review. Do not pay again.' };
            } else {
                notice.value = { tone: 'info', title: 'Payment processing', message: 'Your token will be delivered automatically after confirmation.' };
            }
        } catch (e: any) {
            notice.value = { tone: 'danger', title: 'Verification delayed', message: e?.message ?? 'Automatic reconciliation is still running.' };
        }
    }
});

function setQuick(amt: number) {
    amountRaw.value = (amt / 100).toString();
}

async function goToPreview() {
    if (!selMeter.value || amountMinor.value < 50000) return;
    loadingPreview.value = true; error.value = null; notice.value = null;
    try {
        preview.value = await api.post<any>('/api/v1/customer/purchase/preview', {
            meter_id: selMeter.value.meter_id,
            amount_minor: amountMinor.value,
        });
        mode.value = walletBal.value >= Number(preview.value.amountMinor ?? 0) ? 'wallet' : 'direct_pay';
        step.value = 3;
    } catch (e: any) {
        error.value = describeApiError(e, e?.message ?? 'Could not load preview.');
    } finally { loadingPreview.value = false; }
}

async function purchase() {
    if (!selMeter.value || !preview.value) return;
    loading.value = true; error.value = null; notice.value = null;
    const params = {
        meter_id:        selMeter.value.meter_id,
        meter_type:      selMeter.value.meter_type,
        amount_minor:    amountMinor.value,
        mode:            mode.value as 'wallet' | 'direct_pay',
        idempotency_key: crypto.randomUUID(),
    };
    try {
        const r = await api.post<any>('/api/v1/customer/purchase', params);

        // Fraud engine: step-up required (202)
        if (r.step_up_required) {
            pendingPurchaseParams    = params;
            stepUpChallengeId.value  = r.challenge_id;
            stepUpExpiry.value       = r.expires_at;
            stepUpRequired.value     = true;
            stepUpOtp.value          = '';
            stepUpError.value        = null;
            return;
        }

        if (mode.value === 'direct_pay' && r.authorizationUrl) {
            redirectToPayment(r.authorizationUrl);
            return;
        }
        result.value = r;
        notice.value = {
            tone: 'success',
            title: 'Token generated successfully',
            message: 'Receipt is ready. Copy, download, view, or remote send now.',
        };
        step.value   = 4;
    } catch (e: any) {
        if (e instanceof ApiError && (e.code === 'wallet_frozen' || e.code === 'wallet_inactive' || e.code === 'wallet_closed')) {
            navigateToError('wallet_frozen', e.message); return;
        }
        if (e instanceof ApiError && e.code === 'purchase_blocked') {
            navigateToError('purchase_blocked', e.message); return;
        }
        error.value = e?.message ?? 'Purchase failed. Try again.';
    } finally { loading.value = false; }
}

async function submitStepUp() {
    if (!pendingPurchaseParams || !stepUpOtp.value) return;
    stepUpLoading.value = true; stepUpError.value = null;
    try {
        const r = await api.post<any>('/api/v1/customer/purchase/step-up-verify', {
            challenge_id:    stepUpChallengeId.value,
            otp:             stepUpOtp.value.trim(),
            ...pendingPurchaseParams,
        });
        stepUpRequired.value = false;
        pendingPurchaseParams = null;
        if (pendingPurchaseParams === null && r.authorizationUrl) {
            redirectToPayment(r.authorizationUrl);
            return;
        }
        result.value = r;
        notice.value = {
            tone: 'success',
            title: 'Token generated successfully',
            message: 'Receipt is ready. Copy, download, view, or remote send now.',
        };
        step.value   = 4;
    } catch (e: any) {
        stepUpError.value = e?.message ?? 'Incorrect code. Try again.';
    } finally { stepUpLoading.value = false; }
}

function cancelStepUp() {
    stepUpRequired.value  = false;
    stepUpChallengeId.value = '';
    stepUpOtp.value       = '';
    stepUpError.value     = null;
    pendingPurchaseParams = null;
}

async function copyToken() {
    if (result.value?.token) {
        try {
            await navigator.clipboard.writeText(result.value.token);
            copied.value = true;
            notice.value = { tone: 'success', title: 'Token copied', message: 'Paste it into your meter keypad when needed.' };
            setTimeout(() => { copied.value = false; }, 2000);
        } catch {
            notice.value = { tone: 'danger', title: 'Copy failed', message: 'Select the token and copy it manually.' };
        }
    }
}

function reset() {
    step.value = 1; result.value = null; preview.value = null;
    amountRaw.value = ''; error.value = null; notice.value = null;
    remoteSending.value = false; copied.value = false;
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
        vat_amount_minor: result.value.purchaseOrder?.vat_amount_minor ?? preview.value?.vatMinor,
        vat_rate_basis_points: result.value.purchaseOrder?.vat_rate_basis_points ?? preview.value?.vatRateBasisPoints,
        meter_id: result.value.purchaseOrder?.meter_id ?? preview.value?.meterId,
        meter_type: result.value.purchaseOrder?.meter_type ?? preview.value?.meterType,
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
            ? 'Beverly is checking your meter delivery status now.'
            : 'Beverly is sending this token to your meter now.',
    };
    try {
        const response = await api.post<{
            remoteTaskId: string;
            status: 'pending' | 'success' | 'failed' | 'unknown';
            deliveryState: string;
            remark?: string | null;
            purchaseOrder?: any;
        }>(`/api/v1/customer/purchase/${orderId}/remote-send`, {});
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
            notice.value = { tone: 'success', title: 'Remote send delivered', message: 'Your meter accepted the generated token.' };
            return;
        }
        notice.value = {
            tone: response.status === 'failed' ? 'danger' : 'info',
            title: response.status === 'failed' ? 'Remote send needs manual entry' : response.status === 'unknown' ? 'Remote status unknown' : 'Remote delivery needs review',
            message: response.remark || 'The token remains visible for manual entry if needed.',
        };
    } catch (e: any) {
        const details = describeApiError(e, e?.message ?? 'Remote send failed');
        notice.value = {
            tone: 'danger',
            title: details.title,
            message: `${details.message}${details.action ? ` ${details.action}` : ''}`,
            code: details.code,
        };
    } finally {
        remoteSending.value = false;
    }
}
</script>

<template>
  <AppShell>
    <div v-if="notice" :class="['bw-alert', notice.tone === 'danger' ? 'danger' : '']" style="display: grid; gap: 6px; margin-bottom: var(--s-3)">
      <strong>{{ notice.title }}</strong>
      <span>{{ notice.message }}</span>
      <small v-if="notice.code" class="bw-mono">Code: {{ notice.code }}</small>
    </div>

    <!-- Step indicator -->
    <div class="bw-steps">
      <div v-for="n in 4" :key="n"
           :class="['bw-step', step === n ? 'active' : step > n ? 'done' : '']">
        <div class="bw-step-dot">{{ step > n ? '✓' : n }}</div>
        <span v-if="step === n">{{ ['Meter','Amount','Preview','Done'][n-1] }}</span>
      </div>
      <div v-if="false" class="bw-step-line"></div>
    </div>

    <!-- Step 1: Select meter -->
    <template v-if="step === 1">
      <div class="bw-card">
        <p class="bw-page-title" style="margin-bottom: var(--s-4)">Select meter</p>
        <div v-if="meters.length" class="bw-stack">
          <div v-for="m in meters" :key="m.id"
               :class="['bw-meter-card', selMeter?.id === m.id ? 'selected' : '']"
               @click="selMeter = m">
            <div class="bw-meter-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
              </svg>
            </div>
            <div style="flex:1">
              <div style="font-weight:700; font-size: var(--t-sm)">{{ m.nickname || m.meter_id }}</div>
              <div class="bw-muted bw-mono" style="font-size: var(--t-xs)">{{ m.meter_id }}</div>
              <span :class="['bw-badge', m.meter_type === 'three_phase' ? 'info' : 'neutral']" style="margin-top:4px">
                {{ meterTypeLabel(m.meter_type) }}
              </span>
            </div>
            <div v-if="selMeter?.id === m.id" style="color: var(--brand)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
        </div>
        <div v-else class="bw-muted" style="text-align:center; padding: var(--s-5); font-size: var(--t-sm)">
          No meters linked yet.
          <router-link to="/onboard-meter" style="color:var(--brand); font-weight:600; display:block; margin-top:var(--s-2)">Link a meter →</router-link>
        </div>
      </div>
      <button class="bw-btn primary lg" style="width:100%; justify-content:center"
              :disabled="!selMeter" @click="step = 2">
        Continue
      </button>
    </template>

    <!-- Step 2: Choose amount -->
    <template v-if="step === 2">
      <div class="bw-card">
        <p class="bw-page-title" style="margin-bottom: var(--s-1)">How much?</p>
        <section class="bw-recharge-summary" aria-label="Selected meter">
          <div><span>Meter</span><strong class="bw-mono">{{ selMeter?.meter_id }}</strong></div>
          <div><span>Phase</span><strong>{{ meterTypeLabel(selMeter?.meter_type) }}</strong></div>
          <div><span>Tariff</span><strong>{{ selMeter?.tariff_id || '-' }}</strong></div>
          <div><span>Station</span><strong>{{ selMeter?.station_id || '-' }}</strong></div>
        </section>
        <label class="bw-label">Energy amount (₦)</label>
        <input class="bw-input bw-mono" v-model="amountRaw" type="number" min="500"
               inputmode="numeric" placeholder="0.00"
               style="font-size: var(--t-2xl); font-weight:700; text-align:right" />
        <div class="bw-quick-amounts bw-recharge-quick-grid" style="margin-top: var(--s-3)">
          <button v-for="a in quickAmts" :key="a"
                  :class="['bw-quick-amt', amountMinor === a ? 'active' : '']"
                  @click="setQuick(a)">
            {{ naira(a) }}
          </button>
        </div>
      </div>
      <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm); display: grid; gap: 6px">
        <strong>{{ error.title }}</strong>
        <span>{{ error.message }}</span>
        <small v-if="error.action" class="bw-muted">{{ error.action }}</small>
        <small v-if="error.code" class="bw-mono">Code: {{ error.code }}</small>
      </div>
      <div class="bw-row" style="gap: var(--s-3)">
        <button class="bw-btn" style="flex:1; justify-content:center" @click="step = 1">Back</button>
        <button class="bw-btn primary" style="flex:2; justify-content:center"
                :disabled="amountMinor < 50000 || loadingPreview" @click="goToPreview">
          {{ loadingPreview ? 'Loading…' : 'Preview →' }}
        </button>
      </div>
    </template>

    <!-- Step 3: Preview & pay -->
    <template v-if="step === 3 && preview">
      <div class="bw-card">
        <p class="bw-page-title" style="margin-bottom: var(--s-4)">Confirm purchase</p>
        <div class="bw-stack" style="gap: var(--s-3)">
          <div class="bw-row" style="justify-content:space-between">
            <span class="bw-muted" style="font-size: var(--t-sm)">Meter</span>
            <span class="bw-mono" style="font-size: var(--t-sm)">{{ preview.meterId }}</span>
          </div>
          <div class="bw-row" style="justify-content:space-between">
            <span class="bw-muted" style="font-size: var(--t-sm)">Phase</span>
            <span :class="['bw-badge', preview.meterType === 'three_phase' ? 'info' : 'neutral']">
              {{ meterTypeLabel(preview.meterType) }}
            </span>
          </div>
          <div class="bw-row" style="justify-content:space-between">
            <span class="bw-muted" style="font-size: var(--t-sm)">Units</span>
            <span class="bw-mono" style="font-weight:700">{{ kwh(preview.units) }}</span>
          </div>
          <div class="bw-row" style="justify-content:space-between">
            <span class="bw-muted" style="font-size: var(--t-sm)">Amount paid</span>
            <span class="bw-money" style="font-weight:700">{{ naira(preview.amountMinor) }}</span>
          </div>
          <div class="bw-row" style="justify-content:space-between">
            <span class="bw-muted" style="font-size: var(--t-sm)">Energy value</span>
            <span class="bw-money" style="font-weight:700">{{ naira(preview.energyAmountMinor) }}</span>
          </div>
          <div class="bw-row" style="justify-content:space-between">
            <span class="bw-muted" style="font-size: var(--t-sm)">VAT ({{ Number(preview.vatRateBasisPoints ?? 0) / 100 }}%)</span>
            <span class="bw-money" style="font-weight:700">{{ naira(preview.vatMinor) }}</span>
          </div>
          <hr style="border:none; border-top:1px solid var(--border)">
          <div class="bw-row" style="justify-content:space-between">
            <span class="bw-muted" style="font-size: var(--t-sm)">Pay with</span>
            <div class="bw-row" style="gap: var(--s-2)">
              <button :class="['bw-badge', mode === 'wallet' ? 'success' : 'neutral']"
                      style="cursor:pointer; border:none"
                      :disabled="walletBal < preview.amountMinor"
                      @click="mode = 'wallet'">Wallet ({{ naira(walletBal) }})</button>
              <button :class="['bw-badge', mode === 'direct_pay' ? 'info' : 'neutral']"
                      style="cursor:pointer; border:none"
                      @click="mode = 'direct_pay'">Card</button>
            </div>
          </div>
          <div v-if="mode === 'wallet' && walletBal < preview.amountMinor" class="bw-alert warn" style="font-size: var(--t-xs)">
            Insufficient wallet balance.
            <router-link to="/wallet/fund" style="color:var(--brand); font-weight:600">Top up →</router-link>
          </div>
        </div>
      </div>
      <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm); display: grid; gap: 6px">
        <strong>{{ error.title }}</strong>
        <span>{{ error.message }}</span>
        <small v-if="error.action" class="bw-muted">{{ error.action }}</small>
        <small v-if="error.code" class="bw-mono">Code: {{ error.code }}</small>
      </div>
      <div class="bw-row" style="gap: var(--s-3)">
        <button class="bw-btn" style="flex:1; justify-content:center" @click="step = 2">Back</button>
        <button class="bw-btn primary" style="flex:2; justify-content:center"
                :disabled="loading || (mode === 'wallet' && walletBal < preview.amountMinor)"
                @click="purchase">
          {{ loading ? 'Processing…' : mode === 'direct_pay' ? 'Pay with Card →' : 'Buy Token' }}
        </button>
      </div>
    </template>

    <!-- Step-up auth modal -->
    <div v-if="stepUpRequired" class="bw-stepup-backdrop">
      <div class="bw-stepup-modal">
        <div style="width:48px; height:48px; border-radius:50%; background:oklch(75% 0.18 85 / 0.15); display:grid; place-items:center; margin:0 auto var(--s-4)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(75% 0.18 85)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <p style="font-weight:700; text-align:center; margin:0 0 var(--s-2)">Security check</p>
        <p class="bw-muted" style="font-size:var(--t-sm); text-align:center; margin:0 0 var(--s-5)">
          We sent a 6-digit code to your registered phone. Enter it below to complete your purchase.
        </p>
        <input
          v-model="stepUpOtp"
          class="bw-input bw-mono"
          inputmode="numeric"
          maxlength="6"
          placeholder="000000"
          style="text-align:center; font-size:var(--t-2xl); font-weight:700; letter-spacing:0.2em"
          @keyup.enter="submitStepUp"
        />
        <p v-if="stepUpError" class="bw-alert danger" style="font-size:var(--t-sm); margin-top:var(--s-2)">{{ stepUpError }}</p>
        <button class="bw-btn primary" style="width:100%; justify-content:center; margin-top:var(--s-4)"
                :disabled="stepUpOtp.length < 6 || stepUpLoading"
                @click="submitStepUp">
          {{ stepUpLoading ? 'Verifying…' : 'Verify & complete purchase' }}
        </button>
        <button class="bw-btn" style="width:100%; justify-content:center; margin-top:var(--s-2)" @click="cancelStepUp">
          Cancel
        </button>
      </div>
    </div>

    <!-- Step 4: Token reveal -->
    <template v-if="step === 4 && result">
      <div class="bw-card" style="text-align:center">
        <div style="width:48px; height:48px; border-radius:50%; background: oklch(70% 0.19 145 / 0.15); display:grid; place-items:center; margin: 0 auto var(--s-4)">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p class="bw-page-title" style="margin-bottom: var(--s-2)">Token generated!</p>
        <p class="bw-muted" style="font-size: var(--t-sm); margin-bottom: var(--s-5)">{{ kwh(result.units) }} credited to meter {{ result.purchaseOrder?.meter_id }}</p>
        <div class="bw-token-box">
          <div class="bw-token-value">{{ result.token }}</div>
          <div class="bw-token-units">{{ kwh(result.units) }} · {{ naira(result.purchaseOrder?.amount_minor ?? preview?.amountMinor) }}</div>
        </div>
        <div class="bw-card" style="text-align:left; margin-top: var(--s-3)">
          <div class="bw-row" style="justify-content:space-between"><span class="bw-muted">Meter</span><strong class="bw-mono">{{ result.purchaseOrder?.meter_id }}</strong></div>
          <div class="bw-row" style="justify-content:space-between; margin-top: var(--s-2)"><span class="bw-muted">Amount paid</span><strong>{{ naira(result.purchaseOrder?.amount_minor ?? preview?.amountMinor) }}</strong></div>
          <div class="bw-row" style="justify-content:space-between; margin-top: var(--s-2)"><span class="bw-muted">Energy value</span><strong>{{ naira(result.purchaseOrder?.energy_amount_minor ?? preview?.energyAmountMinor) }}</strong></div>
          <div class="bw-row" style="justify-content:space-between; margin-top: var(--s-2)"><span class="bw-muted">VAT ({{ Number(result.purchaseOrder?.vat_rate_basis_points ?? preview?.vatRateBasisPoints ?? 0) / 100 }}%)</span><strong>{{ naira(result.purchaseOrder?.vat_amount_minor ?? preview?.vatMinor) }}</strong></div>
          <div class="bw-row" style="justify-content:space-between; margin-top: var(--s-2)"><span class="bw-muted">Remote state</span><strong>{{ remoteState.replace(/_/g, ' ') }}</strong></div>
          <div class="bw-row" style="justify-content:space-between; margin-top: var(--s-2)"><span class="bw-muted">Order</span><strong class="bw-mono">#{{ String(result.purchaseOrder?.id ?? '').slice(0, 8) }}</strong></div>
        </div>
        <button class="bw-btn" style="width:100%; justify-content:center; margin-top: var(--s-4)" @click="copyToken">
          {{ copied ? '✓ Copied!' : 'Copy token' }}
        </button>
        <div class="buy-token-actions">
          <button class="bw-btn primary" @click="remoteSendGeneratedToken" :disabled="!canRemoteSendToken">{{ remoteSendLabel }}</button>
          <button class="bw-btn" @click="downloadResultReceipt">Download receipt</button>
          <button class="bw-btn" @click="viewResultReceipt">View receipt</button>
          <button class="bw-btn" @click="printResultReceipt">Print receipt</button>
        </div>
      </div>
      <button class="bw-btn primary" style="width:100%; justify-content:center" @click="reset">
        Buy another
      </button>
    </template>
  </AppShell>
</template>

<style scoped>
.bw-stepup-backdrop {
  position: fixed; inset: 0;
  background: oklch(0% 0 0 / 0.6);
  display: grid; place-items: center;
  z-index: 300;
  padding: var(--s-4);
}
.bw-stepup-modal {
  background: var(--surface-0);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  padding: var(--s-7);
  width: min(420px, 100%);
  display: flex; flex-direction: column;
}

.buy-token-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
  margin-top: var(--s-3);
}

.buy-token-actions .bw-btn {
  min-width: 0;
  justify-content: center;
}

@media (max-width: 520px) {
  .buy-token-actions {
    grid-template-columns: 1fr;
  }
}
</style>
