<script setup lang="ts">
/**
 * Customers admin list (super-admin, operations-manager, account).
 *
 * KPI strip + filterable list. Row click → /customers/:id detail page.
 *
 * Station scoping: non-super-admin staff see only customers whose meters
 * are registered at their assigned station(s). A staff member with no
 * station assignment will receive an empty list from the API — this
 * component surfaces an explanatory banner in that case.
 *
 * Endpoints:
 *   GET /api/v1/admin/customers[?status,kycTier,q,cursor]
 *   GET /api/v1/admin/customers/summary
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import MobileActionMenu from '../components/MobileActionMenu.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import WalletRowActions from '@beverly/tokens/WalletRowActions.vue';
import WalletTablePagination from '@beverly/tokens/WalletTablePagination.vue';
import type { ActionItem } from '@beverly/tokens/WalletRowActions.vue';
import { api, naira, shortDate, ApiError } from '../lib/api';
import { printPdf } from '../lib/export';
import { useStaffAuthStore } from '../stores/auth';

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
    station_ids: string[];
}

interface Summary {
    total: number;
    byTier: Record<string, number>;
    byStatus: Record<string, number>;
    totalFloatMinor: number;
}

const router = useRouter();
const auth = useStaffAuthStore();
const canDeleteCustomers = computed(() => auth.hasPermission('wallet.funding.approve'));
const summary = ref<Summary | null>(null);
const customers = ref<CustomerRow[]>([]);
const totalCount = computed(() => summary.value?.total || customers.value.length);
const cursor = ref<string | null>(null);
const loading = ref(false);
const viewMode = ref<'list' | 'table'>(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'list' : 'table',
);
const banner = ref<string | null>(null);
const success = ref<string | null>(null);

/**
 * True when the logged-in user is station-scoped (non-super-admin) but has
 * no station assignments in their profile. In this state the API will always
 * return an empty customer list because the station filter has nothing to
 * match against. We surface a dedicated banner rather than letting the table
 * silently show "No customers match the filters."
 */
const stationScopeEmpty = computed(
    () => auth.user?.role !== 'super-admin' && auth.stationScope.length === 0,
);
const deleteOpen = ref(false);
const deleteTarget = ref<CustomerRow | null>(null);
const deleteReason = ref('');
const deleteBusy = ref(false);
const deleteReasonValid = computed(() => deleteReason.value.trim().length >= 4);

const fStatus = ref('');
const fTier = ref('');
const fQ = ref('');

async function loadSummary() {
    try { summary.value = await api.get<Summary>('/api/v1/admin/customers/summary'); }
    catch { /* supplementary */ }
}

async function loadList(reset = true) {
    loading.value = true;
    // Clear a previous station-scope banner before each fresh load so it does
    // not linger if the user's profile has since been updated.
    if (banner.value?.includes('station')) banner.value = null;
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
        // Surface an explicit explanation when a station-scoped user has no
        // station assignment and the API therefore returns an empty list.
        if (reset && r.customers.length === 0 && stationScopeEmpty.value) {
            banner.value = 'No customers are visible because your staff account has no station assigned. '
                + 'Ask a Super Admin to assign you to a station under Roles & Team.';
        }
    } catch (e: any) {
        banner.value = e?.message ?? 'Could not load customers.';
    } finally { loading.value = false; }
}

function resetFilters() {
    fStatus.value = ''; fTier.value = ''; fQ.value = '';
    void loadList();
}

function askDeleteCustomer(customer: CustomerRow) {
    if (!canDeleteCustomers.value) return;
    deleteTarget.value = customer;
    deleteReason.value = '';
    deleteOpen.value = true;
}

async function deleteCustomer() {
    if (!deleteTarget.value || !deleteReasonValid.value) return;
    deleteBusy.value = true;
    banner.value = null;
    success.value = null;
    const target = deleteTarget.value;
    try {
        await api.del(`/api/v1/admin/customers/${target.id}`, {
            reason: deleteReason.value.trim(),
        });
        customers.value = customers.value.filter((c) => c.id !== target.id);
        await loadSummary();
        success.value = `${target.full_name || target.phone || 'Customer'} deleted.`;
        deleteOpen.value = false;
        deleteTarget.value = null;
    } catch (e: any) {
        banner.value = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Delete failed.';
        deleteOpen.value = false;
    } finally {
        deleteBusy.value = false;
    }
}

