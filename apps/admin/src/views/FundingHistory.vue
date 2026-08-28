<script setup lang="ts">
/**
 * Admin — Funding History
 *
 * Shows all vendor funding requests (bank_transfer + paystack + manual)
 * across all statuses: initiated, proof_uploaded, under_review, approved, rejected.
 *
 * GET /api/v1/admin/funding/history
 *   ?status=all|approved|pending|rejected
 *   &channel=all|bank_transfer|paystack|manual
 *   &from=YYYY-MM-DD &to=YYYY-MM-DD
 *   &limit=50 &cursor=<iso>
 */
import { onMounted, ref, computed, watch } from 'vue';
import { RouterLink } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api, naira, shortDate, ApiError } from '../lib/api';
import { exportCsv, type Column } from '../lib/export';
import { fundingReceipt, printReceipt, viewReceipt } from '../lib/receipts';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import WalletTablePagination from '@beverly/tokens/WalletTablePagination.vue';

interface VendorOrg {
    legal_name?: string | null;
    trading_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
}

interface FundingRow {
    id: string;
    vendor_organization_id: string;
    amount_minor: number;
    channel: 'bank_transfer' | 'paystack' | 'manual';
    status: string;
    funding_reference: string | null;
    proof_file_path: string | null;
    proof_view_url?: string | null;
    submitted_by: string;
    rejection_reason: string | null;
    created_at: string;
    approved_at: string | null;
    vendor_organizations?: VendorOrg | null;
}

interface Summary {
    totalCount: number;
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
    approvedMinor: number;
}

interface HistoryResponse {
    funding: FundingRow[];
    nextCursor: string | null;
    summary?: Summary | null;
}

// ── filters ──────────────────────────────────────────────────────
const statusFilter  = ref<'all' | 'approved' | 'pending' | 'rejected'>('all');
const channelFilter = ref<'all' | 'bank_transfer' | 'paystack' | 'manual'>('all');
const fromDate      = ref('');
const toDate        = ref('');
const showFilters   = ref(false);

// ── data ─────────────────────────────────────────────────────────
const items     = ref<FundingRow[]>([]);
const summary   = ref<Summary | null>(null);
const loading   = ref(false);
const loadingMore = ref(false);
const nextCursor  = ref<string | null>(null);
const banner    = ref<{ tone: 'success' | 'error'; text: string } | null>(null);
const viewMode = ref<'list' | 'table'>(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'list' : 'table',
);
const currentPage = ref(1);
const pageSize = ref(10);
const activeFilterCount = computed(() => [
    statusFilter.value !== 'all',
    channelFilter.value !== 'all',
    Boolean(fromDate.value),
    Boolean(toDate.value),
].filter(Boolean).length);

// ── helpers ───────────────────────────────────────────────────────
function vendorName(f: FundingRow) {
    return f.vendor_organizations?.trading_name
        || f.vendor_organizations?.legal_name
        || `Vendor #${f.vendor_organization_id.slice(0, 8)}`;
}

function vendorEmail(f: FundingRow) {
    return f.vendor_organizations?.contact_email || '';
}

function statusBadge(s: string) {
    return ({
        approved: 'success',
        proof_uploaded: 'warn', under_review: 'warn',
        initiated: 'neutral', rejected: 'danger',
        expired: 'neutral', cancelled: 'neutral',
    } as Record<string, string>)[s] ?? 'neutral';
}

function channelBadge(c: string) {
    return ({ paystack: 'info', bank_transfer: 'neutral', manual: 'warn' } as Record<string, string>)[c] ?? 'neutral';
}

function statusLabel(s: string) {
    return ({
        approved: 'Approved', proof_uploaded: 'Proof uploaded',
        under_review: 'Under review', initiated: 'Initiated',
        rejected: 'Rejected', expired: 'Expired', cancelled: 'Cancelled',
    } as Record<string, string>)[s] ?? s;
}

