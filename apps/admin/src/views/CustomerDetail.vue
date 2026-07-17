<script setup lang="ts">
/**
 * Customer detail (super-admin).
 *
 * Tabs: Overview · Wallet (+ledger) · Purchases · Funding
 * Action: suspend / reactivate (ConfirmDialog + reason, audit-logged).
 *
 * Endpoints:
 *   GET   /api/v1/admin/customers/:id
 *   GET   /api/v1/admin/customers/:id/wallet
 *   GET   /api/v1/admin/customers/:id/purchases
 *   GET   /api/v1/admin/customers/:id/funding
 *   PATCH /api/v1/admin/customers/:id/status
 */
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import MobileActionMenu from '../components/MobileActionMenu.vue';
import { api, naira, shortDate, ApiError } from '../lib/api';

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;

type Tab = 'overview' | 'wallet' | 'purchases' | 'funding';
const tab = ref<Tab>('overview');
const overviewView = ref<'grid' | 'table'>('grid');

const detail = ref<any>(null);
const loading = ref(true);
const banner = ref<{ tone: 'success' | 'error'; text: string } | null>(null);

// Lazy per-tab data
const wallet = ref<any>(null);
const purchases = ref<any[]>([]);
const funding = ref<any[]>([]);
const tabLoading = ref(false);

async function loadDetail() {
    loading.value = true;
    try {
        detail.value = await api.get<any>(`/api/v1/admin/customers/${id}`);
    } catch (e: any) {
        banner.value = { tone: 'error', text: e?.message ?? 'Could not load customer.' };
    } finally { loading.value = false; }
}

async function switchTab(t: Tab) {
    tab.value = t;
    if (t === 'wallet' && !wallet.value) {
        tabLoading.value = true;
        try { wallet.value = await api.get<any>(`/api/v1/admin/customers/${id}/wallet`); }
        catch { wallet.value = { entries: [] }; }
        finally { tabLoading.value = false; }
    }
    if (t === 'purchases' && !purchases.value.length) {
        tabLoading.value = true;
        try { purchases.value = (await api.get<any>(`/api/v1/admin/customers/${id}/purchases`)).purchases; }
        finally { tabLoading.value = false; }
    }
    if (t === 'funding' && !funding.value.length) {
        tabLoading.value = true;
        try { funding.value = (await api.get<any>(`/api/v1/admin/customers/${id}/funding`)).funding; }
        finally { tabLoading.value = false; }
    }
}

// ─ Status action ──────────────────────────────────────────────
const statusOpen = ref(false);
const statusTarget = ref<'active' | 'suspended' | 'closed'>('suspended');
const statusReason = ref('');
const statusBusy = ref(false);

const statusTone = computed<'brand' | 'danger' | 'warn'>(() =>
    statusTarget.value === 'suspended' ? 'warn' : statusTarget.value === 'closed' ? 'danger' : 'brand',
);
const statusLabel = computed(() => ({ active: 'Reactivate customer', suspended: 'Suspend customer', closed: 'Close account' }[statusTarget.value]));
const reasonValid = computed(() => statusTarget.value === 'active' || statusReason.value.trim().length >= 4);

function askStatus(next: 'active' | 'suspended' | 'closed') {
    statusTarget.value = next;
    statusReason.value = '';
    statusOpen.value = true;
}

async function doStatus() {
    if (!reasonValid.value) return;
    statusBusy.value = true;
    banner.value = null;
    try {
        const body: Record<string, unknown> = { status: statusTarget.value };
        if (statusReason.value.trim()) body.reason = statusReason.value.trim();
        await api.patch(`/api/v1/admin/customers/${id}/status`, body);
        statusOpen.value = false;
        banner.value = { tone: 'success', text: `Customer → ${statusTarget.value}.` };
        await loadDetail();
    } catch (e: any) {
        const msg = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Update failed.';
        banner.value = { tone: 'error', text: msg };
        statusOpen.value = false;
    } finally { statusBusy.value = false; }
}

