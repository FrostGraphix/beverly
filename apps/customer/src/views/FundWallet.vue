<script setup lang="ts">
import { ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira } from '../lib/format';

const amountRaw = ref('');
const quickAmts = [100_00, 500_00, 1000_00, 2000_00, 5000_00, 10000_00];
const loading   = ref(false);
const error     = ref<string | null>(null);

const amountMinor = () => Math.round(parseFloat(amountRaw.value || '0') * 100);

async function fund() {
    const amt = amountMinor();
    if (amt < 50000) { error.value = 'Minimum top-up is ₦500.'; return; }
    loading.value = true; error.value = null;
    try {
        const r = await api.post<{ authorizationUrl: string }>('/api/v1/customer/wallet/fund', {
            amount_minor: amt,
            callback_url: `${window.location.origin}/wallet?funded=1`,
        });
        window.location.href = r.authorizationUrl;
    } catch (e: any) {
        error.value = e?.message ?? 'Could not initiate payment.';
    } finally { loading.value = false; }
}
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

      <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm); margin-bottom: var(--s-3)">{{ error }}</div>

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
