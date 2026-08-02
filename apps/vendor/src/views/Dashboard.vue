<script setup lang="ts">
import { onBeforeUnmount, onMounted, computed, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import VendorOnboardingChecklist from '../components/VendorOnboardingChecklist.vue';
import WalletGreeting from '@beverly/tokens/WalletGreeting.vue';
import { useVendorAuthStore } from '../stores/auth';
import { useWalletStore } from '../stores/wallet';
import { naira } from '../lib/format';

const auth = useVendorAuthStore();
const wallet = useWalletStore();
const vendorName = computed(() => auth.user?.organization_name?.split(' ')[0] || auth.user?.full_name?.split(' ')[0] || 'vendor');
const activityFilter = ref<'all' | 'credit' | 'debit' | 'reversal'>('all');
const dashboardLoading = ref(true);
let refreshTimer: ReturnType<typeof setInterval> | null = null;

async function refreshDashboard() {
    await Promise.allSettled([
        wallet.fetchSummary(),
        wallet.fetchLedger(10)
    ]);
}

function refreshWhenVisible() {
    if (document.visibilityState === 'visible') void refreshDashboard();
}

onMounted(async () => {
    try {
        await refreshDashboard();
    } finally {
        dashboardLoading.value = false;
    }
    document.addEventListener('visibilitychange', refreshWhenVisible);
    refreshTimer = setInterval(refreshWhenVisible, 60_000);
});

onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', refreshWhenVisible);
    if (refreshTimer) clearInterval(refreshTimer);
});

const recentLedger = computed(() => wallet.ledger.slice(0, 10));
const matchesFilter = (entry: typeof wallet.ledger[number], filter: typeof activityFilter.value) => {
    const reversal = entry.entry_type.startsWith('reversal_');
    if (filter === 'all') return true;
    if (filter === 'reversal') return reversal;
    return !reversal && entry.direction === filter;
};
const filteredLedger = computed(() => {
    return recentLedger.value.filter((entry) => matchesFilter(entry, activityFilter.value));
});
const filterCount = (filter: typeof activityFilter.value) => {
    return recentLedger.value.filter((entry) => matchesFilter(entry, filter)).length;
};
</script>

