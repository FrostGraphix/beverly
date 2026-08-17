<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import WalletTableSkeleton from '@beverly/tokens/WalletTableSkeleton.vue';
import { useWalletStore, type LedgerEntry } from '../stores/wallet';
import { naira } from '../lib/format';
import { downloadReceipt, ledgerReceipt, printReceipt, viewReceipt } from '../lib/receipts';

const wallet = useWalletStore();
const showFilters = ref(false);
const searchQuery = ref('');
const activityFilter = ref<'all' | 'credit' | 'debit' | 'reversal'>('all');
const pageSize = ref(10);
const viewMode = ref<'list' | 'table'>(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'list' : 'table',
);

function viewLedgerReceipt(entry: LedgerEntry) {
    viewReceipt(ledgerReceipt(entry));
}

function printLedgerReceipt(entry: LedgerEntry) {
    printReceipt(ledgerReceipt(entry));
}

function downloadLedgerReceipt(entry: LedgerEntry) {
    downloadReceipt(ledgerReceipt(entry));
}

function displayMemo(value: string | null) {
    return value?.replace(/\uFFFD+/g, ' • ') || '—';
}

const matchesFilter = (entry: LedgerEntry, filter: typeof activityFilter.value) => {
    const reversal = entry.entry_type.startsWith('reversal_');
    if (filter === 'all') return true;
    if (filter === 'reversal') return reversal;
    return !reversal && entry.direction === filter;
};

