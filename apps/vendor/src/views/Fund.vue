<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, idempotencyHeaders, newIdempotencyKey, redirectToPayment } from '../lib/api';
import { naira } from '../lib/format';

type Mode = 'paystack' | 'bank';

interface FundingRequest {
    id: string;
    amount_minor: number;
    channel: 'bank_transfer' | 'paystack' | 'manual';
    status: string;
    funding_reference: string | null;
    proof_file_path: string | null;
    proof_view_url?: string | null;
    created_at: string;
}

const mode = ref<Mode>('paystack');
const amountNaira = ref(50000);
const loading = ref(false);
const error = ref<string | null>(null);
const success = ref<string | null>(null);
const proofFile = ref<File | null>(null);
const funding = ref<FundingRequest[]>([]);
const fundingLoading = ref(false);
const fundingLoadError = ref(false);

const MAX_AMOUNT_MINOR = 1_000_000_000;
const PROOF_MAX_BYTES = 8 * 1024 * 1024;
const PROOF_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const amountMinor = computed(() => Number(amountNaira.value) * 100);
const minimumAmountMinor = computed(() => mode.value === 'paystack' ? 50_000 : 100_000);
const amountValid = computed(() => Number.isInteger(amountMinor.value)
    && amountMinor.value >= minimumAmountMinor.value
    && amountMinor.value <= MAX_AMOUNT_MINOR);
const amountHelp = computed(() => `Enter ${naira(minimumAmountMinor.value)} to ${naira(MAX_AMOUNT_MINOR)}.`);

const recentFunding = computed(() => funding.value.slice(0, 5));

function statusTone(status: string) {
    if (status === 'approved') return 'success';
    if (status === 'rejected' || status === 'expired' || status === 'cancelled') return 'danger';
    if (status === 'initiated') return 'neutral';
    return 'warn';
}

function formatDate(value: string) {
    try {
        return new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(value));
    } catch {
        return value;
    }
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result ?? '');
            resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = () => reject(new Error('Could not read proof file'));
        reader.readAsDataURL(file);
    });
}

async function loadFunding() {
    fundingLoading.value = true;
    fundingLoadError.value = false;
    try {
        const r = await api.get<{ funding: FundingRequest[] }>('/api/v1/vendor/funding?limit=20');
        funding.value = r.funding;
    } catch {
        fundingLoadError.value = true;
    } finally {
        fundingLoading.value = false;
    }
}

function selectMode(nextMode: Mode) {
    if (loading.value) return;
    mode.value = nextMode;
    error.value = null;
    success.value = null;
}

function selectProof(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    error.value = null;
    success.value = null;
    if (!file) {
        proofFile.value = null;
        return;
    }
    if (!PROOF_MIME_TYPES.has(file.type)) {
        proofFile.value = null;
        input.value = '';
        error.value = 'Proof must be a PDF, JPG, PNG, or WebP file.';
        return;
    }
    if (file.size > PROOF_MAX_BYTES) {
        proofFile.value = null;
        input.value = '';
        error.value = 'Proof file must be 8MB or smaller.';
        return;
    }
    proofFile.value = file;
}

// One key per funding intent: retrying after a failure reuses it, so a
// double-click cannot open two checkouts. Changing the amount is a new intent.
const paystackIntentKey = ref(newIdempotencyKey());
const paystackIntentAmount = ref<number | null>(null);

async function payNow() {
    if (!amountValid.value) {
        error.value = amountHelp.value;
        return;
    }
    loading.value = true;
    error.value = null;
    success.value = null;
    if (paystackIntentAmount.value !== amountMinor.value) {
        paystackIntentKey.value = newIdempotencyKey();
        paystackIntentAmount.value = amountMinor.value;
    }
    try {
        const r = await api.post<{ authorizationUrl: string }>(
            '/api/v1/vendor/funding/paystack',
            { amountMinor: amountMinor.value },
            idempotencyHeaders(paystackIntentKey.value),
        );
        redirectToPayment(r.authorizationUrl);
    } catch (e: any) {
        error.value = e?.message ?? 'Failed to initiate payment';
        loading.value = false;
    }
}

