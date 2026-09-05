<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import WalletTablePagination from '@beverly/tokens/WalletTablePagination.vue';
import WalletTableSkeleton from '@beverly/tokens/WalletTableSkeleton.vue';
import WalletExportMenu from '@beverly/tokens/WalletExportMenu.vue';
import type { WalletExportColumn } from '@beverly/tokens/wallet-export';
import { api } from '../lib/api';
import { naira, shortDate } from '../lib/format';

const wallet  = ref<any>(null);
const entries = ref<any[]>([]);
const loading = ref(false);
const showFilters = ref(false);
const searchQuery = ref('');
const activityFilter = ref<'all' | 'credit' | 'debit'>('all');
const currentPage = ref(1);
const pageSize = ref(10);
const viewMode = ref<'list' | 'table'>(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'list' : 'table',
);

onMounted(async () => {
    loading.value = true;
    try {
        const [w, l] = await Promise.all([
            api.get<any>('/api/v1/customer/wallet'),
            api.get<{ entries: any[] }>('/api/v1/customer/wallet/ledger?limit=100'),
        ]);
        wallet.value = w;
        entries.value = l.entries;
    } catch { /* noop */ } finally { loading.value = false; }
});

const matchesFilter = (entry: any, filter: typeof activityFilter.value) => {
    if (filter === 'all') return true;
    return entry.direction === filter;
};

const filteredLedger = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    return entries.value.filter((entry) => {
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

const paginatedLedger = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return filteredLedger.value.slice(start, start + pageSize.value);
});

const activeFilterCount = computed(() => [
    activityFilter.value !== 'all',
    Boolean(searchQuery.value.trim()),
].filter(Boolean).length);

const filterCount = (filter: typeof activityFilter.value) => {
    return entries.value.filter((entry) => matchesFilter(entry, filter)).length;
};

const ledgerExportColumns: WalletExportColumn<any>[] = [
    { key: 'created_at', header: 'When', value: (entry) => shortDate(entry.created_at) },
    { key: 'entry_type', header: 'Type', value: (entry) => entry.entry_type },
    { key: 'memo', header: 'Memo', value: (entry) => entry.memo },
    { key: 'reference', header: 'Reference', value: (entry) => entry.reference || entry.id },
    { key: 'amount_minor', header: 'Amount', value: (entry) => naira(entry.amount_minor) },
    { key: 'balance_after_minor', header: 'Balance', value: (entry) => naira(entry.balance_after_minor) },
];
</script>

<template>
  <AppShell>
    <!-- Balance card -->
    <div class="bw-balance-hero">
      <p class="bw-label" style="color: var(--brand); margin:0 0 var(--s-1)">Wallet</p>
      <div class="bw-kpi-value" style="color: var(--brand); font-size: var(--t-4xl); margin-bottom: var(--s-1)">
        {{ naira(wallet?.balance_minor) }}
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap: var(--s-3); margin-bottom: var(--s-4)">
        <div>
          <p class="bw-label" style="margin:0 0 2px">On hold</p>
          <p class="bw-mono" style="margin:0; font-size: var(--t-sm)">{{ naira(wallet?.holds_minor) }}</p>
        </div>
        <div>
          <p class="bw-label" style="margin:0 0 2px">Available</p>
          <p class="bw-mono" style="margin:0; font-size: var(--t-sm); color: var(--brand)">{{ naira(wallet?.available_minor) }}</p>
        </div>
      </div>
      <div class="bw-row" style="gap: var(--s-2)">
        <router-link to="/wallet/fund" class="bw-btn primary" style="text-decoration:none; flex:1; justify-content:center">Fund Wallet</router-link>
      </div>
    </div>

    <!-- Ledger -->
    <div class="bw-card flush bw-data-region" :data-view="viewMode">
      <div class="bw-table-head-bar recent-head-bar">
        <div class="recent-heading">
          <div class="recent-title-row">
            <div class="bw-card-title">Ledger</div>
            <span v-if="loading" class="bw-skeleton recent-count-skeleton" aria-hidden="true"></span>
            <span v-else class="recent-count">{{ filteredLedger.length }}</span>
          </div>
          <div class="bw-card-sub">Transaction history and balance changes</div>
        </div>
        <div class="recent-actions">
          <WalletExportMenu
            :rows="filteredLedger"
            :columns="ledgerExportColumns"
            filename="beverly-customer-wallet-ledger"
            title="Customer Wallet Ledger"
            subtitle="Filtered ledger entries"
            :loading="loading"
            :formats="['pdf']"
          />
          <WalletDataViewSwitch v-model="viewMode" label="Ledger display view" />
          <button
            class="bw-btn sm recent-filter-button"
            :class="{ active: showFilters }"
            :aria-expanded="showFilters"
            aria-controls="customer-wallet-filter-panel"
            title="Filter ledger"
            @click="showFilters = !showFilters"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            <span class="recent-action-label">Filter</span>
            <span v-if="activeFilterCount" class="recent-filter-count">{{ activeFilterCount }}</span>
          </button>
        </div>
      </div>

      <!-- Filter Controls Panel -->
      <div v-if="showFilters" id="customer-wallet-filter-panel" class="recent-filter-panel">
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
              <th style="text-align:right">Amount</th>
              <th style="text-align:right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <WalletTableSkeleton v-if="loading && !filteredLedger.length" :columns="4" />
            <tr v-for="e in paginatedLedger" :key="e.id">
              <td class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ shortDate(e.created_at) }}</td>
              <td><span :class="['bw-badge', e.direction === 'credit' ? 'success' : 'neutral']">{{ e.entry_type.replace(/_/g,' ') }}</span></td>
              <td class="bw-money" :style="{ textAlign:'right', color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
                {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
              </td>
              <td class="bw-money" style="text-align:right">{{ naira(e.balance_after_minor) }}</td>
            </tr>
            <tr v-if="!filteredLedger.length && !loading">
              <td colspan="4" class="bw-muted" style="text-align:center; padding: var(--s-6)">No entries matching filters.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards">
        <WalletTableSkeleton v-if="loading && !filteredLedger.length" variant="cards" :rows="4" />
        <div v-for="e in paginatedLedger" :key="e.id" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor">{{ e.entry_type.replace(/_/g,' ') }}</div>
              <div class="bw-tc-id">{{ shortDate(e.created_at) }}</div>
            </div>
            <div class="bw-tc-amt bw-money"
                 :style="{ color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
              {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
            </div>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Balance after</span>
              <span class="bw-tc-pair-val bw-money">{{ naira(e.balance_after_minor) }}</span>
            </div>
          </div>
        </div>
        <div v-if="!filteredLedger.length && !loading" class="bw-muted"
             style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">No entries matching filters.</div>
      </div>

      <!-- Pagination Bar -->
      <WalletTablePagination
        v-model:page="currentPage"
        v-model:pageSize="pageSize"
        :total-items="filteredLedger.length"
        item-label="movements"
      />
    </div>
  </AppShell>
</template>