<template>
  <AppShell title="Dashboard">

    <div v-if="wallet.error" class="bw-alert danger" role="alert">{{ wallet.error }}</div>

    <WalletGreeting
      audience="Vendor wallet desk"
      :name="vendorName"
      detail="for vending, funding, and token delivery."
    />

    <!-- Onboarding checklist (only shown until complete or dismissed) -->
    <VendorOnboardingChecklist />

    <div v-if="dashboardLoading" class="dashboard-skeleton" role="status" aria-label="Loading dashboard">
      <div class="bw-card bw-skeleton dashboard-balance-skeleton"></div>
      <div class="bw-kpi-grid bw-mobile-kpi-grid vendor-kpi-grid">
        <div v-for="n in 5" :key="`vendor-kpi-skeleton-${n}`" class="bw-kpi bw-skeleton"></div>
      </div>
      <div class="bw-card bw-skeleton dashboard-activity-skeleton"></div>
    </div>

    <template v-else>
    <!-- Hero balance card -->
    <div class="bw-card" style="background: radial-gradient(100% 80% at 0% 0%, var(--brand-glow), transparent 60%), var(--glass-bg); border-color: oklch(70% 0.19 145 / 0.28); position: relative; overflow: hidden">
      <div style="position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--brand), transparent)"></div>
      <p class="bw-label" style="color: var(--brand)">Wallet Float</p>
      <div class="bw-kpi-value" style="color: var(--brand); font-size: var(--t-4xl); margin-bottom: var(--s-2)">
        {{ naira(wallet.summary?.balance_minor) }}
      </div>
      <p class="bw-muted bw-mono" style="font-size: var(--t-sm); margin-bottom: var(--s-4)">
        Available {{ naira(wallet.summary?.available_minor) }}
        <span v-if="(wallet.summary?.holds_minor ?? 0) > 0" style="opacity: 0.7">
          · {{ naira(wallet.summary?.holds_minor) }} on hold
        </span>
      </p>
      <div class="bw-row" style="gap: var(--s-2)">
        <router-link to="/vend"        class="bw-btn primary" style="text-decoration:none">Buy Token</router-link>
        <router-link to="/wallet/fund" class="bw-btn"         style="text-decoration:none">Fund Wallet</router-link>
      </div>
    </div>

    <!-- KPI tiles -->
    <div class="bw-kpi-grid bw-mobile-kpi-grid vendor-kpi-grid">
      <div class="bw-kpi">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Today Vended</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value">{{ naira(wallet.summary?.activity.today_vended_minor) }}</div>
        <div class="bw-kpi-foot">
          <span class="bw-delta flat">{{ wallet.summary?.activity.today_vended_count ?? 0 }} ops</span>
        </div>
      </div>

      <div class="bw-kpi">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Today Funded</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--brand)">{{ naira(wallet.summary?.activity.today_funded_minor) }}</div>
        <div class="bw-kpi-foot">
          <span class="bw-delta up">credited</span>
        </div>
      </div>

      <div class="bw-kpi">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Total Funded</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--brand)">{{ naira(wallet.summary?.activity.total_funded_minor) }}</div>
      </div>

      <div class="bw-kpi danger-tone">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Reversals</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--danger)">{{ naira(wallet.summary?.activity.total_reversed_minor) }}</div>
      </div>

      <div class="bw-kpi">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Wallet Status</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>
        <div style="margin-top: auto; padding-bottom: var(--s-1)">
          <span :class="['bw-badge', wallet.summary?.status === 'active' ? 'success' : 'warn']" style="font-size: 11px">
            {{ wallet.summary?.status || '—' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Recent activity -->
    <div class="bw-card flush">
      <div class="bw-table-head-bar">
        <div>
          <div class="bw-card-title">Recent activity</div>
          <div class="bw-card-sub">Latest 10 wallet movements</div>
        </div>
        <router-link to="/wallet" class="bw-card-cta" style="text-decoration:none">
          View all →
        </router-link>
      </div>

      <div class="bw-filter-bar" aria-label="Filter recent activity">
        <button
          v-for="filter in (['all', 'credit', 'debit', 'reversal'] as const)"
          :key="filter"
          type="button"
          :class="['bw-filter-pill', { active: activityFilter === filter }]"
          :aria-pressed="activityFilter === filter"
          @click="activityFilter = filter"
        >
          {{ filter === 'all' ? 'All' : filter === 'credit' ? 'Credits' : filter === 'debit' ? 'Debits' : 'Reversals' }}
          <span class="count">{{ filterCount(filter) }}</span>
        </button>
      </div>

      <!-- Desktop table -->
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Memo</th>
              <th style="text-align:right">Amount</th>
              <th style="text-align:right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in filteredLedger" :key="e.id">
              <td class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ new Date(e.created_at).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</td>
              <td><span :class="['bw-badge', e.direction === 'credit' ? 'success' : 'neutral']">{{ e.entry_type.replace(/_/g, ' ') }}</span></td>
              <td class="bw-muted" style="max-width: 240px; overflow:hidden; text-overflow:ellipsis">{{ e.memo || '—' }}</td>
              <td class="bw-money" :style="{ textAlign:'right', color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
                {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
              </td>
              <td class="bw-money" style="text-align:right">{{ naira(e.balance_after_minor) }}</td>
            </tr>
            <tr v-if="!filteredLedger.length">
              <td colspan="5" class="bw-muted" style="text-align:center; padding: var(--s-6)">No matching activity.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards">
        <div v-for="e in filteredLedger" :key="e.id" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor">{{ e.entry_type.replace(/_/g, ' ') }}</div>
              <div class="bw-tc-id">{{ new Date(e.created_at).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</div>
            </div>
            <div class="bw-tc-amt bw-money" :style="{ color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
              {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
            </div>
          </div>
        </div>
        <div v-if="!filteredLedger.length" class="bw-muted" style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">No matching activity.</div>
      </div>
    </div>
    </template>

  </AppShell>
</template>

<style scoped>
.dashboard-skeleton { display: grid; gap: var(--s-5); }
.dashboard-balance-skeleton { min-height: 190px; }
.dashboard-activity-skeleton { min-height: 280px; }
.vendor-kpi-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

@media (max-width: 1180px) {
  .vendor-kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .vendor-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .vendor-kpi-grid .bw-kpi { min-height: 124px; }
  .vendor-kpi-grid .bw-kpi:last-child { grid-column: 1 / -1; }
}

@media (max-width: 360px) {
  .vendor-kpi-grid { grid-template-columns: 1fr; }
  .vendor-kpi-grid .bw-kpi:last-child { grid-column: auto; }
}
</style>
