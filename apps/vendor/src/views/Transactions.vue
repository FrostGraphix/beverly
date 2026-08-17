<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import WalletTableSkeleton from '@beverly/tokens/WalletTableSkeleton.vue';
import { api } from '../lib/api';
import { exportCsv, type Column } from '../lib/export';
import { naira, kwh, shortDate } from '../lib/format';
import { printReceipt, purchaseReceipt, viewReceipt } from '../lib/receipts';

interface PurchaseOrder {
    id: string; meter_id: string; customer_name: string | null;
    meter_type: 'single_phase' | 'three_phase' | null;
    station_id: string | null; amount_minor: number; energy_amount_minor?: number | null;
    vat_amount_minor?: number | null; vat_rate_basis_points?: number | null; units_kwh: number | null;
    token: string | null; purchase_mode: 'wallet' | 'direct_pay' | 'remote_send';
    status: string; delivery_state: string | null; receipt_id?: string | null; created_at: string;
}

const purchases = ref<PurchaseOrder[]>([]);
const loading   = ref(false);
const viewMode = ref<'list' | 'table'>(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'list' : 'table',
);
const filter    = ref<'all' | 'delivered' | 'failed' | 'pending'>('all');
const showFilters = ref(false);
const searchQuery = ref('');
const currentPage = ref(1);
const pageSize = ref(10);
const exportRange = ref<'1d' | '7d' | '30d' | 'all'>('30d');
const exporting = ref(false);
const exportError = ref<string | null>(null);

const filterPurchases = (rows: PurchaseOrder[]) => {
    const q = searchQuery.value.trim().toLowerCase();
    let result = rows;
    if (filter.value === 'delivered') result = rows.filter(p => p.status === 'delivered');
    else if (filter.value === 'failed') result = rows.filter(p => p.status === 'failed');
    else if (filter.value === 'pending') result = rows.filter(p => ['created', 'hold_active', 'dispatching', 'delivery_pending_review'].includes(p.status));
    
    if (q) {
        result = result.filter(p => (
            (p.customer_name || '').toLowerCase().includes(q) ||
            (p.meter_id || '').toLowerCase().includes(q) ||
            (p.station_id || '').toLowerCase().includes(q) ||
            (p.token || '').toLowerCase().includes(q)
        ));
    }
    return result;
};

const activeFilterCount = computed(() => [
    filter.value !== 'all',
    Boolean(searchQuery.value.trim()),
].filter(Boolean).length);

const filtered = () => filterPurchases(purchases.value);

const CSV_COLUMNS: Column<PurchaseOrder>[] = [
    { key: 'created_at', header: 'Date', value: (row) => row.created_at },
    { key: 'customer', header: 'Customer', value: (row) => row.customer_name ?? '' },
    { key: 'meter', header: 'Meter', value: (row) => row.meter_id },
    { key: 'phase', header: 'Phase', value: (row) => meterTypeLabel(row.meter_type) },
    { key: 'station', header: 'Station', value: (row) => row.station_id ?? '' },
    { key: 'mode', header: 'Mode', value: (row) => row.purchase_mode },
    { key: 'paid', header: 'Paid (NGN)', value: (row) => (row.amount_minor / 100).toFixed(2) },
    { key: 'energy', header: 'Energy (NGN)', value: (row) => ((row.energy_amount_minor ?? row.amount_minor) / 100).toFixed(2) },
    { key: 'vat', header: 'VAT (NGN)', value: (row) => ((row.vat_amount_minor ?? 0) / 100).toFixed(2) },
    { key: 'units', header: 'Units (kWh)', value: (row) => row.units_kwh ?? '' },
    { key: 'status', header: 'Status', value: (row) => row.status },
    { key: 'token', header: 'Token', value: (row) => row.token ?? '' },
];

function statusBadge(s: string) {
    if (s === 'delivered')                return 'success';
    if (s === 'failed')                   return 'danger';
    if (s === 'dispatching' || s === 'hold_active') return 'info';
    if (s === 'delivery_pending_review')  return 'warn';
    if (s === 'reversed')                 return 'warn';
    return 'neutral';
}

function meterTypeLabel(type?: string | null) {
    if (type === 'three_phase') return 'Three Phase';
    if (type === 'single_phase') return 'Single Phase';
    return 'Unknown';
}

function canReceipt(p: PurchaseOrder) {
    return p.status === 'delivered' && !!p.receipt_id;
}

function viewPurchaseReceipt(p: PurchaseOrder) {
    viewReceipt(purchaseReceipt(p));
}

function printPurchaseReceipt(p: PurchaseOrder) {
    printReceipt(purchaseReceipt(p));
}

