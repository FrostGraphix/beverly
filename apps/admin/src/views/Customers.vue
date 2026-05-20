<script setup lang="ts">
/**
 * Customers admin list (super-admin / operations).
 *
 * KPI strip + filterable list. Row click → /customers/:id detail page.
 *
 * Endpoints:
 *   GET /api/v1/admin/customers[?status,kycTier,q,cursor]
 *   GET /api/v1/admin/customers/summary
 */
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api, naira, shortDate } from '../lib/api';
import { exportCsv, printPdf } from '../lib/export';

interface CustomerRow {
    id: string;
    full_name: string | null;
    phone: string | null;
    email: string | null;
    kyc_tier: number;
    kyc_status: string;
    status: string;
    created_at: string;
    wallet_id: string | null;
    wallet_status: string | null;
    balance_minor: number;
    available_minor: number;
}

interface Summary {
    total: number;
    byTier: Record<string, number>;
    byStatus: Record<string, number>;
    totalFloatMinor: number;
}

const router = useRouter();
const summary = ref<Summary | null>(null);
const customers = ref<CustomerRow[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const banner = ref<string | null>(null);

const fStatus = ref('');
const fTier = ref('');
const fQ = ref('');

async function loadSummary() {
    try { summary.value = await api.get<Summary>('/api/v1/admin/customers/summary'); }
    catch { /* supplementary */ }
}

async function loadList(reset = true) {
    loading.value = true;
    try {
        const p = new URLSearchParams();
        if (fStatus.value) p.set('status', fStatus.value);
        if (fTier.value)   p.set('kycTier', fTier.value);
        if (fQ.value)      p.set('q', fQ.value);
        p.set('limit', '100');
        if (!reset && cursor.value) p.set('cursor', cursor.value);
        const r = await api.get<{ customers: CustomerRow[]; nextCursor: string | null }>(`/api/v1/admin/customers?${p}`);
        customers.value = reset ? r.customers : [...customers.value, ...r.customers];
        cursor.value = r.nextCursor;
    } catch (e: any) {
        banner.value = e?.message ?? 'Could not load customers.';
    } finally { loading.value = false; }
}

function resetFilters() {
    fStatus.value = ''; fTier.value = ''; fQ.value = '';
    void loadList();
}

function statusBadge(s: string) {
    return ({ active: 'success', suspended: 'warn', closed: 'danger' } as Record<string, string>)[s] ?? 'neutral';
}
function tierBadge(t: number) {
    return t >= 2 ? 'success' : t === 1 ? 'info' : 'neutral';
}

function exportCsvRows() {
    exportCsv('customers', customers.value, [
        { key: 'id', header: 'ID', value: (c) => c.id },
        { key: 'full_name', header: 'Name', value: (c) => c.full_name ?? '' },
        { key: 'phone', header: 'Phone', value: (c) => c.phone ?? '' },
        { key: 'email', header: 'Email', value: (c) => c.email ?? '' },
        { key: 'kyc_tier', header: 'KYC Tier', value: (c) => c.kyc_tier },
        { key: 'kyc_status', header: 'KYC Status', value: (c) => c.kyc_status },
        { key: 'status', header: 'Status', value: (c) => c.status },
        { key: 'balance', header: 'Balance (₦)', value: (c) => (c.balance_minor ?? 0) / 100 },
        { key: 'created_at', header: 'Created', value: (c) => c.created_at },
    ]);
}

function exportPdfDoc() {
    printPdf({
        title: 'Customers',
        subtitle: `${customers.value.length} loaded customers`,
        meta: [
            { label: 'Rows', value: String(customers.value.length) },
            { label: 'Total float', value: naira(customers.value.reduce((s, c) => s + Number(c.balance_minor ?? 0), 0)) },
        ],
        tables: [{
            title: 'Customers',
            columns: ['Name', 'Phone', 'KYC', 'Status', 'Balance'],
            rows: customers.value.map((c) => [
                c.full_name ?? '—', c.phone ?? '—', `T${c.kyc_tier}`, c.status, naira(c.balance_minor),
            ]),
        }],
    });
}

onMounted(() => { void loadSummary(); void loadList(); });
watch([fStatus, fTier], () => loadList());
</script>

<template>
  <AppShell title="Customers">
    <template #topbar-end>
      <button class="bw-btn sm" :disabled="!customers.length" @click="exportCsvRows">CSV</button>
      <button class="bw-btn sm" :disabled="!customers.length" @click="exportPdfDoc" style="margin-left:6px">PDF</button>
    </template>

    <div v-if="banner" class="bw-banner error">
      {{ banner }}
      <button class="bw-banner-x" @click="banner = null" aria-label="Dismiss">×</button>
    </div>

    <!-- KPI -->
    <div class="kpi-grid">
      <div class="kpi-tile brand">
        <p class="kpi-label">Total customers</p>
        <p class="kpi-value">{{ summary?.total ?? 0 }}</p>
        <p class="kpi-sub">{{ summary?.byStatus?.active ?? 0 }} active</p>
      </div>
      <div class="kpi-tile">
        <p class="kpi-label">Customer float</p>
        <p class="kpi-value">{{ naira(summary?.totalFloatMinor) }}</p>
        <p class="kpi-sub">across all wallets</p>
      </div>
      <div class="kpi-tile">
        <p class="kpi-label">Verified (T1+)</p>
        <p class="kpi-value">{{ (summary?.byTier?.tier_1 ?? 0) + (summary?.byTier?.tier_2 ?? 0) }}</p>
        <p class="kpi-sub">{{ summary?.byTier?.tier_2 ?? 0 }} at Tier 2</p>
      </div>
      <div class="kpi-tile">
        <p class="kpi-label">Unverified</p>
        <p class="kpi-value">{{ summary?.byTier?.tier_0 ?? 0 }}</p>
        <p class="kpi-sub">Tier 0</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="bw-card filter-card">
      <div class="filter-grid">
        <div>
          <label class="bw-label">Status</label>
          <select class="bw-input" v-model="fStatus">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div>
          <label class="bw-label">KYC tier</label>
          <select class="bw-input" v-model="fTier">
            <option value="">All</option>
            <option value="0">Tier 0</option>
            <option value="1">Tier 1</option>
            <option value="2">Tier 2</option>
          </select>
        </div>
        <div>
          <label class="bw-label">Search</label>
          <input class="bw-input" v-model="fQ" placeholder="name / phone / email" @keyup.enter="loadList()" />
        </div>
        <div class="filter-actions">
          <button class="bw-btn" @click="resetFilters">Reset</button>
          <button class="bw-btn primary" @click="loadList()">Apply</button>
        </div>
      </div>
    </div>

    <!-- List -->
    <div class="bw-card flush">
      <div class="bw-table-head-bar">
        <h2 class="bw-h2" style="margin: 0">{{ customers.length }} customers</h2>
        <span class="bw-spacer"></span>
        <span v-if="loading" class="bw-muted bw-mono" style="font-size: var(--t-xs)">loading…</span>
      </div>

      <!-- Desktop -->
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>KYC</th>
              <th style="text-align: right">Balance</th>
              <th>Status</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in customers" :key="c.id" @click="router.push(`/customers/${c.id}`)" class="c-row">
              <td>
                <div class="bw-truncate" style="max-width: 200px; font-weight: 600">{{ c.full_name || '—' }}</div>
                <div class="bw-mono row-sub">{{ c.email || c.id.slice(0, 8) }}</div>
              </td>
              <td class="bw-mono">{{ c.phone || '—' }}</td>
              <td><span :class="['bw-badge', tierBadge(c.kyc_tier)]">Tier {{ c.kyc_tier }}</span></td>
              <td class="bw-money" style="text-align: right">{{ naira(c.balance_minor) }}</td>
              <td><span :class="['bw-badge', statusBadge(c.status)]">{{ c.status }}</span></td>
              <td class="bw-mono bw-muted" style="font-size: var(--t-xs)">{{ shortDate(c.created_at) }}</td>
              <td class="row-arrow">→</td>
            </tr>
            <tr v-if="!customers.length && !loading">
              <td colspan="7" class="bw-muted empty">No customers match the filters.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile -->
      <div class="bw-t-cards c-cards">
        <div v-for="c in customers" :key="c.id" class="c-card" @click="router.push(`/customers/${c.id}`)">
          <div class="cc-head">
            <div>
              <div style="font-weight: 700">{{ c.full_name || '—' }}</div>
              <div class="bw-mono row-sub">{{ c.phone || c.id.slice(0, 8) }}</div>
            </div>
            <span :class="['bw-badge', statusBadge(c.status)]">{{ c.status }}</span>
          </div>
          <div class="cc-grid">
            <div>
              <p class="cc-label">Balance</p>
              <p class="bw-money">{{ naira(c.balance_minor) }}</p>
            </div>
            <div>
              <p class="cc-label">KYC</p>
              <span :class="['bw-badge', tierBadge(c.kyc_tier)]">Tier {{ c.kyc_tier }}</span>
            </div>
          </div>
        </div>
        <div v-if="!customers.length && !loading" class="bw-muted empty">No customers.</div>
      </div>

      <div v-if="cursor" class="load-more">
        <button class="bw-btn" :disabled="loading" @click="loadList(false)">
          {{ loading ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </div>

  </AppShell>
</template>

<style scoped>
.bw-banner { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); padding: var(--s-3) var(--s-4); border-radius: var(--r-md); margin-bottom: var(--s-3); font-size: var(--t-sm); border: 1px solid; }
.bw-banner.error { background: oklch(from var(--danger) l c h / 0.08); border-color: oklch(from var(--danger) l c h / 0.30); color: var(--danger); }
.bw-banner-x { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 18px; padding: 2px 8px; opacity: 0.7; }

.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--s-3); margin-bottom: var(--s-3); }
.kpi-tile { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: var(--s-4); position: relative; overflow: hidden; }
.kpi-tile.brand { background: linear-gradient(135deg, oklch(from var(--brand) l c h / 0.08), transparent); border-color: oklch(from var(--brand) l c h / 0.25); }
.kpi-tile.brand::before { content: ''; position: absolute; top: 0; left: 20%; right: 20%; height: 1px; background: linear-gradient(90deg, transparent, var(--brand), transparent); }
.kpi-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 6px; }
.kpi-value { font-family: var(--font-mono); font-weight: 700; font-size: var(--t-xl); margin: 0; }
.kpi-tile.brand .kpi-value { color: var(--brand); }
.kpi-sub { font-size: var(--t-xs); color: var(--text-muted); margin: 4px 0 0; }

.filter-card { margin-bottom: var(--s-3); }
.filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--s-3); align-items: end; }
.filter-actions { display: flex; gap: var(--s-2); align-items: end; }

.c-row { cursor: pointer; }
.c-row:hover { background: var(--surface-2); }
.row-sub { font-size: 10px; margin-top: 2px; color: var(--text-muted); }
.row-arrow { color: var(--text-muted); text-align: right; width: 24px; }
.empty { text-align: center; padding: var(--s-6); }
.load-more { padding: var(--s-3); text-align: center; }
.bw-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.c-cards { padding: var(--s-3); }
.c-card { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-md); padding: var(--s-4); margin-bottom: var(--s-2); cursor: pointer; }
.c-card:hover { border-color: var(--brand); }
.cc-head { display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--s-3); gap: var(--s-2); }
.cc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); padding-top: var(--s-3); border-top: 1px dashed var(--border); }
.cc-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin: 0 0 2px; }

@media (max-width: 640px) { .filter-grid { grid-template-columns: 1fr; } }
</style>
