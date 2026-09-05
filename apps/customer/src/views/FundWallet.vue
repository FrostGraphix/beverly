<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, idempotencyHeaders, newIdempotencyKey, redirectToPayment } from '../lib/api';
import { naira } from '../lib/format';

const PAYSTACK_AVAILABLE = import.meta.env.VITE_PAYSTACK_PAYMENTS_ENABLED === 'true';
type Mode = 'paystack' | 'bank';
const mode = ref<Mode>('bank');

const amountRaw = ref('');
const quickAmts = [100_00, 500_00, 1000_00, 2000_00, 5000_00, 10000_00];
const loading   = ref(false);
const error     = ref<string | null>(null);
const success   = ref<string | null>(null);
const proofFile = ref<File | null>(null);
const copied = ref(false);
const PROOF_MAX_BYTES = 8 * 1024 * 1024;
const PROOF_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

const amountMinor = () => Math.round(parseFloat(amountRaw.value || '0') * 100);
const minimumMinor = computed(() => mode.value === 'bank' ? 100_000 : 50_000);
const amountValid = computed(() => Number.isInteger(amountMinor()) && amountMinor() >= minimumMinor.value && amountMinor() <= 1_000_000_000);

function selectMode(next: Mode) {
    if (next === 'paystack' && !PAYSTACK_AVAILABLE) {
        error.value = 'Paystack is temporarily unavailable. Kindly use bank transfer.';
        mode.value = 'bank';
        return;
    }
    mode.value = next;
    error.value = null;
    success.value = null;
}

async function copyAccountNumber() {
    try {
        await navigator.clipboard.writeText('4011606766');
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 2000);
    } catch { copied.value = false; }
}

function selectProof(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    error.value = null;
    if (!file) { proofFile.value = null; return; }
    if (!PROOF_MIME_TYPES.has(file.type)) {
        input.value = ''; proofFile.value = null; error.value = 'Proof must be a PDF, JPG, PNG, or WebP file.'; return;
    }
    if (file.size > PROOF_MAX_BYTES) {
        input.value = ''; proofFile.value = null; error.value = 'Proof file must be 8MB or smaller.'; return;
    }
    proofFile.value = file;
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? '').split(',').pop() ?? '');
        reader.onerror = () => reject(new Error('Could not read proof file.'));
        reader.readAsDataURL(file);
    });
}