async function submitProof() {
    if (!amountValid.value) {
        error.value = amountHelp.value;
        return;
    }
    if (!proofFile.value) {
        error.value = 'Upload your transfer proof.';
        return;
    }

    loading.value = true;
    error.value = null;
    success.value = null;
    try {
        const proofBase64 = await fileToBase64(proofFile.value);
        await api.post<FundingRequest>('/api/v1/vendor/funding/bank-transfer', {
            amountMinor: amountMinor.value,
            proofFileName: proofFile.value.name,
            proofMimeType: proofFile.value.type || 'application/octet-stream',
            proofBase64,
        });
        success.value = 'Bank transfer proof submitted. Finance will review and credit your wallet after approval.';
        proofFile.value = null;
        await loadFunding();
    } catch (e: any) {
        error.value = e?.message ?? 'Upload failed';
    } finally {
        loading.value = false;
    }
}

onMounted(async () => {
    const query = new URLSearchParams(window.location.search);
    const reference = query.get('reference') ?? query.get('trxref');
    if (reference) {
        loading.value = true;
        try {
            const payment = await api.post<{ status: string; fulfillmentStatus: string }>(
                `/api/v1/vendor/payments/${encodeURIComponent(reference)}/verify`,
            );
            if (payment.status === 'succeeded' && ['fulfilled', 'already_fulfilled'].includes(payment.fulfillmentStatus)) {
                success.value = 'Payment confirmed. Your wallet has been credited.';
                error.value = null;
            } else if (payment.fulfillmentStatus === 'blocked' || payment.status === 'requires_review') {
                error.value = 'Payment confirmed, but the wallet credit needs review. Support has been notified; do not pay again.';
                success.value = null;
            } else if (payment.status === 'failed' || payment.fulfillmentStatus === 'failed' || payment.status === 'abandoned') {
                error.value = 'Payment was not completed or failed on Paystack. Your wallet was not charged.';
                success.value = null;
            } else {
                error.value = 'Payment is pending. Your wallet will update automatically once confirmed by Paystack.';
                success.value = null;
            }
        } catch (e: any) {
            error.value = e?.message ?? 'Could not verify payment. Webhook reconciliation will continue automatically.';
            success.value = null;
        } finally {
            loading.value = false;
        }
    }
    await loadFunding();
});
</script>

