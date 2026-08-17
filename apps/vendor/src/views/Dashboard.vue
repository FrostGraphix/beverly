<script setup lang="ts">
import { onBeforeUnmount, onMounted, computed, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import VendorOnboardingChecklist from '../components/VendorOnboardingChecklist.vue';
import WalletGreeting from '@beverly/tokens/WalletGreeting.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import { useVendorAuthStore } from '../stores/auth';
import { useWalletStore } from '../stores/wallet';
import { naira } from '../lib/format';

const auth = useVendorAuthStore();
const wallet = useWalletStore();
const vendorName = computed(() => auth.user?.organization_name?.split(' ')[0] || auth.user?.full_name?.split(' ')[0] || 'vendor');
const activityFilter = ref<'all' | 'credit' | 'debit' | 'reversal'>('all');
const dashboardLoading = ref(true);
const showFilters = ref(false);
const searchQuery = ref('');
const recentPage = ref(1);
const recentPageSize = ref(10);
const viewMode = ref<'grid' | 'table'>(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'grid' : 'table',
);
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
    const q = searchQuery.value.trim().toLowerCase();
    return recentLedger.value.filter((entry) => {
        const matchesType = matchesFilter(entry, activityFilter.value);
        if (!matchesType) return false;
        if (!q) return true;
        return (
            (entry.memo || '').toLowerCase().includes(q) ||
            (entry.entry_type || '').toLowerCase().includes(q) ||
            (entry.id || '').toLowerCase().includes(q)
        );
    });
});
const activeRecentFilterCount = computed(() => [
    activityFilter.value !== 'all',
    Boolean(searchQuery.value.trim()),
].filter(Boolean).length);

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
      <div class="vendor-hero-grid" aria-hidden="true">
        <div class="bw-card vendor-hero-card" style="min-height: 140px">
          <div class="vendor-hero-top-row">
            <span class="bw-skeleton vendor-skeleton-label"></span>
            <span class="bw-skeleton vendor-skeleton-badge"></span>
          </div>
          <span class="bw-skeleton vendor-skeleton-balance"></span>
          <span class="bw-skeleton vendor-skeleton-available"></span>
        </div>
        <div class="bw-card vendor-action-card" style="min-height: 140px">
          <span class="bw-skeleton vendor-skeleton-label" style="width: 90px"></span>
          <div class="vendor-action-buttons">
            <span class="bw-skeleton vendor-skeleton-button primary"></span>
            <span class="bw-skeleton vendor-skeleton-button"></span>
          </div>
        </div>
      </div>

      <!-- KPI skeleton grid matching 4-card operational grid -->
      <div class="bw-kpi-grid bw-mobile-kpi-grid vendor-kpi-grid" aria-label="Loading dashboard metrics" aria-busy="true">
        <article v-for="n in 4" :key="`vendor-kpi-skeleton-${n}`" class="bw-kpi dashboard-kpi-skeleton" aria-hidden="true">
          <div class="bw-kpi-row">
            <span class="bw-skeleton dashboard-kpi-skeleton-label"></span>
            <span class="bw-skeleton dashboard-kpi-skeleton-icon"></span>
          </div>
          <span class="bw-skeleton dashboard-kpi-skeleton-value"></span>
          <div class="bw-kpi-foot dashboard-kpi-skeleton-foot">
            <span class="bw-skeleton dashboard-kpi-skeleton-pill"></span>
            <span class="bw-skeleton dashboard-kpi-skeleton-note"></span>
          </div>
          <div v-if="n <= 2" class="dashboard-kpi-skeleton-chart">
            <span class="bw-skeleton dashboard-kpi-skeleton-line line-one"></span>
            <span class="bw-skeleton dashboard-kpi-skeleton-line line-two"></span>
          </div>
        </article>
      </div>

      <!-- Section table skeleton matching Admin Dashboard -->
      <div class="bw-card flush dashboard-section-skeleton dashboard-vending-skeleton" aria-label="Loading recent activity" aria-busy="true">
        <div class="bw-table-head-bar dashboard-section-skeleton-head">
          <div class="dashboard-section-skeleton-copy">
            <span class="bw-skeleton dashboard-section-skeleton-title wide"></span>
            <span class="bw-skeleton dashboard-section-skeleton-subtitle"></span>
          </div>
          <span class="bw-skeleton dashboard-section-skeleton-action"></span>
        </div>
        <div class="dashboard-vending-skeleton-rows" aria-hidden="true">
          <div v-for="row in 4" :key="row" class="dashboard-vending-skeleton-row">
            <span class="bw-skeleton"></span>
            <span class="bw-skeleton"></span>
            <span class="bw-skeleton"></span>
            <span class="bw-skeleton"></span>
            <span class="bw-skeleton"></span>
          </div>
        </div>
        <div class="bw-pagination-bar dashboard-pagination-skeleton" aria-hidden="true">
          <span class="bw-skeleton dashboard-pagination-skeleton-copy"></span>
          <span class="bw-skeleton dashboard-pagination-skeleton-actions"></span>
        </div>
      </div>
    </div>

    <template v-else>
    <!-- Pattern 1: Asymmetric Hero Grid -->
    <div class="vendor-hero-grid">
      <!-- Left: Wallet Float Hero Card -->
      <div class="bw-card vendor-hero-card">
        <div class="vendor-hero-top-row">
          <span class="bw-label" style="color: var(--brand)">Wallet Float</span>
          <span :class="['bw-badge', wallet.summary?.status === 'active' ? 'success' : 'warn']" style="font-size: 11px; text-transform: uppercase">
            ● {{ wallet.summary?.status || 'Active' }}
          </span>
        </div>
        <div class="bw-kpi-value" style="color: var(--brand); font-size: var(--t-4xl); margin-bottom: var(--s-2)">
          {{ naira(wallet.summary?.balance_minor) }}
        </div>
        <p class="bw-muted bw-mono" style="font-size: var(--t-sm); margin: 0">
          Available {{ naira(wallet.summary?.available_minor) }}
          <span v-if="(wallet.summary?.holds_minor ?? 0) > 0" style="opacity: 0.7">
            · {{ naira(wallet.summary?.holds_minor) }} on hold
          </span>
        </p>
      </div>

      <!-- Right: Action Hub Card -->
      <div class="bw-card vendor-action-card">
        <div class="bw-label">Quick Actions</div>
        <div class="vendor-action-buttons">
          <router-link to="/vend" class="bw-btn primary vendor-action-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>Buy Token</span>
          </router-link>
          <router-link to="/wallet/fund" class="bw-btn vendor-action-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Fund Wallet</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- 4-Card Operational Metric Grid -->
    <div class="bw-kpi-grid bw-mobile-kpi-grid vendor-kpi-grid">
      <div class="bw-kpi">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Today Vended</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value">{{ naira(wallet.summary?.activity?.today_vended_minor) }}</div>
        <div class="bw-kpi-foot">
          <span class="bw-delta flat">{{ wallet.summary?.activity?.today_vended_count ?? 0 }} ops</span>
        </div>
      </div>

      <div class="bw-kpi">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Today Funded</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--brand)">{{ naira(wallet.summary?.activity?.today_funded_minor) }}</div>
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
        <div class="bw-kpi-value" style="color: var(--brand)">{{ naira(wallet.summary?.activity?.total_funded_minor) }}</div>
      </div>

      <div class="bw-kpi danger-tone">
        <div class="bw-kpi-row">
          <span class="bw-kpi-label">Reversals</span>
          <div class="bw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6"/></svg>
          </div>
        </div>
        <div class="bw-kpi-value" style="color: var(--danger)">{{ naira(wallet.summary?.activity?.total_reversed_minor) }}</div>
      </div>
    </div>

    <!-- Recent activity -->
    <div class="bw-card flush bw-data-region" :data-view="viewMode">
      <div class="bw-table-head-bar recent-head-bar">
        <div class="recent-heading">
          <div class="recent-title-row">
            <div class="bw-card-title">Recent activity</div>
            <span v-if="dashboardLoading" class="bw-skeleton recent-count-skeleton" aria-hidden="true"></span>
            <span v-else class="recent-count">{{ filteredLedger.length }}</span>
          </div>
          <div class="bw-card-sub">Latest 10 wallet movements</div>
        </div>
        <div class="recent-actions">
          <WalletDataViewSwitch
            v-model="viewMode"
            :modes="['grid', 'table']"
            label="Recent activity view"
          />
          <button
            class="bw-btn sm recent-filter-button"
            :class="{ active: showFilters }"
            :aria-expanded="showFilters"
            aria-controls="vendor-recent-filter-panel"
            title="Filter activity"
            @click="showFilters = !showFilters"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            <span class="recent-action-label">Filter</span>
            <span v-if="activeRecentFilterCount" class="recent-filter-count">{{ activeRecentFilterCount }}</span>
          </button>
          <router-link
            to="/wallet"
            class="bw-btn sm recent-see-all"
            aria-label="View all activity"
            title="View all activity"
          >
            <span class="recent-action-label">View all</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </router-link>
        </div>
      </div>

      <!-- Filter Controls Panel -->
      <div v-if="showFilters" id="vendor-recent-filter-panel" class="recent-filter-panel">
        <div class="recent-filter-grid">
          <div class="filter-group">
            <label class="filter-label">Search</label>
            <input
              v-model="searchQuery"
              type="text"
              class="bw-input bw-input-sm"
              placeholder="Search memo, type..."
            />
          </div>
          <div class="filter-group full-width">
            <label class="filter-label">Filter Type</label>
            <div class="recent-tabs-row">
              <button
                v-for="filter in (['all', 'credit', 'debit', 'reversal'] as const)"
                :key="filter"
                type="button"
                :class="['bw-btn sm', activityFilter === filter ? 'primary' : '']"
                @click="activityFilter = filter"
              >
                {{ filter === 'all' ? 'All' : filter === 'credit' ? 'Credits' : filter === 'debit' ? 'Debits' : 'Reversals' }} ({{ filterCount(filter) }})
              </button>
            </div>
          </div>
        </div>
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

      <!-- Pagination Bar -->
      <div v-if="filteredLedger.length > 0" class="bw-pagination-bar">
        <div class="bw-pagination-info">
          Showing 1–{{ filteredLedger.length }} of {{ filteredLedger.length }} matching movements
        </div>
        <div class="bw-pagination-controls">
          <label class="filter-label inline">
            <span>Per page</span>
            <select v-model="recentPageSize" class="bw-select bw-select-sm" style="width: auto">
              <option :value="10">10</option>
              <option :value="20">20</option>
            </select>
          </label>
        </div>
      </div>
    </div>
    </template>

  </AppShell>
