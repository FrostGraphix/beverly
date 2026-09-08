<script setup lang="ts">
/**
 * Vendor funding history — wallet top-ups (bank transfer + Paystack).
 * GET /api/v1/vendor/funding[?limit]
 */
import { onMounted, ref, computed, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import WalletTableSkeleton from '@beverly/tokens/WalletTableSkeleton.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import WalletTablePagination from '@beverly/tokens/WalletTablePagination.vue';
import WalletExportWizard from '@beverly/tokens/WalletExportWizard.vue';
import type { WalletExportColumn } from '@beverly/tokens/wallet-export';
import { api } from '../lib/api';
import { naira, shortDate } from '../lib/format';

interface Funding {
    id: string;
    amount_minor: number;
    channel: 'bank_transfer' | 'paystack' | 'manual';
    status: string;
    funding_reference: string | null;
    proof_view_url?: string | null;
    rejection_reason: string | null;
    created_at: string;
    approved_at: string | null;
}

const items = ref<Funding[]>([]);
const loading = ref(false);
const filter = ref<'all' | 'approved' | 'pending' | 'rejected'>('all');
const showFilters = ref(false);
const searchQuery = ref('');
const channelFilter = ref<'all' | Funding['channel']>('all');
const page = ref(1);
const pageSize = ref(10);
const viewMode = ref<'list' | 'table'>(typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'list' : 'table');

async function load() {
    loading.value = true;
    try {
        const r = await api.get<{ funding: Funding[] }>('/api/v1/vendor/funding?limit=200');
        items.value = r.funding ?? [];
    } catch { /* noop */ } finally { loading.value = false; }
}

const filtered = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    return items.value.filter((f) => {
        const statusMatches = filter.value === 'all' || (filter.value === 'approved' && f.status === 'approved') ||
            (filter.value === 'rejected' && f.status === 'rejected') ||
            (filter.value === 'pending' && ['initiated', 'proof_uploaded', 'under_review'].includes(f.status));
        const channelMatches = channelFilter.value === 'all' || f.channel === channelFilter.value;
        const searchMatches = !q || `${f.funding_reference ?? ''} ${f.status} ${f.channel}`.toLowerCase().includes(q);
        return statusMatches && channelMatches && searchMatches;
    });
});
const paginated = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
const activeFilterCount = computed(() => [filter.value !== 'all', channelFilter.value !== 'all', !!searchQuery.value.trim()].filter(Boolean).length);
watch([filter, channelFilter, searchQuery, pageSize], () => { page.value = 1; });

const totalApproved = computed(() =>
    items.value.filter((f) => f.status === 'approved').reduce((s, f) => s + f.amount_minor, 0),
);

function statusBadge(s: string) {
    return ({
        approved: 'success', proof_uploaded: 'warn', under_review: 'warn',
        initiated: 'neutral', rejected: 'danger', expired: 'neutral', cancelled: 'neutral',
    } as Record<string, string>)[s] ?? 'neutral';
}
function channelBadge(c: string) {
    return ({ paystack: 'info', bank_transfer: 'neutral', manual: 'warn' } as Record<string, string>)[c] ?? 'neutral';
}

const fundingExportColumns: WalletExportColumn<Funding>[] = [
    { key: 'created_at', header: 'Date', value: (row) => row.created_at },
    { key: 'channel', header: 'Channel', value: (row) => row.channel },
    { key: 'reference', header: 'Reference', value: (row) => row.funding_reference ?? '' },
    { key: 'amount', header: 'Amount (NGN)', value: (row) => (row.amount_minor / 100).toFixed(2) },
    { key: 'status', header: 'Status', value: (row) => row.status },
    { key: 'approved_at', header: 'Approved At', value: (row) => row.approved_at ?? '' },
    { key: 'rejection_reason', header: 'Rejection Reason', value: (row) => row.rejection_reason ?? '' },
];

onMounted(load);
</script>