// ── fetch ─────────────────────────────────────────────────────────
function buildUrl(cursor?: string | null) {
    const params = new URLSearchParams({ limit: '50' });
    if (statusFilter.value !== 'all') {
        params.set('status', statusFilter.value);
    }
    if (channelFilter.value !== 'all') params.set('channel', channelFilter.value);
    if (fromDate.value) params.set('from', fromDate.value);
    if (toDate.value)   params.set('to', toDate.value);
    if (cursor)         params.set('cursor', cursor);
    return `/api/v1/admin/funding/history?${params}`;
}

const displayItems = computed(() => {
    return items.value;
});
const paginatedItems = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return displayItems.value.slice(start, start + pageSize.value);
});

async function load() {
    loading.value = true;
    banner.value = null;
    items.value = [];
    nextCursor.value = null;
    summary.value = null;
    currentPage.value = 1;
    try {
        const r = await api.get<HistoryResponse>(buildUrl());
        items.value   = r.funding ?? [];
        nextCursor.value = r.nextCursor ?? null;
        summary.value = r.summary ?? null;
    } catch (e: any) {
        const msg = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Could not load history.';
        banner.value = { tone: 'error', text: msg };
    } finally { loading.value = false; }
}

async function loadMore() {
    if (!nextCursor.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
        const r = await api.get<HistoryResponse>(buildUrl(nextCursor.value));
        items.value.push(...(r.funding ?? []));
        nextCursor.value = r.nextCursor ?? null;
    } catch (e: any) {
        const msg = e instanceof ApiError ? e.message : e?.message ?? 'Load more failed.';
        banner.value = { tone: 'error', text: msg };
    } finally { loadingMore.value = false; }
}

watch([channelFilter, fromDate, toDate], () => load());
watch(statusFilter, () => load());

onMounted(load);

// ── export ────────────────────────────────────────────────────────
const CSV_COLS: Column<FundingRow>[] = [
    { key: 'created_at',  header: 'Date',      value: (r) => r.created_at },
    { key: 'vendor',      header: 'Vendor',     value: vendorName },
    { key: 'email',       header: 'Email',      value: vendorEmail },
    { key: 'channel',     header: 'Channel',    value: (r) => r.channel },
    { key: 'reference',   header: 'Reference',  value: (r) => r.funding_reference ?? '' },
    { key: 'amount',      header: 'Amount (₦)', value: (r) => (r.amount_minor / 100).toFixed(2) },
    { key: 'status',      header: 'Status',     value: (r) => r.status },
    { key: 'approved_at', header: 'Approved At',value: (r) => r.approved_at ?? '' },
    { key: 'rejection',   header: 'Rejection Reason', value: (r) => r.rejection_reason ?? '' },
    { key: 'submitted_by',header: 'Submitted By', value: (r) => r.submitted_by ?? '' },
];

function doExport() {
    exportCsv('beverly-funding-history', displayItems.value, CSV_COLS);
}

function viewFundingReceipt(f: FundingRow) {
    viewReceipt(fundingReceipt(f, 'history'));
}

function printFundingReceipt(f: FundingRow) {
    printReceipt(fundingReceipt(f, 'history'));
}

</script>