// ─ Helpers ───────────────────────────────────────────────────
function statusBadge(s: string) { return ({ active: 'success', suspended: 'warn', closed: 'danger' } as Record<string, string>)[s] ?? 'neutral'; }
function tierBadge(t: number) { return t >= 2 ? 'success' : t === 1 ? 'info' : 'neutral'; }
function purchaseBadge(s: string) {
    return ({ delivered: 'success', completed: 'success', token_issued: 'success', failed: 'danger', refunded: 'info' } as Record<string, string>)[s] ?? 'neutral';
}
function fundingBadge(s: string) {
    return ({ success: 'success', initiated: 'warn', pending: 'warn', failed: 'danger', abandoned: 'neutral' } as Record<string, string>)[s] ?? 'neutral';
}
function dirSign(d: string) { return d === 'credit' ? '+' : '−'; }

const overviewFields = computed(() => detail.value ? [
    { label: 'Customer ID', value: detail.value.customer.id, mono: true },
    { label: 'Auth user', value: detail.value.customer.auth_user_id || '—', mono: true },
    { label: 'Phone', value: detail.value.customer.phone || '—', mono: true },
    { label: 'Email', value: detail.value.customer.email || '—', mono: true },
    { label: 'KYC tier', value: `Tier ${detail.value.customer.kyc_tier} (${detail.value.customer.kyc_status})` },
    { label: 'Account status', value: detail.value.customer.status },
    { label: 'Wallet', value: detail.value.wallet?.id || 'not provisioned', mono: true },
    { label: 'Joined', value: new Date(detail.value.customer.created_at).toLocaleString() },
] : []);

onMounted(loadDetail);
</script>