async function exportTransactions() {
    exporting.value = true;
    exportError.value = null;
    try {
        const rows: PurchaseOrder[] = [];
        const pageSizeVal = 500;
        let hasMore = true;
        while (hasMore) {
            const response = await api.get<{ purchases: PurchaseOrder[]; has_more: boolean }>(
                `/api/v1/vendor/transactions?period=${exportRange.value}&limit=${pageSizeVal}&offset=${rows.length}`,
            );
            rows.push(...(response.purchases ?? []));
            hasMore = response.has_more;
        }
        exportCsv(`beverly-vendor-transactions-${exportRange.value}`, filterPurchases(rows), CSV_COLUMNS);
    } catch (cause: any) {
        exportError.value = cause?.message ?? 'Export failed';
    } finally {
        exporting.value = false;
    }
}

onMounted(async () => {
    loading.value = true;
    try {
        const r = await api.get<{ purchases: PurchaseOrder[] }>('/api/v1/vendor/transactions?limit=200');
        purchases.value = r.purchases;
    } finally { loading.value = false; }
});
</script>

<template>
  <AppShell title="Transactions">
    <div class="bw-card flush bw-data-region" :data-view="viewMode">
      <div class="bw-table-head-bar recent-head-bar">
        <div class="recent-heading">
          <div class="recent-title-row">
            <div class="bw-card-title">Vending history</div>
            <span v-if="loading" class="bw-skeleton recent-count-skeleton" aria-hidden="true"></span>
            <span v-else class="recent-count">{{ filtered().length }}</span>
          </div>
          <div class="bw-card-sub">Meter token vending transactions and receipts</div>
        </div>
        <div class="recent-actions">
          <WalletDataViewSwitch v-model="viewMode" label="Transaction display view" />
          <button
            class="bw-btn sm recent-filter-button"
            :class="{ active: showFilters }"
            :aria-expanded="showFilters"
            aria-controls="vendor-tx-filter-panel"
            title="Filter transactions"
            @click="showFilters = !showFilters"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            <span class="recent-action-label">Filter</span>
            <span v-if="activeFilterCount" class="recent-filter-count">{{ activeFilterCount }}</span>
          </button>
        </div>
      </div>

      <!-- Filter Controls Panel -->
      <div v-if="showFilters" id="vendor-tx-filter-panel" class="recent-filter-panel">
        <div class="recent-filter-grid">
          <div class="filter-group">
            <label class="filter-label">Search</label>
            <input
              v-model="searchQuery"
              type="text"
              class="bw-input bw-input-sm"
              placeholder="Search customer, meter, station..."
            />
          </div>
          <div class="filter-group">
            <label class="filter-label">Export Period</label>
            <select v-model="exportRange" class="bw-select bw-select-sm">
              <option value="1d">Last day</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label">Actions</label>
            <button class="bw-btn sm primary" :disabled="exporting" @click="exportTransactions">
              {{ exporting ? 'Exporting...' : 'Export CSV' }}
            </button>
          </div>
          <div class="filter-group full-width">
            <label class="filter-label">Status Filter</label>
            <div class="recent-tabs-row">
              <button
                v-for="f in (['all','delivered','pending','failed'] as const)"
                :key="f"
                type="button"
                :class="['bw-btn sm', filter === f ? 'primary' : '']"
                @click="filter = f"
              >
                {{ f.charAt(0).toUpperCase() + f.slice(1) }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="exportError" class="bw-error-banner transaction-export-error" style="margin: var(--s-3) var(--s-4)">{{ exportError }}</div>

      <!-- Filter pills (mobile) -->
      <div class="bw-filter-bar">
        <button v-for="f in (['all','delivered','pending','failed'] as const)" :key="f"
                :class="['bw-filter-pill', filter === f ? 'active' : '']"
                @click="filter = f">{{ f }}</button>
      </div>

      <!-- Desktop table -->
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Customer</th>
              <th>Meter</th>
              <th>Phase</th>
              <th>Station</th>
              <th>Mode</th>
              <th style="text-align:right">Paid</th>
              <th style="text-align:right">Energy</th>
              <th style="text-align:right">VAT</th>
              <th style="text-align:right">Units</th>
              <th>Status</th>
              <th>Token</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            <WalletTableSkeleton v-if="loading && !filtered().length" :columns="13" />
            <tr v-for="p in filtered()" :key="p.id">
              <td class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ shortDate(p.created_at) }}</td>
              <td>{{ p.customer_name || '—' }}</td>
              <td class="bw-mono">{{ p.meter_id }}</td>
              <td>
                <span :class="['bw-badge', p.meter_type === 'three_phase' ? 'info' : 'neutral']">
                  {{ meterTypeLabel(p.meter_type) }}
                </span>
              </td>
              <td class="bw-muted">{{ p.station_id || '—' }}</td>
              <td><span class="bw-badge neutral">{{ p.purchase_mode }}</span></td>
              <td class="bw-money" style="text-align:right">{{ naira(p.amount_minor) }}</td>
              <td class="bw-money" style="text-align:right">{{ naira(p.energy_amount_minor ?? p.amount_minor) }}</td>
              <td class="bw-money" style="text-align:right">{{ naira(p.vat_amount_minor ?? 0) }}</td>
              <td class="bw-mono" style="text-align:right">{{ kwh(p.units_kwh) }}</td>
              <td><span :class="['bw-badge', statusBadge(p.status)]">{{ p.status }}</span></td>
              <td class="bw-mono" style="font-size: var(--t-xs)">{{ p.token ? p.token.slice(0, 12) + '...' : '-' }}</td>
              <td>
                <div v-if="canReceipt(p)" class="receipt-actions">
                  <button class="bw-btn sm" @click="viewPurchaseReceipt(p)">View</button>
                  <button class="bw-btn sm" @click="printPurchaseReceipt(p)">Print</button>
                </div>
                <span v-else class="bw-muted">-</span>
              </td>
            </tr>
            <tr v-if="!filtered().length && !loading">
              <td colspan="13" class="bw-muted" style="text-align:center; padding: var(--s-6)">No transactions.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards">
        <WalletTableSkeleton v-if="loading && !filtered().length" variant="cards" />
        <div v-for="p in filtered()" :key="p.id" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor">{{ p.customer_name || p.meter_id }}</div>
              <div class="bw-tc-id">{{ shortDate(p.created_at) }}</div>
            </div>
            <div class="bw-tc-amt bw-money">{{ naira(p.amount_minor) }}</div>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Status</span>
              <span :class="['bw-badge', statusBadge(p.status)]">{{ p.status }}</span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Mode</span>
              <span class="bw-badge neutral">{{ p.purchase_mode }}</span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Phase</span>
              <span :class="['bw-badge', p.meter_type === 'three_phase' ? 'info' : 'neutral']">
                {{ meterTypeLabel(p.meter_type) }}
              </span>
            </div>
            <div class="bw-tc-pair" v-if="p.units_kwh">
              <span class="bw-tc-pair-label">Units</span>
              <span class="bw-tc-pair-val bw-mono">{{ kwh(p.units_kwh) }}</span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Energy value</span>
              <span class="bw-tc-pair-val bw-money">{{ naira(p.energy_amount_minor ?? p.amount_minor) }}</span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">VAT</span>
              <span class="bw-tc-pair-val bw-money">{{ naira(p.vat_amount_minor ?? 0) }}</span>
            </div>
            <div class="bw-tc-pair" v-if="canReceipt(p)">
              <span class="bw-tc-pair-label">Receipt</span>
              <span class="receipt-actions">
                <button class="bw-btn sm" @click="viewPurchaseReceipt(p)">View</button>
                <button class="bw-btn sm" @click="printPurchaseReceipt(p)">Print</button>
              </span>
            </div>
          </div>
        </div>
        <div v-if="!filtered().length && !loading" class="bw-muted" style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">No transactions.</div>
      </div>

      <!-- Pagination Bar -->
      <div v-if="filtered().length > 0" class="bw-pagination-bar">
        <div class="bw-pagination-info">
          Showing 1–{{ filtered().length }} of {{ filtered().length }} matching transactions
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
  </AppShell>
</template>

<style scoped>
.transaction-toolbar {
  display: flex;
  align-items: end;
  justify-content: flex-end;
  gap: var(--s-2);
  padding: 0 var(--s-4) var(--s-3);
}

.bw-filter-bar { display: none; }

.export-range-label {
  display: grid;
  gap: var(--s-1);
  color: var(--text-muted);
  font-size: var(--t-xs);
}

.export-range {
  min-width: 140px;
  padding-block: var(--s-2);
}

.transaction-export-error { margin: 0 var(--s-4) var(--s-3); }

@media (max-width: 640px) {
  .transaction-status { display: none; }
  .bw-filter-bar { display: flex; }
  .transaction-toolbar { align-items: end; justify-content: space-between; }
  .export-range-label { flex: 1 1 auto; }
  .export-range { width: 100%; min-width: 0; }
  .transaction-toolbar .bw-btn { flex: 0 0 auto; }
}
</style>