<template>
  <AppShell title="Funding History">

    <!-- Banner -->
    <transition name="banner">
      <div v-if="banner" :class="['fh-banner', banner.tone]" role="status">
        {{ banner.text }}
        <button class="fh-banner-x" @click="banner = null" aria-label="Dismiss">×</button>
      </div>
    </transition>

    <!-- KPI row -->
    <div class="fh-kpi-row bw-mobile-kpi-grid" v-if="summary">
      <div class="fh-kpi">
        <span class="fh-kpi-label">Approved</span>
        <span class="fh-kpi-value brand">{{ naira(summary.approvedMinor) }}</span>
        <span class="fh-kpi-sub">{{ summary.approvedCount }} requests</span>
      </div>
      <div class="fh-kpi">
        <span class="fh-kpi-label">Pending review</span>
        <span class="fh-kpi-value warn">{{ summary.pendingCount }}</span>
        <span class="fh-kpi-sub">requests</span>
      </div>
      <div class="fh-kpi">
        <span class="fh-kpi-label">Rejected</span>
        <span class="fh-kpi-value danger">{{ summary.rejectedCount }}</span>
        <span class="fh-kpi-sub">requests</span>
      </div>
      <div class="fh-kpi">
        <span class="fh-kpi-label">Total requests</span>
        <span class="fh-kpi-value">{{ summary.totalCount }}</span>
        <span class="fh-kpi-sub">all time</span>
      </div>
    </div>

    <!-- Table -->
    <div class="bw-card" style="padding: 0">
      <div class="bw-table-head-bar">
        <div class="bw-table-heading">
          <div class="bw-table-title-row">
            <div class="bw-card-title">Funding history</div>
            <span class="bw-table-count">{{ loading ? 'Loading…' : `${displayItems.length}${nextCursor ? '+' : ''}` }}</span>
          </div>
          <div class="bw-card-sub">Approved, pending, and rejected funding requests</div>
        </div>
        <div class="bw-table-actions">
          <WalletDataViewSwitch v-model="viewMode" :modes="['list', 'table']" label="Funding history display view" />
          <button
            type="button"
            class="bw-btn sm recent-filter-button"
            :class="{ active: showFilters || activeFilterCount > 0 }"
            :aria-expanded="showFilters"
            aria-controls="funding-history-filter-panel"
            @click="showFilters = !showFilters"
          >
            Filter <span v-if="activeFilterCount" class="recent-filter-count">{{ activeFilterCount }}</span>
          </button>
        </div>
      </div>

      <section
        v-if="showFilters"
        id="funding-history-filter-panel"
        class="recent-filter-panel fh-filter-panel"
        aria-label="Funding history filters"
      >
        <div class="recent-filter-grid">
          <div class="filter-group full-width">
            <span class="filter-label">Status</span>
            <div class="bw-segmented">
              <button
                v-for="s in (['all','approved','pending','rejected'] as const)"
                :key="s"
                type="button"
                :class="['bw-seg', statusFilter === s ? 'active' : '']"
                @click="statusFilter = s"
              >{{ s }}</button>
            </div>
          </div>
          <label class="filter-group">
            <span class="filter-label">Channel</span>
            <select class="fh-select" v-model="channelFilter" aria-label="Channel">
              <option value="all">All channels</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="paystack">Paystack</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <div class="filter-group fh-date-filter">
            <span class="filter-label">Date range</span>
            <div class="fh-date-range">
              <input type="date" class="fh-input" v-model="fromDate" aria-label="From date" />
              <span class="fh-date-sep">–</span>
              <input type="date" class="fh-input" v-model="toDate" aria-label="To date" />
            </div>
          </div>
          <div class="filter-group full-width">
            <span class="filter-label">Actions</span>
            <div class="fh-action-row">
              <button class="bw-btn sm" :disabled="loading" @click="load">
                {{ loading ? 'Loading…' : 'Refresh' }}
              </button>
              <button class="bw-btn sm" :disabled="!displayItems.length" @click="doExport">Export CSV</button>
              <RouterLink class="bw-btn sm primary fh-queue-link" :to="{ name: 'funding' }">Approval Queue</RouterLink>
            </div>
          </div>
        </div>
      </section>

      <div class="bw-data-region" :data-view="viewMode">
      <div class="bw-t-wrap">
        <table class="bw-table fh-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Vendor</th>
              <th>Channel</th>
              <th>Reference</th>
              <th>Proof</th>
              <th style="text-align:right">Amount</th>
              <th>Status</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in paginatedItems" :key="f.id">
              <td class="bw-mono bw-muted" style="font-size:var(--t-xs); white-space:nowrap">
                {{ shortDate(f.created_at) }}
              </td>
              <td>
                <strong>{{ vendorName(f) }}</strong>
                <div class="fh-sub" v-if="vendorEmail(f)">{{ vendorEmail(f) }}</div>
                <div class="fh-sub" v-if="f.submitted_by">by {{ f.submitted_by }}</div>
              </td>
              <td><span :class="['bw-badge', channelBadge(f.channel)]">{{ f.channel }}</span></td>
              <td class="bw-mono" style="font-size:var(--t-xs)">{{ f.funding_reference || '—' }}</td>
              <td>
                <a v-if="f.proof_view_url" :href="f.proof_view_url" target="_blank" rel="noopener" class="fh-proof">view</a>
                <span v-else-if="f.proof_file_path" class="bw-muted bw-mono" style="font-size:var(--t-xs)">stored</span>
                <span v-else class="bw-muted">—</span>
              </td>
              <td class="bw-money" style="text-align:right">{{ naira(f.amount_minor) }}</td>
              <td>
                <span :class="['bw-badge', statusBadge(f.status)]">{{ statusLabel(f.status) }}</span>
                <div v-if="f.rejection_reason" class="fh-reject">{{ f.rejection_reason }}</div>
                <div v-if="f.approved_at" class="fh-sub">{{ shortDate(f.approved_at) }}</div>
              </td>
              <td>
                <div class="receipt-actions">
                  <button class="bw-btn sm" @click="viewFundingReceipt(f)">View</button>
                  <button class="bw-btn sm" @click="printFundingReceipt(f)">Print</button>
                </div>
              </td>
            </tr>
            <tr v-if="!displayItems.length && !loading">
              <td colspan="8" class="bw-muted" style="text-align:center; padding:var(--s-6)">
                No funding records match the current filters.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards fh-cards">
        <div v-for="f in paginatedItems" :key="f.id" class="fh-card">
          <div class="fh-card-top">
            <div>
              <div class="fh-card-amount">{{ naira(f.amount_minor) }}</div>
              <div class="fh-card-vendor">{{ vendorName(f) }}</div>
              <div class="fh-sub" v-if="vendorEmail(f)">{{ vendorEmail(f) }}</div>
            </div>
            <span :class="['bw-badge', statusBadge(f.status)]">{{ statusLabel(f.status) }}</span>
          </div>
          <div class="fh-card-row">
            <span class="fh-card-lbl">Date</span>
            <span class="bw-mono" style="font-size:var(--t-xs)">{{ shortDate(f.created_at) }}</span>
          </div>
          <div class="fh-card-row">
            <span class="fh-card-lbl">Channel</span>
            <span :class="['bw-badge', channelBadge(f.channel)]">{{ f.channel }}</span>
          </div>
          <div class="fh-card-row" v-if="f.funding_reference">
            <span class="fh-card-lbl">Reference</span>
            <span class="bw-mono" style="font-size:var(--t-xs)">{{ f.funding_reference }}</span>
          </div>
          <div class="fh-card-row" v-if="f.proof_view_url">
            <span class="fh-card-lbl">Proof</span>
            <a :href="f.proof_view_url" target="_blank" rel="noopener" class="fh-proof">view</a>
          </div>
          <div class="fh-card-row" v-if="f.rejection_reason">
            <span class="fh-card-lbl">Reason</span>
            <span style="color:var(--danger); font-size:var(--t-xs)">{{ f.rejection_reason }}</span>
          </div>
          <div class="fh-card-row">
            <span class="fh-card-lbl">Receipt</span>
            <span class="receipt-actions">
              <button class="bw-btn sm" @click="viewFundingReceipt(f)">View</button>
              <button class="bw-btn sm" @click="printFundingReceipt(f)">Print</button>
            </span>
          </div>
        </div>
        <div v-if="!displayItems.length && !loading" class="bw-muted" style="text-align:center; padding:var(--s-6); font-size:var(--t-sm)">
          No funding records.
        </div>
      </div>
      </div>

      <WalletTablePagination
        v-model:page="currentPage"
        v-model:pageSize="pageSize"
        :total-items="displayItems.length"
        item-label="funding records"
        :loading="loading"
      />

      <!-- Load more -->
      <div v-if="nextCursor" class="fh-load-more">
        <button class="bw-btn sm" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