<template>
  <AppShell title="Customer">
    <div class="back-row">
      <button class="bw-btn sm" @click="router.push('/customers')">← Customers</button>
    </div>

    <transition name="banner">
      <div v-if="banner" :class="['bw-banner', banner.tone]" role="status">
        {{ banner.text }}
        <button class="bw-banner-x" @click="banner = null" aria-label="Dismiss">×</button>
      </div>
    </transition>

    <div v-if="loading" class="bw-card empty">Loading…</div>

    <template v-else-if="detail">
      <!-- Header card -->
      <div class="bw-card head-card">
        <div class="head-main">
          <div class="avatar">{{ (detail.customer.full_name ?? '?')[0]?.toUpperCase() }}</div>
          <div>
            <h1 class="head-name">{{ detail.customer.full_name || 'Unnamed customer' }}</h1>
            <p class="head-meta bw-mono">{{ detail.customer.phone }} · {{ detail.customer.email || 'no email' }}</p>
            <div class="head-badges">
              <span :class="['bw-badge', statusBadge(detail.customer.status)]">{{ detail.customer.status }}</span>
              <span :class="['bw-badge', tierBadge(detail.customer.kyc_tier)]">KYC Tier {{ detail.customer.kyc_tier }}</span>
              <span class="bw-badge neutral">{{ detail.customer.kyc_status }}</span>
            </div>
          </div>
        </div>
        <div class="head-actions">
          <div class="head-action-buttons">
            <button v-if="detail.customer.status === 'active'" class="bw-btn" @click="askStatus('suspended')">Suspend</button>
            <button v-if="detail.customer.status === 'suspended'" class="bw-btn primary" @click="askStatus('active')">Reactivate</button>
            <button v-if="detail.customer.status !== 'closed'" class="bw-btn danger" @click="askStatus('closed')">Close</button>
          </div>
          <MobileActionMenu label="Customer actions">
            <button v-if="detail.customer.status === 'active'" class="mobile-action-item" @click="askStatus('suspended')">Suspend</button>
            <button v-if="detail.customer.status === 'suspended'" class="mobile-action-item primary" @click="askStatus('active')">Reactivate</button>
            <button v-if="detail.customer.status !== 'closed'" class="mobile-action-item danger" @click="askStatus('closed')">Close</button>
          </MobileActionMenu>
        </div>
      </div>

      <!-- Stat tiles -->
      <div class="stat-grid">
        <div class="stat-tile brand">
          <p class="stat-label">Wallet balance</p>
          <p class="stat-value">{{ naira(detail.balance_minor) }}</p>
          <p class="stat-sub">Available {{ naira(detail.available_minor) }}</p>
        </div>
        <div class="stat-tile">
          <p class="stat-label">Total funded</p>
          <p class="stat-value">{{ naira(detail.stats.fundingValueMinor) }}</p>
          <p class="stat-sub">{{ detail.stats.fundingCount }} top-ups</p>
        </div>
        <div class="stat-tile">
          <p class="stat-label">Total spent</p>
          <p class="stat-value">{{ naira(detail.stats.purchaseValueMinor) }}</p>
          <p class="stat-sub">{{ detail.stats.purchaseCount }} purchases</p>
        </div>
        <div class="stat-tile">
          <p class="stat-label">Linked meters</p>
          <p class="stat-value">{{ detail.stats.meterCount }}</p>
          <p class="stat-sub">on this account</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button v-for="t in (['overview','wallet','purchases','funding'] as const)" :key="t"
                :class="['tab', { active: tab === t }]" @click="switchTab(t)">
          {{ t }}
        </button>
      </div>

      <!-- Overview -->
      <div v-if="tab === 'overview'" class="bw-card overview-card">
        <div class="overview-head">
          <h2>Account details</h2>
          <div class="overview-view-toggle" aria-label="Account details layout">
            <button type="button" :class="{ active: overviewView === 'grid' }" :aria-pressed="overviewView === 'grid'" aria-label="Grid view" title="Grid view" @click="overviewView = 'grid'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <button type="button" :class="{ active: overviewView === 'table' }" :aria-pressed="overviewView === 'table'" aria-label="Table view" title="Table view" @click="overviewView = 'table'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 9h18M9 4v16" />
              </svg>
            </button>
          </div>
        </div>
        <dl :class="['ov-dl', `ov-dl--${overviewView}`]">
          <div v-for="field in overviewFields" :key="field.label" class="ov-item">
            <dt>{{ field.label }}</dt>
            <dd :class="{ 'bw-mono': field.mono }">{{ field.value }}</dd>
          </div>
        </dl>
      </div>

      <!-- Wallet -->
      <div v-else-if="tab === 'wallet'" class="bw-card flush">
        <div v-if="tabLoading" class="empty bw-muted">Loading…</div>
        <template v-else-if="wallet">
          <div class="wallet-head">
            <div>
              <p class="stat-label">Balance</p>
              <p class="wallet-bal">{{ naira(wallet.balance_minor) }}</p>
              <p class="stat-sub">Available {{ naira(wallet.available_minor) }} · Holds {{ naira(wallet.holds_minor) }}</p>
            </div>
            <router-link :to="`/wallets`" class="bw-btn sm" style="text-decoration: none">All wallets →</router-link>
          </div>
          <ul class="ledger-list">
            <li v-for="e in wallet.entries" :key="e.id" class="ledger-row">
              <span class="bw-mono ledger-when">{{ shortDate(e.created_at) }}</span>
              <span class="bw-mono ledger-type">{{ e.entry_type.replace(/_/g, ' ') }}</span>
              <span class="bw-money ledger-amt" :class="e.direction">{{ dirSign(e.direction) }}{{ naira(e.amount_minor) }}</span>
              <span class="bw-money bw-muted ledger-bal">{{ naira(e.balance_after_minor) }}</span>
            </li>
            <li v-if="!wallet.entries.length" class="bw-muted empty">No movements yet.</li>
          </ul>
        </template>
        <div v-else class="empty bw-muted">No wallet provisioned for this customer.</div>
      </div>

      <!-- Purchases -->
      <div v-else-if="tab === 'purchases'" class="bw-card flush">
        <div v-if="tabLoading" class="empty bw-muted">Loading…</div>
        <div v-else class="bw-t-wrap">
          <table class="bw-table">
            <thead><tr><th>When</th><th>Meter</th><th>Station</th><th style="text-align:right">Paid</th><th style="text-align:right">Energy</th><th style="text-align:right">VAT</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="p in purchases" :key="p.id">
                <td class="bw-mono bw-muted" style="font-size: var(--t-xs)">{{ shortDate(p.created_at) }}</td>
                <td class="bw-mono">{{ p.meter_id }}</td>
                <td class="bw-mono bw-muted">{{ p.station_id || '—' }}</td>
                <td class="bw-money" style="text-align: right">{{ naira(p.amount_minor) }}</td>
                <td class="bw-money" style="text-align: right">{{ naira(p.energy_amount_minor ?? p.amount_minor) }}</td>
                <td class="bw-money" style="text-align: right">{{ naira(p.vat_amount_minor ?? 0) }}</td>
                <td><span :class="['bw-badge', purchaseBadge(p.status)]">{{ p.status }}</span></td>
              </tr>
              <tr v-if="!purchases.length"><td colspan="7" class="bw-muted empty">No purchases.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Funding -->
      <div v-else-if="tab === 'funding'" class="bw-card flush">
        <div v-if="tabLoading" class="empty bw-muted">Loading…</div>
        <div v-else class="bw-t-wrap">
          <table class="bw-table">
            <thead><tr><th>When</th><th>Reference</th><th>Gateway</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="f in funding" :key="f.id">
                <td class="bw-mono bw-muted" style="font-size: var(--t-xs)">{{ shortDate(f.created_at) }}</td>
                <td class="bw-mono" style="font-size: var(--t-xs)">{{ f.gateway_reference }}</td>
                <td><span class="bw-badge neutral">{{ f.gateway }}</span></td>
                <td class="bw-money" style="text-align: right">{{ naira(f.amount_minor) }}</td>
                <td><span :class="['bw-badge', fundingBadge(f.status)]">{{ f.status }}</span></td>
              </tr>
              <tr v-if="!funding.length"><td colspan="5" class="bw-muted empty">No funding history.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Status confirm -->
    <ConfirmDialog
      v-model:open="statusOpen"
      :title="statusLabel"
      :description="detail ? `Change ${detail.customer.full_name || 'this customer'} → ${statusTarget}. Audit-logged.` : ''"
      :confirm-label="statusLabel"
      :tone="statusTone"
      :loading="statusBusy"
      :disable-confirm="!reasonValid"
      @confirm="doStatus"
    >
      <template v-if="statusTarget !== 'active'">
        <label class="cd-input-label">Reason *</label>
        <textarea v-model="statusReason" rows="3" class="cd-input" placeholder="e.g. Repeated chargeback fraud." />
        <p class="cd-input-hint">Minimum 4 characters.</p>
      </template>
    </ConfirmDialog>

  </AppShell>