async function submitBankTransfer() {
    if (!amountValid.value) { error.value = 'Enter an amount from ₦1,000 to ₦10,000,000.'; return; }
    if (!proofFile.value) { error.value = 'Upload your transfer proof.'; return; }
    loading.value = true; error.value = null; success.value = null;
    try {
        const proofBase64 = await fileToBase64(proofFile.value);
        await api.post('/api/v1/customer/funding/bank-transfer', {
            amountMinor: amountMinor(), proofFileName: proofFile.value.name,
            proofMimeType: proofFile.value.type, proofBase64,
        });
        proofFile.value = null;
        success.value = 'Bank transfer proof submitted. Finance will review it and credit your wallet after approval.';
    } catch (cause: any) {
        error.value = cause?.message ?? 'The bank transfer request could not be submitted.';
    } finally { loading.value = false; }
}

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
    if (!PAYSTACK_AVAILABLE) {
        error.value = 'Paystack is temporarily unavailable. Kindly use bank transfer.';
        mode.value = 'bank';
        return;
    }
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
      <p class="bw-muted" style="font-size: var(--t-sm); margin-bottom: var(--s-4)">Add money securely.</p>

      <div class="funding-methods" aria-label="Funding method">
        <button type="button" :class="['bw-btn', mode === 'paystack' ? 'primary' : '']" :disabled="loading || !PAYSTACK_AVAILABLE" @click="selectMode('paystack')">Paystack</button>
        <button type="button" :class="['bw-btn', mode === 'bank' ? 'primary' : '']" :disabled="loading" @click="selectMode('bank')">Bank transfer</button>
      </div>

      <div v-if="!PAYSTACK_AVAILABLE" class="bw-alert warn" role="status" style="margin-bottom: var(--s-4); display:grid; gap:var(--s-2)">
        <strong>Paystack temporarily unavailable.</strong>
        <span>Kindly use bank transfer.</span>
        <button type="button" class="bw-btn primary" style="justify-content:center" @click="mode = 'bank'">Use bank transfer</button>
      </div>

      <template v-if="mode === 'paystack'">
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
              :disabled="loading || amountMinor() < 50000 || !PAYSTACK_AVAILABLE" @click="fund">
        {{ loading ? 'Redirecting…' : `Pay ${amountRaw ? naira(amountMinor()) : ''}` }}
      </button>

      <p class="bw-muted" style="font-size: var(--t-xs); text-align:center; margin-top: var(--s-4)">
        Paystack remains paused.
      </p>
      </template>

      <template v-else>
        <div class="bank-details">
          <span class="bw-badge success">FIDELITY BANK</span>
          <span class="bank-label">ACCOUNT NUMBER</span>
          <div class="bank-number-row"><strong class="bw-mono">4011606766</strong><button type="button" class="bw-btn sm" @click="copyAccountNumber">{{ copied ? 'Copied!' : 'Copy' }}</button></div>
          <dl><div><dt>Account name</dt><dd>ACOB LIGHTING TECHNOLOGY LTD</dd></div><div><dt>Purpose</dt><dd>SALES COLLECTION ACCOUNT</dd></div></dl>
          <p><strong>Narration:</strong> Include your full name or registered email in the transfer narration.</p>
        </div>

        <label class="bw-label" for="customer-bank-amount">Amount transferred (₦)</label>
        <input id="customer-bank-amount" class="bw-input bw-mono" v-model="amountRaw" type="number" min="1000" max="10000000" step="0.01" inputmode="decimal" placeholder="0.00" />
        <div class="bw-quick-amounts" style="margin:var(--s-3) 0 var(--s-4)">
          <button v-for="a in [100000,250000,500000,1000000]" :key="a" :class="['bw-quick-amt', amountMinor() === a ? 'active' : '']" @click="amountRaw = (a/100).toString()">{{ naira(a) }}</button>
        </div>
        <label class="bw-label" for="customer-bank-proof">Upload proof of transfer</label>
        <input id="customer-bank-proof" class="bw-input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" @change="selectProof" />
        <p class="bw-muted proof-help">PDF, JPG, PNG, or WebP. Maximum 8MB.</p>

        <div v-if="error" class="bw-alert danger" role="alert">{{ error }}</div>
        <div v-if="success" class="bw-alert success" role="status">{{ success }}</div>
        <button type="button" class="bw-btn primary lg submit-bank" :disabled="loading || !proofFile || !amountValid" @click="submitBankTransfer">{{ loading ? 'Submitting…' : 'Submit for approval' }}</button>
        <p class="bw-muted proof-help center">Your wallet is credited only after a finance reviewer approves the transfer.</p>
      </template>
    </div>
  </AppShell>
</template>

<style scoped>
.funding-methods { display:grid; grid-template-columns:1fr 1fr; gap:var(--s-2); margin-bottom:var(--s-4); }
.funding-methods .bw-btn { justify-content:center; }
.bank-details { display:grid; gap:var(--s-2); padding:var(--s-4); margin-bottom:var(--s-4); border:1px solid var(--glass-border); border-radius:var(--r-lg); background:var(--surface-2); }
.bank-details > .bw-badge { justify-self:start; }
.bank-label, .bank-details dt { color:var(--text-muted); font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
.bank-number-row { display:flex; align-items:center; justify-content:space-between; gap:var(--s-3); }
.bank-number-row strong { color:var(--brand); font-size:clamp(1.25rem,5vw,1.7rem); letter-spacing:.08em; }
.bank-details dl { display:grid; grid-template-columns:1fr 1fr; gap:var(--s-2); margin:0; }
.bank-details dl div { padding:var(--s-2); border:1px solid var(--border); border-radius:var(--r-sm); }
.bank-details dd { margin:4px 0 0; font-size:var(--t-sm); }
.bank-details p, .proof-help { margin:0; color:var(--text-muted); font-size:var(--t-xs); line-height:1.5; }
.submit-bank { width:100%; justify-content:center; margin-top:var(--s-4); }
.center { text-align:center; margin-top:var(--s-2); }
.bw-alert { margin-top:var(--s-3); }
@media (max-width:480px) { .bank-details dl { grid-template-columns:1fr; } }
</style>