<template>
  <AppShell title="Fund Wallet">
    <div style="max-width: 560px; margin: 0 auto" class="bw-stack">
      <div class="bw-card">
        <h1 class="bw-h1">Add funds</h1>
        <p class="bw-muted">Top up your vending wallet.</p>

        <div class="bw-row" style="margin-top: var(--s-4); gap: var(--s-2)" aria-label="Funding method">
          <button type="button" :class="['bw-btn', mode === 'paystack' ? 'primary' : '']"
                  :aria-pressed="mode === 'paystack'" :disabled="loading"
                  style="flex: 1; justify-content: center" @click="selectMode('paystack')">Paystack</button>
          <button type="button" :class="['bw-btn', mode === 'bank' ? 'primary' : '']"
                  :aria-pressed="mode === 'bank'" :disabled="loading"
                  style="flex: 1; justify-content: center" @click="selectMode('bank')">Bank transfer</button>
        </div>
      </div>

      <div v-if="mode === 'paystack'" class="bw-card">
        <label class="bw-label" for="vendor-fund-amount">Amount (NGN)</label>
        <input id="vendor-fund-amount" class="bw-input bw-mono" type="number" min="500" max="10000000"
               step="0.01" inputmode="decimal" v-model.number="amountNaira" aria-describedby="vendor-fund-amount-help"
               style="font-size: var(--t-xl)" />
        <p id="vendor-fund-amount-help" class="bw-muted" style="font-size: var(--t-xs); margin-top: 6px">{{ amountHelp }}</p>
        <div class="bw-row" style="margin-top: var(--s-3); gap: var(--s-2); flex-wrap: wrap">
          <button v-for="n in [5000, 10000, 25000, 50000, 100000, 250000]" :key="n"
                  type="button" class="bw-btn sm" :aria-pressed="amountNaira === n"
                  @click="amountNaira = n">NGN {{ n.toLocaleString() }}</button>
        </div>

        <p v-if="error" class="bw-alert danger" role="alert" style="margin-top: var(--s-4)">{{ error }}</p>
        <p v-if="success" class="bw-alert success" role="status" aria-live="polite" style="margin-top: var(--s-4)">{{ success }}</p>

        <button class="bw-btn primary" style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 44px"
                @click="payNow" :disabled="loading || !amountValid">
          {{ loading ? 'Initiating...' : `Pay ${amountValid ? naira(amountMinor) : ''} with Paystack` }}
        </button>
        <p class="bw-muted" style="font-size: var(--t-xs); margin-top: var(--s-3); text-align: center">
          Cards, bank transfer, USSD. Credit posts after webhook confirmation.
        </p>
      </div>

      <div v-if="mode === 'bank'" class="bw-card">
        <p class="bw-label">Bank details</p>
        <p class="bw-mono" style="font-size: var(--t-lg); margin: 0">ACOB Lighting - 0123456789</p>
        <p class="bw-muted" style="font-size: var(--t-sm); margin-top: 4px">Reference: include your organization name in narration.</p>

        <label class="bw-label" for="vendor-bank-amount" style="margin-top: var(--s-4)">Amount transferred (NGN)</label>
        <input id="vendor-bank-amount" class="bw-input bw-mono" type="number" min="1000" max="10000000"
               step="0.01" inputmode="decimal" v-model.number="amountNaira" aria-describedby="vendor-bank-amount-help" />
        <p id="vendor-bank-amount-help" class="bw-muted" style="font-size: var(--t-xs); margin-top: 6px">{{ amountHelp }}</p>

        <label class="bw-label" for="vendor-bank-proof" style="margin-top: var(--s-4)">Upload proof</label>
        <input id="vendor-bank-proof" class="bw-input bw-file-input" type="file"
               accept="application/pdf,image/jpeg,image/png,image/webp" aria-describedby="vendor-bank-proof-help"
               @change="selectProof" />
        <p id="vendor-bank-proof-help" class="bw-muted" style="font-size: var(--t-xs); margin-top: 6px">PDF, JPG, PNG, or WebP. Maximum 8MB.</p>
        <p v-if="proofFile" class="bw-muted" style="font-size: var(--t-xs); margin-top: 6px">{{ proofFile.name }}</p>

        <p v-if="error" class="bw-alert warn" role="alert" style="margin-top: var(--s-4)">{{ error }}</p>
        <p v-if="success" class="bw-alert success" role="status" aria-live="polite" style="margin-top: var(--s-4)">{{ success }}</p>

        <button class="bw-btn primary" style="margin-top: var(--s-4); width: 100%; justify-content: center; height: 44px"
                @click="submitProof" :disabled="loading || !proofFile || !amountValid">
          {{ loading ? 'Submitting...' : 'Submit for approval' }}
        </button>
        <p class="bw-muted" style="font-size: var(--t-xs); margin-top: var(--s-3); text-align: center">
          Funds credited after staff approval. Typically within 30 minutes during business hours.
        </p>
      </div>

      <div class="bw-card">
        <div class="bw-row" style="justify-content: space-between; gap: var(--s-3)">
          <div>
            <h2 class="bw-h2" style="margin: 0">Funding activity</h2>
            <p class="bw-muted" style="font-size: var(--t-xs); margin: 4px 0 0">Paystack payments and bank-transfer approvals.</p>
          </div>
          <button type="button" class="bw-btn sm" @click="loadFunding" :disabled="fundingLoading">
            {{ fundingLoading ? 'Refreshing...' : 'Refresh' }}
          </button>
        </div>
        <p v-if="fundingLoadError" class="bw-alert warn" role="alert" style="margin-top: var(--s-4)">
          Funding activity could not load. Try refreshing.
        </p>
        <div v-else-if="recentFunding.length" class="bw-stack" style="margin-top: var(--s-4)">
          <div v-for="item in recentFunding" :key="item.id" class="bw-card" style="padding: var(--s-3); background: rgba(255,255,255,.02)">
            <div class="bw-row" style="justify-content: space-between; gap: var(--s-3)">
              <div>
                <strong>{{ naira(item.amount_minor) }}</strong>
                <div class="bw-muted bw-mono" style="font-size: var(--t-xs)">{{ item.channel }} - {{ formatDate(item.created_at) }}</div>
                <a v-if="item.proof_view_url" :href="item.proof_view_url" target="_blank" rel="noopener" class="bw-mono" style="font-size: var(--t-xs); color: var(--brand)">View proof</a>
              </div>
              <span :class="['bw-badge', statusTone(item.status)]">{{ item.status }}</span>
            </div>
          </div>
        </div>
        <p v-else-if="!fundingLoading" class="bw-muted" style="font-size: var(--t-sm); margin-top: var(--s-4); text-align: center">No funding activity yet.</p>
      </div>
    </div>
  </AppShell>
</template>
