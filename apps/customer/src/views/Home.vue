<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import OnboardingChecklist from '../components/OnboardingChecklist.vue';
import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';
import { naira, shortDate } from '../lib/format';
import WalletGreeting from '@beverly/tokens/WalletGreeting.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import WalletExportMenu from '@beverly/tokens/WalletExportMenu.vue';
import type { WalletExportColumn } from '@beverly/tokens/wallet-export';

const auth    = useAuthStore();
const wallet  = ref<any>(null);
const ledger  = ref<any[]>([]);
const loading = ref(false);
const showFilters = ref(false);
const searchQuery = ref('');
const activityFilter = ref<'all' | 'credit' | 'debit'>('all');
const recentPageSize = ref(10);
const viewMode = ref<'grid' | 'table'>(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'grid' : 'table',
);
const customerName = computed(() => auth.customer?.full_name?.split(' ')[0] || 'there');

onMounted(async () => {
    loading.value = true;
    try {
        const [w, l] = await Promise.all([
            api.get<any>('/api/v1/customer/wallet'),
            api.get<{ entries: any[] }>('/api/v1/customer/wallet/ledger?limit=10'),
        ]);
        wallet.value = w;
        ledger.value = l.entries;
    } catch { /* noop */ } finally { loading.value = false; }
});

const matchesFilter = (entry: any, filter: typeof activityFilter.value) => {
    if (filter === 'all') return true;
    return entry.direction === filter;
};

const filteredLedger = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    return ledger.value.filter((entry) => {
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
    return ledger.value.filter((entry) => matchesFilter(entry, filter)).length;
};

const ledgerExportColumns: WalletExportColumn<any>[] = [
    { key: 'created_at', header: 'When', value: (entry) => shortDate(entry.created_at) },
    { key: 'entry_type', header: 'Type', value: (entry) => entry.entry_type },
    { key: 'memo', header: 'Memo', value: (entry) => entry.memo },
    { key: 'amount_minor', header: 'Amount', value: (entry) => naira(entry.amount_minor) },
];
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

    <!-- Recent activity section -->
    <div class="bw-card flush bw-data-region" :data-view="viewMode">
      <div class="bw-table-head-bar recent-head-bar">
        <div class="recent-heading">
          <div class="recent-title-row">
            <div class="bw-card-title">Recent activity</div>
            <span v-if="loading" class="bw-skeleton recent-count-skeleton" aria-hidden="true"></span>
            <span v-else class="recent-count">{{ filteredLedger.length }}</span>
          </div>
          <div class="bw-card-sub">Latest wallet movements</div>
        </div>
        <div class="recent-actions">
          <WalletExportMenu
            :rows="filteredLedger"
            :columns="ledgerExportColumns"
            filename="beverly-customer-recent-activity"
            title="Customer Recent Activity"
            subtitle="Filtered wallet movements"
            :loading="loading"
          />
          <WalletDataViewSwitch
            v-model="viewMode"
            :modes="['grid', 'table']"
            label="Recent activity view"
          />
          <button
            class="bw-btn sm recent-filter-button"
            :class="{ active: showFilters }"
            :aria-expanded="showFilters"
            aria-controls="customer-recent-filter-panel"
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
      <div v-if="showFilters" id="customer-recent-filter-panel" class="recent-filter-panel">
        <div class="recent-filter-grid">
          <div class="filter-group search-group">
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
                v-for="filter in (['all', 'credit', 'debit'] as const)"
                :key="filter"
                type="button"
                :class="['bw-btn sm', activityFilter === filter ? 'primary' : '']"
                @click="activityFilter = filter"
              >
                {{ filter === 'all' ? 'All' : filter === 'credit' ? 'Credits' : 'Debits' }} ({{ filterCount(filter) }})
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
            </tr>
          </thead>
          <tbody>
            <template v-if="loading">
              <tr v-for="n in 3" :key="`customer-skeleton-row-${n}`" class="recent-table-skeleton" aria-hidden="true">
                <td><span class="bw-skeleton recent-cell-skeleton time"></span></td>
                <td><span class="bw-skeleton recent-cell-skeleton badge"></span></td>
                <td><span class="bw-skeleton recent-cell-skeleton customer"></span></td>
                <td><span class="bw-skeleton recent-cell-skeleton amount"></span></td>
              </tr>
            </template>
            <tr v-for="e in filteredLedger" :key="e.id">
              <td class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ shortDate(e.created_at) }}</td>
              <td><span :class="['bw-badge', e.direction === 'credit' ? 'success' : 'neutral']">{{ e.entry_type.replace(/_/g,' ') }}</span></td>
              <td class="bw-muted" style="max-width: 240px; overflow:hidden; text-overflow:ellipsis">{{ e.memo || '—' }}</td>
              <td class="bw-money" :style="{ textAlign:'right', color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
                {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
              </td>
            </tr>
            <tr v-if="!filteredLedger.length && !loading">
              <td colspan="4" class="bw-muted" style="text-align:center; padding: var(--s-6)">No activity matching filters.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards">
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
        <div v-for="e in filteredLedger" :key="e.id" class="bw-tc">
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
        <div v-if="!filteredLedger.length && !loading" class="bw-muted"
             style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">
          No activity matching filters.
        </div>
      </div>

      <!-- Pagination Bar -->
      <div v-if="loading" class="bw-pagination-bar dashboard-pagination-skeleton" aria-hidden="true">
        <span class="bw-skeleton dashboard-pagination-skeleton-copy"></span>
        <span class="bw-skeleton dashboard-pagination-skeleton-actions"></span>
      </div>
      <div v-else-if="filteredLedger.length > 0" class="bw-pagination-bar">
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
