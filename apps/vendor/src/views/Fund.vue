<script setup lang="ts">
import { ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira } from '../lib/format';

type Mode = 'paystack' | 'bank';
const mode = ref<Mode>('paystack');
const amountNaira = ref(50000);
const loading = ref(false);
const error = ref<string | null>(null);

async function payNow() {
    loading.value = true; error.value = null;
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

const proofFile = ref<File | null>(null);
async function submitProof() {
    if (!proofFile.value) return;
    loading.value = true; error.value = null;
    try {
        error.value = 'Proof upload not yet wired — coming in a backend update.';
    } catch (e: any) {
        error.value = e?.message ?? 'Upload failed';
    } finally {
        loading.value = false;
    }
}
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

      <!-- Paystack -->
      <div v-if="mode === 'paystack'" class="bw-card">
        <label class="bw-label">Amount (₦)</label>
        <input class="bw-input bw-mono" type="number" min="500" step="500" v-model.number="amountNaira" style="font-size: var(--t-xl)" />
        <div class="bw-row" style="margin-top: var(--s-3); gap: var(--s-2); flex-wrap: wrap">
          <button v-for="n in [5000, 10000, 25000, 50000, 100000, 250000]" :key="n"
                  class="bw-btn sm" @click="amountNaira = n">₦{{ n.toLocaleString() }}</button>
        </div>

        <p v-if="error" class="bw-alert danger" style="margin-top: var(--s-4)">{{ error }}</p>

        <button class="bw-btn primary" style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 44px"
                @click="payNow" :disabled="loading || amountNaira < 500">
          {{ loading ? 'Initiating…' : `Pay ${naira(amountNaira * 100)} with Paystack` }}
        </button>
        <p class="bw-muted" style="font-size: var(--t-xs); margin-top: var(--s-3); text-align: center">
          Cards, bank transfer, USSD. Credit posts after webhook confirmation.
        </p>
      </div>

      <!-- Bank transfer -->
      <div v-if="mode === 'bank'" class="bw-card">
        <p class="bw-label">Bank details</p>
        <p class="bw-mono" style="font-size: var(--t-lg); margin: 0">ACOB Lighting · 0123456789</p>
        <p class="bw-muted" style="font-size: var(--t-sm); margin-top: 4px">Reference: include your organization name in narration.</p>

        <label class="bw-label" style="margin-top: var(--s-4)">Amount transferred (₦)</label>
        <input class="bw-input bw-mono" type="number" min="1000" v-model.number="amountNaira" />

        <label class="bw-label" style="margin-top: var(--s-4)">Upload proof</label>
        <input type="file" accept="image/*,application/pdf" @change="(e: any) => proofFile = e.target.files?.[0] ?? null" />
        <p v-if="proofFile" class="bw-muted" style="font-size: var(--t-xs); margin-top: 6px">{{ proofFile.name }}</p>

        <p v-if="error" class="bw-alert warn" style="margin-top: var(--s-4)">{{ error }}</p>

        <button class="bw-btn primary" style="margin-top: var(--s-4); width: 100%; justify-content: center; height: 44px"
                @click="submitProof" :disabled="loading || !proofFile">
          Submit for approval
        </button>
        <p class="bw-muted" style="font-size: var(--t-xs); margin-top: var(--s-3); text-align: center">
          Funds credited after staff approval. Typically within 30 minutes during business hours.
        </p>
      </div>
    </div>
  </AppShell>
</template>