function statusBadge(s: string) {
    return ({ active: 'success', suspended: 'warn', closed: 'danger' } as Record<string, string>)[s] ?? 'neutral';
}
function tierBadge(t: number) {
    return t >= 2 ? 'success' : t === 1 ? 'info' : 'neutral';
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
            columns: ['Name', 'Station IDs', 'Phone', 'KYC', 'Status', 'Balance'],
            rows: customers.value.map((c) => [
                c.full_name ?? '—', c.station_ids.join(', ') || '—', c.phone ?? '—', `T${c.kyc_tier}`, c.status, naira(c.balance_minor),
            ]),
        }],
    });
}

function buildCustomerRowActions(c: CustomerRow): ActionItem[] {
    const actions: ActionItem[] = [
        { label: 'View Customer', icon: 'view', action: () => router.push(`/customers/${c.id}`) },
    ];
    if (canDeleteCustomers.value) {
        actions.push({ label: 'Delete Customer', icon: 'delete', action: () => askDeleteCustomer(c) });
    }
    return actions;
}

const currentPage = ref(1);
const pageSize = ref(10);

const paginatedCustomers = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return customers.value.slice(start, start + pageSize.value);
});

onMounted(() => { void loadSummary(); void loadList(); });
watch([fStatus, fTier], () => loadList());
</script>

