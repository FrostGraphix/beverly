<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import OnboardingChecklist from '../components/OnboardingChecklist.vue';
import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';
import { naira, shortDate } from '../lib/format';
import WalletGreeting from '@beverly/tokens/WalletGreeting.vue';

const auth    = useAuthStore();
const wallet  = ref<any>(null);
const ledger  = ref<any[]>([]);
const loading = ref(false);
const customerName = computed(() => auth.customer?.full_name?.split(' ')[0] || 'there');

onMounted(async () => {
    loading.value = true;
    try {
        const [w, l] = await Promise.all([
            api.get<any>('/api/v1/customer/wallet'),
            api.get<{ entries: any[] }>('/api/v1/customer/wallet/ledger?limit=5'),
        ]);
        wallet.value = w;
        ledger.value = l.entries;
    } catch { /* noop */ } finally { loading.value = false; }
});

</script>

<template>
  <AppShell>
    <WalletGreeting
      audience="Customer wallet"
      :name="customerName"
      detail="for top-ups, meters, and token purchases."
    />

    <!-- Balance hero -->
    <div v-if="loading" class="bw-balance-hero customer-balance-skeleton" role="status" aria-label="Loading dashboard">
      <span class="bw-skeleton customer-balance-skeleton-label"></span>
      <span class="bw-skeleton customer-balance-skeleton-value"></span>
      <span class="bw-skeleton customer-balance-skeleton-available"></span>
      <div class="customer-balance-skeleton-actions">
        <span class="bw-skeleton customer-balance-skeleton-button"></span>
        <span class="bw-skeleton customer-balance-skeleton-button"></span>
      </div>
    </div>
    <div v-else class="bw-balance-hero">
      <p class="bw-label" style="color: var(--brand); margin:0 0 var(--s-1)">Wallet balance</p>
      <div class="bw-kpi-value" style="color: var(--brand); font-size: var(--t-4xl); margin-bottom: var(--s-1)">
        {{ naira(wallet?.balance_minor) }}
      </div>
      <p class="bw-muted bw-mono" style="font-size: var(--t-xs); margin-bottom: var(--s-4)">
        Available {{ naira(wallet?.available_minor) }}
        <span v-if="(wallet?.holds_minor ?? 0) > 0"> · {{ naira(wallet?.holds_minor) }} on hold</span>
      </p>
      <div class="bw-row" style="gap: var(--s-2)">
        <router-link to="/buy-token" class="bw-btn primary" style="text-decoration:none; flex:1; justify-content:center">
          Buy Token
        </router-link>
        <router-link to="/wallet/fund" class="bw-btn" style="text-decoration:none; flex:1; justify-content:center">
          Add Money
        </router-link>
      </div>
    </div>

    <!-- Onboarding checklist -->
    <OnboardingChecklist />

    <!-- Recent activity -->
    <div class="bw-card flush">
      <div class="bw-table-head-bar">
        <div>
          <div class="bw-card-title">Recent activity</div>
          <div class="bw-card-sub">Latest wallet movements</div>
        </div>
        <router-link to="/wallet" class="bw-card-cta" style="text-decoration:none">All →</router-link>
      </div>

      <div class="bw-t-cards" style="display:block">
        <template v-if="loading">
          <div v-for="n in 3" :key="`customer-ledger-skeleton-${n}`" class="bw-tc customer-ledger-skeleton" aria-hidden="true">
            <div class="bw-tc-top">
              <span class="customer-ledger-skeleton-copy">
                <span class="bw-skeleton customer-ledger-skeleton-title"></span>
                <span class="bw-skeleton customer-ledger-skeleton-date"></span>
              </span>
              <span class="bw-skeleton customer-ledger-skeleton-amount"></span>
            </div>
          </div>
        </template>
        <div v-for="e in ledger" :key="e.id" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor">{{ e.entry_type.replace(/_/g,' ') }}</div>
              <div class="bw-tc-id bw-mono" style="font-size: var(--t-2xs)">{{ shortDate(e.created_at) }}</div>
            </div>
            <div class="bw-tc-amt bw-money"
                 :style="{ color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
              {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
            </div>
          </div>
        </div>
        <div v-if="!ledger.length && !loading" class="bw-muted"
             style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">
          No activity yet.
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.customer-balance-skeleton {
  min-height: 190px;
  overflow: hidden;
  pointer-events: none;
}
.customer-balance-skeleton .bw-skeleton,
.customer-ledger-skeleton .bw-skeleton {
  display: block;
  min-height: 0;
}
.customer-balance-skeleton-label {
  width: 96px;
  height: 10px;
  border-radius: var(--r-pill);
}
.customer-balance-skeleton-value {
  width: min(230px, 68%);
  height: 38px;
  margin-top: var(--s-3);
  border-radius: var(--r-sm);
}
.customer-balance-skeleton-available {
  width: min(190px, 56%);
  height: 9px;
  margin-top: var(--s-3);
  border-radius: var(--r-pill);
}
.customer-balance-skeleton-actions {
  display: flex;
  gap: var(--s-2);
  margin-top: var(--s-4);
}
.customer-balance-skeleton-button {
  flex: 1;
  height: 42px;
  border-radius: var(--r-md);
}
.customer-ledger-skeleton {
  min-height: 76px;
}
.customer-ledger-skeleton-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 7px;
}
.customer-ledger-skeleton-title {
  width: 126px;
  height: 11px;
  border-radius: var(--r-pill);
}
.customer-ledger-skeleton-date {
  width: 82px;
  height: 8px;
  border-radius: var(--r-pill);
}
.customer-ledger-skeleton-amount {
  width: 86px;
  height: 13px;
  border-radius: var(--r-pill);
}
</style>
