<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
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
    try {
        const r = await api.get<{ funding: FundingRequest[] }>('/api/v1/vendor/funding?limit=20');
        funding.value = r.funding;
    } catch {
        // Funding history should not block a fresh funding attempt.
    }
}

async function payNow() {
    loading.value = true;
    error.value = null;
    success.value = null;
    try {
        const r = await api.post<{ authorizationUrl: string }>('/api/v1/vendor/funding/paystack', {
            amountMinor: amountNaira.value * 100,
            callbackUrl: `${window.location.origin}/wallet?funded=1`,
        });
        window.location.assign(r.authorizationUrl);
    } catch (e: any) {
        error.value = e?.message ?? 'Failed to initiate payment';
        loading.value = false;
    }
}

async function submitProof() {
    if (!proofFile.value) return;
    if (proofFile.value.size > 8 * 1024 * 1024) {
        error.value = 'Proof file must be 8MB or smaller.';
        return;
    }

    loading.value = true;
    error.value = null;
    success.value = null;
    try {
        const proofBase64 = await fileToBase64(proofFile.value);
        await api.post<FundingRequest>('/api/v1/vendor/funding/bank-transfer', {
            amountMinor: amountNaira.value * 100,
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

onMounted(() => {
    if (new URLSearchParams(window.location.search).get('funded') === '1') {
        success.value = 'Payment received by Paystack. Your wallet will update after webhook confirmation.';
    }
    void loadFunding();
});
</script>

<template>
  <AppShell title="Fund Wallet">
    <div style="max-width: 560px; margin: 0 auto" class="bw-stack">
      <div class="bw-card">
        <h1 class="bw-h1">Add funds</h1>
        <p class="bw-muted">Top up your vending wallet.</p>

        <div class="bw-row" style="margin-top: var(--s-4); gap: var(--s-2)">
          <button :class="['bw-btn', mode === 'paystack' ? 'primary' : '']" style="flex: 1; justify-content: center"
                  @click="mode = 'paystack'">Paystack</button>
          <button :class="['bw-btn', mode === 'bank' ? 'primary' : '']" style="flex: 1; justify-content: center"
                  @click="mode = 'bank'">Bank transfer</button>
        </div>
      </div>

      <div v-if="mode === 'paystack'" class="bw-card">
        <label class="bw-label">Amount (NGN)</label>
        <input class="bw-input bw-mono" type="number" min="500" step="500" v-model.number="amountNaira" style="font-size: var(--t-xl)" />
        <div class="bw-row" style="margin-top: var(--s-3); gap: var(--s-2); flex-wrap: wrap">
          <button v-for="n in [5000, 10000, 25000, 50000, 100000, 250000]" :key="n"
                  class="bw-btn sm" @click="amountNaira = n">NGN {{ n.toLocaleString() }}</button>
        </div>

        <p v-if="error" class="bw-alert danger" style="margin-top: var(--s-4)">{{ error }}</p>
        <p v-if="success" class="bw-alert success" style="margin-top: var(--s-4)">{{ success }}</p>

        <button class="bw-btn primary" style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 44px"
                @click="payNow" :disabled="loading || amountNaira < 500">
          {{ loading ? 'Initiating...' : `Pay ${naira(amountNaira * 100)} with Paystack` }}
        </button>
        <p class="bw-muted" style="font-size: var(--t-xs); margin-top: var(--s-3); text-align: center">
          Cards, bank transfer, USSD. Credit posts after webhook confirmation.
        </p>
      </div>

      <div v-if="mode === 'bank'" class="bw-card">
        <p class="bw-label">Bank details</p>
        <p class="bw-mono" style="font-size: var(--t-lg); margin: 0">ACOB Lighting - 0123456789</p>
        <p class="bw-muted" style="font-size: var(--t-sm); margin-top: 4px">Reference: include your organization name in narration.</p>

        <label class="bw-label" style="margin-top: var(--s-4)">Amount transferred (NGN)</label>
        <input class="bw-input bw-mono" type="number" min="1000" step="500" v-model.number="amountNaira" />

        <label class="bw-label" style="margin-top: var(--s-4)">Upload proof</label>
        <input type="file" accept="image/*,application/pdf" @change="(e: any) => proofFile = e.target.files?.[0] ?? null" />
        <p v-if="proofFile" class="bw-muted" style="font-size: var(--t-xs); margin-top: 6px">{{ proofFile.name }}</p>

        <p v-if="error" class="bw-alert warn" style="margin-top: var(--s-4)">{{ error }}</p>
        <p v-if="success" class="bw-alert success" style="margin-top: var(--s-4)">{{ success }}</p>

        <button class="bw-btn primary" style="margin-top: var(--s-4); width: 100%; justify-content: center; height: 44px"
                @click="submitProof" :disabled="loading || !proofFile || amountNaira < 1000">
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
          <button class="bw-btn sm" @click="loadFunding">Refresh</button>
        </div>
        <div v-if="recentFunding.length" class="bw-stack" style="margin-top: var(--s-4)">
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
        <p v-else class="bw-muted" style="font-size: var(--t-sm); margin-top: var(--s-4); text-align: center">No funding activity yet.</p>
      </div>
    </div>
  </AppShell>
</template>