</template>

<style scoped>
.back-row { margin-bottom: var(--s-3); }
.bw-banner { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); padding: var(--s-3) var(--s-4); border-radius: var(--r-md); margin-bottom: var(--s-3); font-size: var(--t-sm); border: 1px solid; }
.bw-banner.success { background: oklch(from var(--brand) l c h / 0.08); border-color: oklch(from var(--brand) l c h / 0.30); color: var(--brand); }
.bw-banner.error { background: oklch(from var(--danger) l c h / 0.08); border-color: oklch(from var(--danger) l c h / 0.30); color: var(--danger); }
.bw-banner-x { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 18px; padding: 2px 8px; opacity: 0.7; }
.banner-enter-active, .banner-leave-active { transition: all 0.20s var(--ease-out); }
.banner-enter-from { opacity: 0; transform: translateY(-4px); }
.empty { text-align: center; padding: var(--s-6); }

.head-card { display: flex; justify-content: space-between; align-items: start; gap: var(--s-4); flex-wrap: wrap; margin-bottom: var(--s-3); }
.head-main { display: flex; gap: var(--s-4); align-items: center; }
.avatar { width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, var(--brand-300), var(--brand-600)); display: grid; place-items: center; font-size: 24px; font-weight: 700; color: oklch(8% 0.04 145); flex-shrink: 0; }
.head-name { margin: 0 0 4px; font-size: var(--t-xl); }
.head-meta { font-size: var(--t-sm); color: var(--text-muted); margin: 0 0 var(--s-2); }
.head-badges { display: flex; gap: var(--s-2); flex-wrap: wrap; }
.head-actions { display: flex; gap: var(--s-2); align-items: center; }
.head-action-buttons { display: flex; gap: var(--s-2); align-items: center; }