/* Banner */
.fh-banner {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--s-3); padding: var(--s-3) var(--s-4); border-radius: var(--r-md);
  margin-bottom: var(--s-3); font-size: var(--t-sm); border: 1px solid;
}
.fh-banner.success { background: oklch(from var(--brand) l c h / 0.08); border-color: oklch(from var(--brand) l c h / 0.30); color: var(--brand); }
.fh-banner.error   { background: oklch(from var(--danger) l c h / 0.08); border-color: oklch(from var(--danger) l c h / 0.30); color: var(--danger); }
.fh-banner-x { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 18px; line-height: 1; padding: 2px 8px; border-radius: 50%; opacity: 0.7; }
.fh-banner-x:hover { opacity: 1; background: oklch(0% 0 0 / 0.10); }
.banner-enter-active, .banner-leave-active { transition: all 0.20s var(--ease-out); }
.banner-enter-from { opacity: 0; transform: translateY(-4px); }
.banner-leave-to { opacity: 0; }

/* KPI row */
.fh-kpi-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}
.fh-kpi {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-md);
  padding: var(--s-4);
  display: flex; flex-direction: column; gap: 4px;
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
}
.fh-kpi-label { font-size: var(--t-xs); color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.fh-kpi-value { font-family: var(--font-mono); font-size: var(--t-xl); font-weight: 700; color: var(--text); }
.fh-kpi-value.brand  { color: var(--brand); }
.fh-kpi-value.warn   { color: var(--warn, #d97706); }
.fh-kpi-value.danger { color: var(--danger); }
.fh-kpi-sub { font-size: var(--t-xs); color: var(--text-muted); }

.fh-select {
  background: var(--glass-bg-strong); border: 1px solid var(--glass-border);
  border-radius: var(--r-md); padding: 6px 10px;
  color: var(--text); font-size: var(--t-sm); cursor: pointer;
}
.fh-date-range { display: flex; align-items: center; gap: 6px; min-width: 0; }
.fh-date-range .fh-input { flex: 1 1 0; min-width: 0; }
.fh-action-row { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; }
.fh-action-row .bw-btn { flex: 1 1 0; min-width: 0; white-space: nowrap; }
.fh-queue-link { text-decoration: none; justify-content: center; }
.fh-input {
  background: var(--glass-bg-strong); border: 1px solid var(--glass-border);
  border-radius: var(--r-md); padding: 6px 8px;
  color: var(--text); font-size: var(--t-sm);
  width: 130px;
}
.fh-date-sep { color: var(--text-muted); font-size: var(--t-sm); }

/* Table */
.fh-table .fh-sub  { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px; }
.fh-table .fh-reject { font-size: 10px; color: var(--danger); margin-top: 2px; max-width: 200px; }
.fh-proof { color: var(--brand); font-family: var(--font-mono); font-size: var(--t-xs); text-decoration: underline; }
.receipt-actions { display: inline-flex; gap: 4px; white-space: nowrap; }

/* Mobile cards */
.fh-cards { padding: var(--s-3); }
.fh-card {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--r-md); padding: var(--s-4); margin-bottom: var(--s-2);
}
.fh-card:last-child { margin-bottom: 0; }
.fh-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--s-3); gap: var(--s-2); }
.fh-card-amount { font-family: var(--font-mono); font-weight: 700; font-size: var(--t-lg); }
.fh-card-vendor { font-size: var(--t-xs); color: var(--text-muted); margin-top: 2px; }
.fh-card-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: var(--t-sm); border-top: 1px dashed var(--border); }
.fh-card-lbl { color: var(--text-muted); }
.fh-sub { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px; }

/* Load more */
.fh-load-more { display: flex; justify-content: center; padding: var(--s-4); border-top: 1px solid var(--border); }

/* Responsive KPI row */
@media (max-width: 768px) {
  .fh-kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 480px) {
  .fh-kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fh-date-range { flex-direction: row; width: 100%; }
  .fh-date-sep { flex: 0 0 auto; }
  .fh-action-row { width: 100%; }
  .fh-input { width: 100%; }
}
</style>