<template>
  <AppShell title="Customers">


    <div v-if="banner" class="bw-banner error">
      {{ banner }}
      <button class="bw-banner-x" @click="banner = null" aria-label="Dismiss">×</button>
    </div>

    <div v-if="success" class="bw-banner success">
      {{ success }}
      <button class="bw-banner-x" @click="success = null" aria-label="Dismiss">×</button>
    </div>

    <!-- KPI -->
    <div class="kpi-grid bw-mobile-kpi-grid">
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
    <div class="bw-card flush bw-data-region" :data-view="viewMode">
      <div class="bw-table-head-bar">
        <div class="bw-table-heading">
          <div class="bw-table-title-row">
            <div class="bw-card-title">Customers</div>
            <span v-if="loading" class="bw-skeleton bw-table-count" aria-hidden="true"></span>
            <span v-else class="bw-table-count">{{ totalCount || customers.length }}</span>
          </div>
          <div class="bw-card-sub">Registered customer accounts and wallet balances</div>
        </div>
        <div class="bw-table-actions">
          <WalletDataViewSwitch v-model="viewMode" label="Customer display view" />
          <button class="bw-btn" :disabled="!customers.length" @click="exportPdfDoc">Export PDF</button>
        </div>
      </div>

      <!-- Desktop -->
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Station IDs</th>
              <th>KYC</th>
              <th style="text-align: right">Balance</th>
              <th>Status</th>
              <th>Joined</th>
              <th class="actions-col action-column bw-align-center" style="text-align: center">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in paginatedCustomers" :key="c.id" @click="router.push(`/customers/${c.id}`)" class="c-row">
              <td>
                <div class="bw-truncate" style="max-width: 200px; font-weight: 600">{{ c.full_name || '—' }}</div>
                <div class="bw-mono row-sub">{{ c.email || c.id.slice(0, 8) }}</div>
              </td>
              <td class="bw-mono">{{ c.phone || '—' }}</td>
              <td><span class="bw-badge info bw-mono">{{ c.station_ids.join(', ') || 'Unassigned' }}</span></td>
              <td><span :class="['bw-badge', tierBadge(c.kyc_tier)]">Tier {{ c.kyc_tier }}</span></td>
              <td class="bw-money" style="text-align: right">{{ naira(c.balance_minor) }}</td>
              <td><span :class="['bw-badge', statusBadge(c.status)]">{{ c.status }}</span></td>
              <td class="bw-mono bw-muted" style="font-size: var(--t-xs)">{{ shortDate(c.created_at) }}</td>
              <td class="actions-col action-column bw-align-center" style="text-align: center" @click.stop>
                <WalletRowActions
                  :items="buildCustomerRowActions(c)"
                  label="Customer actions"
                  align="center"
                />
              </td>
            </tr>
            <tr v-if="!customers.length && !loading">
              <td colspan="8" class="bw-muted empty">No customers match the filters.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile -->
      <div class="bw-t-cards c-cards">
        <div v-for="c in paginatedCustomers" :key="c.id" class="c-card" @click="router.push(`/customers/${c.id}`)">
          <div class="cc-head">
            <div>
              <div style="font-weight: 700">{{ c.full_name || '—' }}</div>
              <div class="bw-mono row-sub">{{ c.phone || c.id.slice(0, 8) }}</div>
            </div>
            <span :class="['bw-badge', statusBadge(c.status)]">{{ c.status }}</span>
          </div>
          <div class="cc-grid">
            <div>
              <p class="cc-label">Station IDs</p>
              <span class="bw-badge info bw-mono">{{ c.station_ids.join(', ') || 'Unassigned' }}</span>
            </div>
            <div>
              <p class="cc-label">Balance</p>
              <p class="bw-money">{{ naira(c.balance_minor) }}</p>
            </div>
            <div>
              <p class="cc-label">KYC</p>
              <span :class="['bw-badge', tierBadge(c.kyc_tier)]">Tier {{ c.kyc_tier }}</span>
            </div>
          </div>
          <div class="cc-actions" @click.stop>
            <WalletRowActions
              :items="buildCustomerRowActions(c)"
              label="Customer actions"
              align="right"
            />
          </div>
        </div>
        <div v-if="!customers.length && !loading" class="bw-muted empty">No customers.</div>
      </div>

      <WalletTablePagination
        v-model:page="currentPage"
        v-model:pageSize="pageSize"
        :total-items="customers.length"
        item-label="customers"
      />

      <div v-if="cursor" class="load-more">
        <button class="bw-btn" :disabled="loading" @click="loadList(false)">
          {{ loading ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </div>

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete customer"
      :description="deleteTarget
        ? `Permanently delete ${deleteTarget.full_name || deleteTarget.phone || 'this customer'} from Beverly. Wallet, meter, purchase, notification, and login records will be removed.`
        : ''"
      confirm-label="Delete customer"
      tone="danger"
      :loading="deleteBusy"
      :disable-confirm="!deleteReasonValid"
      @confirm="deleteCustomer"
    >
      <label class="cd-input-label">Reason *</label>
      <textarea
        v-model="deleteReason"
        rows="3"
        class="cd-input"
        placeholder="e.g. duplicate customer record"
      />
      <p class="cd-input-hint">Minimum 4 characters.</p>
    </ConfirmDialog>

  </AppShell>
</template>

<style scoped>
.bw-banner { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); padding: var(--s-3) var(--s-4); border-radius: var(--r-md); margin-bottom: var(--s-3); font-size: var(--t-sm); border: 1px solid; }
.bw-banner.error { background: oklch(from var(--danger) l c h / 0.08); border-color: oklch(from var(--danger) l c h / 0.30); color: var(--danger); }
.bw-banner.success { background: oklch(from var(--brand) l c h / 0.08); border-color: oklch(from var(--brand) l c h / 0.30); color: var(--brand); }
.bw-banner-x { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 18px; padding: 2px 8px; opacity: 0.7; }

.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--s-3); margin-bottom: var(--s-3); }
.kpi-tile { background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--r-lg); padding: var(--s-4); position: relative; overflow: hidden; backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%); box-shadow: var(--glass-shine), var(--glass-shadow-card); }
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
.actions-col { min-width: 150px; }
.action-cluster { display: flex; justify-content: flex-end; gap: 6px; flex-wrap: nowrap; }
.empty { text-align: center; padding: var(--s-6); }
.load-more { padding: var(--s-3); text-align: center; }
.bw-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.c-cards { padding: var(--s-3); }
.c-card { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-md); padding: var(--s-4); margin-bottom: var(--s-2); cursor: pointer; }
.c-card:hover { border-color: var(--brand); }
.cc-head { display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--s-3); gap: var(--s-2); }
.cc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); padding-top: var(--s-3); border-top: 1px dashed var(--border); }
.cc-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin: 0 0 2px; }
.cc-actions { display: flex; gap: var(--s-2); padding-top: var(--s-3); margin-top: var(--s-3); border-top: 1px dashed var(--border); }

:deep(.cd-body) .cd-input-label { display: block; font-size: var(--t-xs); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px; }
:deep(.cd-body) .cd-input { width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-md); padding: 10px 12px; color: var(--text); font-size: var(--t-sm); font-family: inherit; resize: vertical; min-height: 80px; }
:deep(.cd-body) .cd-input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
:deep(.cd-body) .cd-input-hint { font-size: var(--t-xs); color: var(--text-muted); margin: 6px 0 0; }

@media (max-width: 720px) {
  .actions-col {
    min-width: 72px;
    position: sticky;
    right: 0;
    background: var(--glass-bg-strong);
    backdrop-filter: blur(16px) saturate(150%);
    -webkit-backdrop-filter: blur(16px) saturate(150%);
    z-index: 3;
  }

  .action-cluster {
    display: none;
  }

  .cc-actions {
    justify-content: flex-end;
  }
}

@media (max-width: 640px) { .filter-grid { grid-template-columns: 1fr; } }
</style>