<template>
  <AppShell title="Funding History">
    <div class="bw-card hero-card">
      <p class="bw-label" style="color: var(--brand); margin: 0 0 var(--s-1)">Total funded (approved)</p>
      <div class="bw-kpi-value" style="color: var(--brand); font-size: var(--t-3xl)">{{ naira(totalApproved) }}</div>
      <p class="bw-muted" style="font-size: var(--t-xs); margin: var(--s-1) 0 0">{{ items.length }} requests all-time</p>
    </div>

    <div class="bw-card flush bw-data-region" :data-view="viewMode">
      <div class="bw-table-head-bar">
        <div class="bw-table-heading">
          <div class="bw-table-title-row">
            <div class="bw-card-title">Funding History</div>
            <span v-if="loading" class="bw-skeleton bw-table-count" aria-hidden="true"></span>
            <span v-else class="bw-table-count">{{ items.length }}</span>
          </div>
          <div class="bw-card-sub">{{ naira(totalApproved) }} total funded (approved)</div>
        </div>
        <div class="bw-table-actions funding-head-actions">
          <WalletDataViewSwitch v-model="viewMode" :modes="['list','table']" label="Funding display view" />
          <button class="bw-btn sm" :class="{ active: showFilters }" :aria-expanded="showFilters" @click="showFilters = !showFilters">Filter <span v-if="activeFilterCount">{{ activeFilterCount }}</span></button>
          <WalletExportWizard :rows="filtered" :columns="fundingExportColumns" filename="beverly-vendor-funding-history" title="Vendor Funding History" subtitle="Choose funding records and fields." :loading="loading" :formats="['pdf']" :date-value="row => row.created_at" :status-value="row => row.status" :status-options="[{value:'approved',label:'Approved'},{value:'proof_uploaded',label:'Proof uploaded'},{value:'under_review',label:'Under review'},{value:'rejected',label:'Rejected'}]" />
        </div>
      </div>
      <section v-if="showFilters" class="funding-filter-panel" aria-label="Funding filters">
        <label class="funding-filter-field"><span>Search</span><input v-model="searchQuery" class="bw-input" placeholder="Reference, status, channel" /></label>
        <label class="funding-filter-field"><span>Channel</span><select v-model="channelFilter" class="bw-select"><option value="all">All channels</option><option value="paystack">Paystack</option><option value="bank_transfer">Bank transfer</option><option value="manual">Manual</option></select></label>
        <div class="funding-filter-field wide"><span>Status</span><div class="bw-segmented funding-filters"><button v-for="f in (['all','approved','pending','rejected'] as const)" :key="f" :class="['bw-seg', filter === f ? 'active' : '']" @click="filter = f">{{ f }}</button></div></div>
      </section>
      <!-- Desktop -->
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Channel</th>
              <th>Reference</th>
              <th>Proof</th>
              <th style="text-align:right">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <WalletTableSkeleton v-if="loading && !filtered.length" :columns="6" />
            <tr v-for="f in paginated" :key="f.id">
              <td class="bw-mono bw-dim" style="font-size: var(--t-xs)">{{ shortDate(f.created_at) }}</td>
              <td><span :class="['bw-badge', channelBadge(f.channel)]">{{ f.channel }}</span></td>
              <td class="bw-mono" style="font-size: var(--t-xs)">{{ f.funding_reference || '—' }}</td>
              <td>
                <a v-if="f.proof_view_url" :href="f.proof_view_url" target="_blank" rel="noopener" class="proof-link">view</a>
                <span v-else class="bw-muted">—</span>
              </td>
              <td class="bw-money" style="text-align:right">{{ naira(f.amount_minor) }}</td>
              <td>
                <span :class="['bw-badge', statusBadge(f.status)]">{{ f.status }}</span>
                <div v-if="f.status === 'rejected' && f.rejection_reason" class="reject-reason">{{ f.rejection_reason }}</div>
              </td>
            </tr>
            <tr v-if="!filtered.length && !loading">
              <td colspan="6" class="bw-muted" style="text-align:center; padding: var(--s-6)">No funding requests.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards">
        <WalletTableSkeleton v-if="loading && !filtered.length" variant="cards" />
        <div v-for="f in paginated" :key="f.id" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor bw-money">{{ naira(f.amount_minor) }}</div>
              <div class="bw-tc-id">{{ shortDate(f.created_at) }}</div>
            </div>
            <span :class="['bw-badge', statusBadge(f.status)]">{{ f.status }}</span>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Channel</span>
              <span :class="['bw-badge', channelBadge(f.channel)]">{{ f.channel }}</span>
            </div>
            <div class="bw-tc-pair" v-if="f.proof_view_url">
              <span class="bw-tc-pair-label">Proof</span>
              <a :href="f.proof_view_url" target="_blank" rel="noopener" class="proof-link">view</a>
            </div>
            <div class="bw-tc-pair" v-if="f.status === 'rejected' && f.rejection_reason">
              <span class="bw-tc-pair-label">Reason</span>
              <span class="bw-tc-pair-val" style="color: var(--danger)">{{ f.rejection_reason }}</span>
            </div>
          </div>
        </div>
        <div v-if="!filtered.length && !loading" class="bw-muted"
             style="text-align:center; padding: var(--s-6); font-size: var(--t-sm)">No funding requests.</div>
      </div>
      <WalletTablePagination v-model:page="page" v-model:pageSize="pageSize" :total-items="filtered.length" item-label="funding requests" :loading="loading" />
    </div>
  </AppShell>
</template>

<style scoped>
.hero-card {
  background: radial-gradient(100% 80% at 0% 0%, var(--brand-glow), transparent 60%), var(--surface);
  border-color: oklch(70% 0.19 145 / 0.22);
  margin-bottom: var(--s-3);
}
.funding-toolbar { display: flex; align-items: center; gap: var(--s-2); margin-bottom: var(--s-3); }
.funding-filters { flex: 1 1 auto; min-width: 0; }
.funding-filters .bw-seg { flex: 1 1 0; min-width: 0; letter-spacing: 0; }
.funding-head-actions { flex-wrap:wrap; }
.funding-filter-panel { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(180px,1fr); gap:var(--s-3); padding:var(--s-3) var(--s-4); border-top:1px solid var(--border); background:var(--surface-1); }
.funding-filter-field { display:grid; gap:6px; min-width:0; color:var(--text-muted); font-size:var(--t-xs); font-weight:700; text-transform:uppercase; }
.funding-filter-field.wide { grid-column:1/-1; }
.funding-toolbar .bw-btn { flex: 0 0 auto; white-space: nowrap; }
.proof-link { color: var(--brand); font-family: var(--font-mono); font-size: var(--t-xs); text-decoration: underline; }
.reject-reason { font-size: 10px; color: var(--danger); margin-top: 2px; max-width: 220px; }

@media (max-width: 480px) {
  .funding-head-actions { width:100%; display:grid; grid-template-columns:auto 1fr 1fr; }
  .funding-filter-panel { grid-template-columns:1fr; padding:var(--s-3); }
  .funding-filter-field.wide { grid-column:auto; }
  .funding-filters .bw-seg { padding-inline: 5px; font-size: var(--t-xs); }
  .funding-filters { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
}
</style>
