<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, idempotencyHeaders, newIdempotencyKey, redirectToPayment } from '../lib/api';
import { naira } from '../lib/format';

const amountRaw = ref('');
const quickAmts = [100_00, 500_00, 1000_00, 2000_00, 5000_00, 10000_00];
const loading   = ref(false);
const error     = ref<string | null>(null);
const success   = ref<string | null>(null);

const amountMinor = () => Math.round(parseFloat(amountRaw.value || '0') * 100);

// One key per top-up intent, so a double-click cannot open two checkouts.
const fundIntentKey = ref(newIdempotencyKey());
const fundIntentAmount = ref<number | null>(null);

// ── Pending top-up recovery ─────────────────────────────────────────
// If the browser is closed on Paystack's page before the redirect back,
// this reference would otherwise only ever resolve via webhook. Persist it
// so the customer can manually re-check without leaving this page.
const PENDING_KEY = 'beverly.wallet.pending_topup';
interface PendingTopup { reference: string; amountMinor: number; savedAt: number; }
const pendingTopup = ref<PendingTopup | null>(null);
const checkingPending = ref(false);

function savePendingTopup(reference: string, amt: number) {
    try {
        localStorage.setItem(PENDING_KEY, JSON.stringify({ reference, amountMinor: amt, savedAt: Date.now() }));
    } catch { /* storage unavailable */ }
}

function clearPendingTopup() {
    try { localStorage.removeItem(PENDING_KEY); } catch { /* noop */ }
    pendingTopup.value = null;
}

async function verifyReference(reference: string): Promise<boolean> {
    const payment = await api.post<{ status: string; fulfillmentStatus: string }>(
        `/api/v1/customer/payments/${encodeURIComponent(reference)}/verify`,
    );
    if (payment.status === 'succeeded' && ['fulfilled', 'already_fulfilled'].includes(payment.fulfillmentStatus)) {
        success.value = 'Payment confirmed. Your wallet has been credited.';
        error.value = null;
        clearPendingTopup();
        return true;
    }
    if (payment.fulfillmentStatus === 'blocked' || payment.status === 'requires_review') {
        error.value = 'Payment confirmed, but the wallet credit needs review. Support has been notified; do not pay again.';
        success.value = null;
        clearPendingTopup();
        return true;
    }
    if (payment.status === 'failed' || payment.fulfillmentStatus === 'failed' || payment.status === 'abandoned') {
        error.value = 'Payment was not completed or failed on Paystack. Your wallet was not charged.';
        success.value = null;
        clearPendingTopup();
        return false;
    }
    error.value = 'Payment is pending. Your wallet will update automatically once confirmed by Paystack.';
    success.value = null;
    return false;
}

async function checkPendingTopup() {
    if (!pendingTopup.value || checkingPending.value) return;
    checkingPending.value = true;
    error.value = null;
    try {
        await verifyReference(pendingTopup.value.reference);
    } catch (e: any) {
        error.value = e?.message ?? 'Could not verify payment. Your wallet will still update after webhook confirmation.';
    } finally {
        checkingPending.value = false;
    }
}

async function fund() {
    const amt = amountMinor();
    if (amt < 50000) { error.value = 'Minimum top-up is ₦500.'; return; }
    loading.value = true; error.value = null;
    if (fundIntentAmount.value !== amt) {
        fundIntentKey.value = newIdempotencyKey();
        fundIntentAmount.value = amt;
    }
    try {
        const r = await api.post<{ authorizationUrl: string; reference?: string }>(
            '/api/v1/customer/wallet/fund',
            { amount_minor: amt },
            idempotencyHeaders(fundIntentKey.value),
        );
        if (r.reference) savePendingTopup(r.reference, amt);
        redirectToPayment(r.authorizationUrl);
    } catch (e: any) {
        error.value = e?.message ?? 'Could not initiate payment.';
    } finally { loading.value = false; }
}

onMounted(async () => {
    const query = new URLSearchParams(window.location.search);
    const reference = query.get('reference') ?? query.get('trxref');

    try {
        const raw = localStorage.getItem(PENDING_KEY);
        if (raw) pendingTopup.value = JSON.parse(raw);
    } catch { /* malformed — ignore */ }

    if (!reference) return;
    loading.value = true;
    try {
        await verifyReference(reference);
    } catch (e: any) {
        error.value = e?.message ?? 'Could not verify payment. Your wallet will still update after webhook confirmation.';
    } finally {
        loading.value = false;
    }
});
</script>

<template>
  <AppShell>
    <div class="bw-card">
      <p class="bw-page-title" style="margin-bottom: var(--s-1)">Add money</p>
      <p class="bw-muted" style="font-size: var(--t-sm); margin-bottom: var(--s-5)">
        Fund your wallet via card, bank transfer, or USSD
      </p>

      <label class="bw-label">Amount (₦)</label>
      <input class="bw-input bw-mono" v-model="amountRaw" type="number" min="500"
             inputmode="numeric" placeholder="0.00"
             style="font-size: var(--t-2xl); font-weight:700; text-align:right; margin-bottom: var(--s-3)" />

      <div class="bw-quick-amounts" style="margin-bottom: var(--s-5)">
        <button v-for="a in quickAmts" :key="a"
                :class="['bw-quick-amt', amountMinor() === a ? 'active' : '']"
                @click="amountRaw = (a/100).toString()">
          {{ naira(a) }}
        </button>
      </div>

      <div v-if="pendingTopup" class="bw-alert" style="margin-bottom: var(--s-3); display: grid; gap: 6px">
        <strong>Pending top-up: {{ naira(pendingTopup.amountMinor) }}</strong>
        <span>We haven't confirmed this payment yet. If you already paid, check its status below instead of paying again.</span>
        <div style="display:flex; gap: var(--s-2)">
          <button class="bw-btn primary" style="justify-content:center" :disabled="checkingPending" @click="checkPendingTopup">
            {{ checkingPending ? 'Checking…' : 'Check pending top-up' }}
          </button>
          <button class="bw-btn" @click="clearPendingTopup">Dismiss</button>
        </div>
      </div>

      <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm); margin-bottom: var(--s-3)">{{ error }}</div>
      <div v-if="success" class="bw-alert success" style="font-size: var(--t-sm); margin-bottom: var(--s-3)">{{ success }}</div>

      <button class="bw-btn primary lg" style="width:100%; justify-content:center"
              :disabled="loading || amountMinor() < 50000" @click="fund">
        {{ loading ? 'Redirecting…' : `Pay ${amountRaw ? naira(amountMinor()) : ''}` }}
      </button>

      <p class="bw-muted" style="font-size: var(--t-xs); text-align:center; margin-top: var(--s-4)">
        Secured by Paystack · Card, bank transfer, USSD
      </p>
    </div>
  </AppShell>
</template>