.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--s-3); margin-bottom: var(--s-3); }
.stat-tile { background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--r-lg); padding: var(--s-4); position: relative; overflow: hidden; backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%); box-shadow: var(--glass-shine), var(--glass-shadow-card); }
.stat-tile.brand { background: linear-gradient(135deg, oklch(from var(--brand) l c h / 0.08), transparent); border-color: oklch(from var(--brand) l c h / 0.25); }
.stat-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 6px; }
.stat-value { font-family: var(--font-mono); font-weight: 700; font-size: var(--t-lg); margin: 0; }
.stat-tile.brand .stat-value { color: var(--brand); }
.stat-sub { font-size: var(--t-xs); color: var(--text-muted); margin: 4px 0 0; }

.tabs { display: flex; gap: var(--s-2); margin-bottom: var(--s-3); border-bottom: 1px solid var(--border); }
.tab { background: transparent; border: none; padding: 10px 16px; color: var(--text-muted); font-weight: 600; font-size: var(--t-sm); cursor: pointer; border-bottom: 2px solid transparent; text-transform: capitalize; }
.tab:hover { color: var(--text); }
.tab.active { color: var(--brand); border-bottom-color: var(--brand); }

.overview-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); margin-bottom: var(--s-4); }
.overview-head h2 { margin: 0; font-size: var(--t-lg); }
.overview-view-toggle { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-2); }
.overview-view-toggle button { width: 36px; height: 34px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--text-muted); cursor: pointer; }
.overview-view-toggle button:hover { color: var(--text); }
.overview-view-toggle button.active { background: var(--brand-glow); color: var(--brand); }
.overview-view-toggle svg { width: 17px; height: 17px; }
.ov-dl { margin: 0; font-size: var(--t-sm); }
.ov-dl--grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--s-5); }
.ov-dl--table .ov-item { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: var(--s-3); }
.ov-item { min-width: 0; padding: var(--s-3) 0; border-bottom: 1px solid var(--border); }
.ov-item dt { color: var(--text-muted); }
.ov-item dd { min-width: 0; margin: 4px 0 0; overflow-wrap: anywhere; }
.ov-dl--table .ov-item dd { margin-top: 0; }

.wallet-head { display: flex; justify-content: space-between; align-items: start; padding: var(--s-4); border-bottom: 1px solid var(--border); }
.wallet-bal { font-family: var(--font-mono); font-weight: 700; font-size: var(--t-2xl); color: var(--brand); margin: 4px 0 6px; }

.ledger-list { list-style: none; margin: 0; padding: var(--s-2) var(--s-4) var(--s-4); }
.ledger-row { display: grid; grid-template-columns: 90px 1fr auto auto; gap: var(--s-3); align-items: center; padding: 8px 0; border-top: 1px solid var(--border); font-size: var(--t-xs); }
.ledger-when { color: var(--text-muted); }
.ledger-type { font-weight: 600; }
.ledger-amt { font-weight: 700; }
.ledger-amt.credit { color: var(--brand); }
.ledger-amt.debit { color: var(--text); }
.ledger-bal { font-size: 10px; }

:deep(.cd-body) .cd-input-label { display: block; font-size: var(--t-xs); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px; }
:deep(.cd-body) .cd-input { width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-md); padding: 10px 12px; color: var(--text); font-size: var(--t-sm); font-family: inherit; resize: vertical; }
:deep(.cd-body) .cd-input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
:deep(.cd-body) .cd-input-hint { font-size: var(--t-xs); color: var(--text-muted); margin: 6px 0 0; }

@media (max-width: 640px) {
  .head-card { flex-direction: column; }
  .head-actions { width: 100%; justify-content: flex-end; }
  .head-action-buttons { display: none; }
  .ov-dl--table .ov-item { grid-template-columns: 110px minmax(0, 1fr); gap: var(--s-3); }
  .ledger-row { grid-template-columns: 1fr auto; }
  .ledger-when, .ledger-bal { grid-column: 1 / -1; opacity: 0.7; }
}
</style>