const filteredLedger = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    return wallet.ledger.filter((entry) => {
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

const activeFilterCount = computed(() => [
    activityFilter.value !== 'all',
    Boolean(searchQuery.value.trim()),
].filter(Boolean).length);

const filterCount = (filter: typeof activityFilter.value) => {
    return wallet.ledger.filter((entry) => matchesFilter(entry, filter)).length;
};

onMounted(async () => {
    await wallet.fetchSummary();
    await wallet.fetchLedger(100);
});
</script>

<template>
  <AppShell title="Wallet">
    <div class="bw-stack">

      <div class="bw-kpi-grid bw-mobile-kpi-grid wallet-stat-grid" aria-label="Wallet summary">
        <div class="bw-kpi featured wallet-stat">
          <span class="bw-kpi-label">Balance</span>
          <strong class="bw-kpi-value wallet-stat-value brand">{{ naira(wallet.summary?.balance_minor) }}</strong>
        </div>
        <div class="bw-kpi wallet-stat">
          <span class="bw-kpi-label">On hold</span>
          <strong class="bw-kpi-value wallet-stat-value">{{ naira(wallet.summary?.holds_minor) }}</strong>
        </div>
        <div class="bw-kpi featured wallet-stat">
          <span class="bw-kpi-label">Available</span>
          <strong class="bw-kpi-value wallet-stat-value brand">{{ naira(wallet.summary?.available_minor) }}</strong>
        </div>
        <div class="bw-kpi wallet-stat">
          <span class="bw-kpi-label">Status</span>
          <span :class="['bw-badge', wallet.summary?.status === 'active' ? 'success' : 'warn']">
            {{ wallet.summary?.status || '—' }}
          </span>
        </div>
      </div>

      <!-- Ledger -->
      <div class="bw-card flush bw-data-region" :data-view="viewMode">
        <div class="bw-table-head-bar recent-head-bar">
          <div class="recent-heading">
            <div class="recent-title-row">
              <div class="bw-card-title">Ledger</div>
              <span v-if="wallet.loading" class="bw-skeleton recent-count-skeleton" aria-hidden="true"></span>
              <span v-else class="recent-count">{{ filteredLedger.length }}</span>
            </div>
            <div class="bw-card-sub">Vendor wallet ledger movements and transactions</div>
          </div>
          <div class="recent-actions">
            <WalletDataViewSwitch v-model="viewMode" label="Ledger display view" />
            <button
              class="bw-btn sm recent-filter-button"
              :class="{ active: showFilters }"
              :aria-expanded="showFilters"
              aria-controls="vendor-wallet-filter-panel"
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
        <div v-if="showFilters" id="vendor-wallet-filter-panel" class="recent-filter-panel">
          <div class="recent-filter-grid">
            <div class="filter-group">
              <label class="filter-label">Search</label>
              <input
                v-model="searchQuery"
                type="text"
                class="bw-input bw-input-sm"
                placeholder="Search memo, reference..."
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

        <div v-if="wallet.error" class="bw-alert danger ledger-error">{{ wallet.error }}</div>

        <!-- Table view -->
        <div class="bw-t-wrap ledger-table-view">
          <table class="bw-table ledger-table">
            <caption>Wallet ledger entries</caption>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Memo</th>
                <th>Reference</th>
                <th style="text-align:right">Amount</th>
                <th style="text-align:right">Balance</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              <WalletTableSkeleton v-if="wallet.loading && !filteredLedger.length" :columns="7" />
              <tr v-for="e in filteredLedger" :key="e.id">
                <td class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ new Date(e.created_at).toLocaleString('en-NG', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) }}</td>
                <td><span :class="['bw-badge', e.direction === 'credit' ? 'success' : 'neutral']">{{ e.entry_type.replace(/_/g, ' ') }}</span></td>
                <td class="bw-muted" style="max-width:220px; overflow:hidden; text-overflow:ellipsis">{{ displayMemo(e.memo) }}</td>
                <td class="bw-mono bw-dim">{{ e.reference_id ? '#' + e.reference_id.slice(0, 8) : '—' }}</td>
                <td class="bw-money" :style="{ textAlign:'right', color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
                  {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
                </td>
                <td class="bw-money" style="text-align:right">{{ naira(e.balance_after_minor) }}</td>
                <td>
                  <div class="ledger-receipt-actions">
                    <button type="button" class="bw-btn sm" @click="viewLedgerReceipt(e)">View</button>
                    <button type="button" class="bw-btn sm" @click="printLedgerReceipt(e)">Print</button>
                    <button type="button" class="bw-btn sm" @click="downloadLedgerReceipt(e)">Download</button>
                  </div>
                </td>
              </tr>
              <tr v-if="!filteredLedger.length && !wallet.loading">
                <td colspan="7" class="bw-muted" style="text-align:center; padding: var(--s-6)">No entries matching filters.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Card view -->
        <div class="bw-t-cards ledger-card-view">
          <WalletTableSkeleton v-if="wallet.loading && !filteredLedger.length" variant="cards" />
          <div v-for="e in filteredLedger" :key="e.id" class="bw-tc">
            <div class="bw-tc-top">
              <div>
                <div class="bw-tc-vendor">{{ e.entry_type.replace(/_/g, ' ') }}</div>
                <div class="bw-tc-id">{{ new Date(e.created_at).toLocaleString('en-NG', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) }}</div>
              </div>
              <div class="bw-tc-amt bw-money" :style="{ color: e.direction === 'credit' ? 'var(--brand)' : 'var(--text)' }">
                {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
              </div>
            </div>
            <div class="bw-tc-mid">
              <div class="bw-tc-pair">
                <span class="bw-tc-pair-label">Balance after</span>
                <span class="bw-tc-pair-val bw-money">{{ naira(e.balance_after_minor) }}</span>
              </div>
              <div class="bw-tc-pair" v-if="e.memo">
                <span class="bw-tc-pair-label">Memo</span>
                <span class="bw-tc-pair-val bw-muted">{{ displayMemo(e.memo) }}</span>
              </div>
            </div>
            <div class="ledger-receipt-actions card-actions" aria-label="Ledger receipt actions">
              <button type="button" class="bw-btn sm" @click="viewLedgerReceipt(e)">View receipt</button>
              <button type="button" class="bw-btn sm" @click="printLedgerReceipt(e)">Print</button>
              <button type="button" class="bw-btn sm" @click="downloadLedgerReceipt(e)">Download</button>
            </div>
          </div>
          <div v-if="!filteredLedger.length && !wallet.loading" class="bw-muted" style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">No entries matching filters.</div>
        </div>

        <!-- Pagination Bar -->
        <div v-if="filteredLedger.length > 0" class="bw-pagination-bar">
          <div class="bw-pagination-info">
            Showing 1–{{ filteredLedger.length }} of {{ filteredLedger.length }} matching movements
          </div>
          <div class="bw-pagination-controls">
            <label class="filter-label inline">
              <span>Per page</span>
              <select v-model="pageSize" class="bw-select bw-select-sm" style="width: auto">
                <option :value="10">10</option>
                <option :value="25">25</option>
                <option :value="50">50</option>
              </select>
            </label>
          </div>
        </div>
      </div>

    </div>
  </AppShell>
</template>

<style scoped>
.wallet-stat-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.wallet-stat {
  min-height: 112px;
  padding: var(--s-4);
  justify-content: space-between;
}

.wallet-stat .bw-kpi-label {
  letter-spacing: 0;
}

.wallet-stat-value {
  min-width: 0;
  font-size: var(--t-2xl);
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

.wallet-stat-value.brand {
  color: var(--brand);
}

.wallet-stat .bw-badge {
  align-self: flex-start;
  margin-top: auto;
}

.ledger-view-switch {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
}

.ledger-view-button {
  min-height: 32px;
  padding: 0 var(--s-3);
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: var(--t-xs);
  font-weight: 800;
  cursor: pointer;
}

.ledger-view-button.active {
  background: color-mix(in srgb, var(--brand) 14%, var(--surface));
  color: var(--brand);
}

.ledger-view-button:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.ledger-table-view { display: block; }
.ledger-table { min-width: 980px; }
.ledger-table caption {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.ledger-card-view { display: block; }
.ledger-error { margin: var(--s-3) var(--s-4) 0; }
.ledger-receipt-actions { display: flex; gap: var(--s-2); white-space: nowrap; }
.ledger-receipt-actions.card-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  padding-top: var(--s-2);
  border-top: 1px dashed var(--border);
}
.ledger-receipt-actions.card-actions .bw-btn { justify-content: center; }

@media (max-width: 900px) {
  .wallet-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .bw-table-head-bar { align-items: center; padding: var(--s-3); }
  .ledger-view-button { padding-inline: 10px; }
  .wallet-stat {
    min-height: 96px;
    padding: var(--s-3);
  }

  .wallet-stat-value {
    font-size: var(--t-lg);
  }
}
</style>