</template>

<style scoped>
.dashboard-skeleton { display: grid; gap: var(--s-5); }
.dashboard-skeleton .bw-skeleton {
  display: block;
  min-height: 0;
}
.dashboard-balance-skeleton {
  min-height: 190px;
  overflow: hidden;
  pointer-events: none;
}
.vendor-skeleton-label {
  width: 92px;
  height: 10px;
  border-radius: var(--r-pill);
}
.vendor-skeleton-balance {
  width: min(260px, 62%);
  height: 38px;
  margin-top: var(--s-3);
  border-radius: var(--r-sm);
}
.vendor-skeleton-available {
  width: min(210px, 54%);
  height: 10px;
  margin-top: var(--s-3);
  border-radius: var(--r-pill);
}
.vendor-skeleton-actions {
  display: flex;
  gap: var(--s-2);
  margin-top: var(--s-4);
}
.vendor-skeleton-button {
  width: 116px;
  height: 42px;
  border-radius: var(--r-md);
}
.vendor-skeleton-button.primary { width: 104px; }
.vendor-kpi-skeleton {
  overflow: hidden;
  pointer-events: none;
}
.vendor-kpi-skeleton-label {
  width: 46%;
  height: 9px;
  border-radius: var(--r-pill);
}
.vendor-kpi-skeleton-icon {
  width: 38px;
  height: 38px;
  border-radius: var(--r-md);
}
.vendor-kpi-skeleton-value {
  width: 68%;
  height: 28px;
  margin-top: var(--s-4);
  border-radius: var(--r-sm);
}
.vendor-kpi-skeleton-pill {
  width: 70px;
  height: 24px;
  margin-top: var(--s-3);
  border-radius: var(--r-pill);
}
.dashboard-activity-skeleton {
  overflow: hidden;
  pointer-events: none;
}
.vendor-activity-skeleton-head {
  flex-wrap: nowrap;
}
.vendor-activity-skeleton-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 7px;
}
.vendor-activity-skeleton-title {
  width: 124px;
  height: 14px;
  border-radius: var(--r-pill);
}
.vendor-activity-skeleton-subtitle {
  width: 174px;
  height: 9px;
  border-radius: var(--r-pill);
}
.vendor-activity-skeleton-link {
  width: 72px;
  height: 34px;
  border-radius: var(--r-md);
}
.vendor-filter-skeleton {
  flex-wrap: nowrap;
}
.vendor-filter-skeleton-pill {
  width: 76px;
  height: 34px;
  border-radius: var(--r-pill);
}
.vendor-activity-skeleton-rows {
  display: grid;
  padding: var(--s-2) var(--s-5) var(--s-4);
}
.vendor-activity-skeleton-row {
  display: grid;
  grid-template-columns: 0.8fr 0.9fr 1.4fr 0.8fr 0.8fr;
  gap: var(--s-4);
  padding-block: var(--s-3);
  border-bottom: 1px solid var(--border);
}
.vendor-activity-skeleton-row:last-child { border-bottom: 0; }
.vendor-activity-skeleton-row .bw-skeleton {
  width: 76%;
  height: 10px;
  border-radius: var(--r-pill);
}
.vendor-activity-skeleton-row .wide { width: 90%; }
.vendor-activity-skeleton-row .amount { width: 68%; margin-left: auto; }
.vendor-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--s-4);
  margin-bottom: var(--s-4);
}
.vendor-hero-card {
  background: radial-gradient(100% 80% at 0% 0%, var(--brand-glow), transparent 60%), var(--glass-bg);
  border-color: oklch(70% 0.19 145 / 0.28);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: var(--s-5);
}
.vendor-hero-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
  margin-bottom: var(--s-2);
}
.vendor-action-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: var(--s-5);
}
.vendor-action-buttons {
  display: grid;
  gap: var(--s-2.5);
  margin-top: var(--s-3);
}
.vendor-action-btn {
  width: 100%;
  justify-content: center;
  min-height: 42px;
  text-decoration: none;
  font-weight: var(--fw-semibold);
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
}

.vendor-skeleton-badge {
  width: 58px;
  height: 20px;
  border-radius: var(--r-pill);
}

.vendor-kpi-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

@media (max-width: 980px) {
  .vendor-hero-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 840px) {
  .vendor-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .vendor-skeleton-actions { width: 100%; }
  .vendor-skeleton-button { flex: 1; }
  .vendor-filter-skeleton { overflow: hidden; }
  .vendor-filter-skeleton-pill { flex: 0 0 68px; }
  .vendor-activity-skeleton-rows { padding-inline: var(--s-3); }
  .vendor-activity-skeleton-row {
    grid-template-columns: 1fr 0.7fr;
    gap: var(--s-3);
  }
  .vendor-activity-skeleton-row .bw-skeleton:nth-child(n + 3) { display: none; }
  .vendor-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .vendor-kpi-grid .bw-kpi { min-height: 124px; }
  .vendor-kpi-grid .bw-kpi:last-child { grid-column: auto; }
}

@media (max-width: 420px) {
  .vendor-kpi-grid { grid-template-columns: 1fr; }
}
</style>
