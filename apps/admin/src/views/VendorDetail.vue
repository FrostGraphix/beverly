<script setup lang="ts">
/**
 * Vendor detail (admin).
 *
 * Tabs: Overview · Wallet · Transactions · Funding · Staff
 * Actions: approve / freeze / suspend / reactivate (ConfirmDialog + reason, audit-logged).
 *
 * Endpoints:
 *   GET   /api/v1/admin/vendors/:id
 *   GET   /api/v1/admin/vendors/:id/wallet
 *   GET   /api/v1/admin/vendors/:id/transactions
 *   GET   /api/v1/admin/vendors/:id/funding
 *   GET   /api/v1/admin/vendors/:id/staff
 *   PATCH /api/v1/admin/vendors/:id/status
 */
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import MobileActionMenu from '../components/MobileActionMenu.vue';
import { api, naira, shortDate, ApiError } from '../lib/api';
import { useStaffAuthStore } from '../stores/auth';

const route  = useRoute();
const router = useRouter();
const auth = useStaffAuthStore();
const id     = route.params.id as string;
const canManageVendors = computed(() => auth.hasPermission('wallet.vendors.manage'));
const canViewWallets = computed(() => auth.hasPermission('wallet.funding.view'));

type Tab = 'overview' | 'wallet' | 'transactions' | 'funding' | 'staff' | 'analytics';
const tab = ref<Tab>('overview');

const detail     = ref<any>(null);
const loading    = ref(true);
const banner     = ref<{ tone: 'success' | 'error'; text: string } | null>(null);

// Lazy per-tab data
const wallet       = ref<any>(null);
const transactions = ref<any[]>([]);
const funding      = ref<any[]>([]);
const staff        = ref<any[]>([]);
const analytics    = ref<any>(null);
const analyticsPeriod = ref<'7d'|'30d'|'90d'|'all'>('30d');
const tabLoading   = ref(false);

async function loadDetail() {
    loading.value = true;
    try {
        detail.value = await api.get<any>(`/api/v1/admin/vendors/${id}`);
    } catch (e: any) {
        const status = (e as any)?.status ?? (e as any)?.response?.status;
        // If the detail endpoint is 404 (stale backend build), reconstruct from
        // the vendor list which is always available, plus a best-effort wallet call.
        if (status === 404) {
            try {
                const list = await api.get<{ vendors: any[] }>('/api/v1/admin/vendors');
                const vendor = (list.vendors ?? []).find((v: any) => v.id === id);
                if (vendor) {
                    // Hydrate a detail-shaped object so the template renders cleanly.
                    let walletData: any = null;
                    try {
                        walletData = await api.get<any>(`/api/v1/admin/vendors/${id}/wallet`);
                    } catch { /* wallet is optional */ }
                    detail.value = {
                        vendor,
                        wallet: walletData?.wallet ?? null,
                        balance_minor:   walletData?.balance_minor   ?? 0,
                        available_minor: walletData?.available_minor ?? 0,
                        holds_minor:     walletData?.holds_minor     ?? 0,
                        stats: {
                            vendingCount:      0,
                            vendingValueMinor: 0,
                            fundingCount:      0,
                            fundingValueMinor: 0,
                            stationCount:      (vendor.operating_stations ?? []).length,
                        },
                    };
                    banner.value = {
                        tone: 'error',
                        text: 'Detail endpoint unavailable — showing summary data. Restart the backend to restore full view.',
                    };
                    return;
                }
            } catch { /* fall through to original error */ }
        }
        banner.value = { tone: 'error', text: e?.message ?? 'Could not load vendor.' };
    } finally { loading.value = false; }
}

async function switchTab(t: Tab) {
    tab.value = t;
    if (t === 'wallet' && !wallet.value) {
        tabLoading.value = true;
        try { wallet.value = await api.get<any>(`/api/v1/admin/vendors/${id}/wallet`); }
        catch { wallet.value = { entries: [] }; }
        finally { tabLoading.value = false; }
    }
    if (t === 'transactions' && !transactions.value.length) {
        tabLoading.value = true;
        try {
            const r = await api.get<any>(`/api/v1/admin/vendors/${id}/transactions`);
            transactions.value = r.transactions ?? r.purchases ?? [];
        }
        catch { transactions.value = []; }
        finally { tabLoading.value = false; }
    }
    if (t === 'funding' && !funding.value.length) {
        tabLoading.value = true;
        try {
            const r = await api.get<any>(`/api/v1/admin/vendors/${id}/funding`);
            funding.value = r.funding ?? r.items ?? [];
        }
        catch { funding.value = []; }
        finally { tabLoading.value = false; }
    }
    if (t === 'staff' && !staff.value.length) {
        tabLoading.value = true;
        try {
            const r = await api.get<any>(`/api/v1/admin/vendors/${id}/staff`);
            staff.value = r.staff ?? r.users ?? [];
        }
        catch { staff.value = []; }
        finally { tabLoading.value = false; }
    }
    if (t === 'analytics' && !analytics.value) {
        await loadAnalytics();
    }
}

async function loadAnalytics() {
    tabLoading.value = true;
    try {
        analytics.value = await api.get<any>(`/api/v1/admin/vendors/${id}/analytics?period=${analyticsPeriod.value}`);
    } catch { analytics.value = null; }
    finally { tabLoading.value = false; }
}

async function changeAnalyticsPeriod(p: '7d'|'30d'|'90d'|'all') {
    analyticsPeriod.value = p;
    analytics.value = null;
    await loadAnalytics();
}

// ─ Status action ─────────────────────────────────────────────
const statusOpen   = ref(false);
const statusTarget = ref<'approved' | 'frozen' | 'suspended'>('suspended');
const statusReason = ref('');
const statusBusy   = ref(false);

const statusTone = computed<'brand' | 'danger' | 'warn'>(() =>
    statusTarget.value === 'frozen'    ? 'danger'
    : statusTarget.value === 'suspended' ? 'warn'
    : 'brand',
);
const statusLabel = computed(() => ({
    approved:  'Reactivate vendor',
    frozen:    'Freeze vendor',
    suspended: 'Suspend vendor',
}[statusTarget.value]));
const actionRequiresReason = computed(() =>
    statusTarget.value === 'frozen' || statusTarget.value === 'suspended',
);
const reasonValid = computed(() =>
    !actionRequiresReason.value || statusReason.value.trim().length >= 4,
);

function askStatus(next: 'approved' | 'frozen' | 'suspended') {
    if (!canManageVendors.value) return;
    statusTarget.value = next;
    statusReason.value = '';
    statusOpen.value   = true;
}

async function doStatus() {
    if (!reasonValid.value) return;
    statusBusy.value = true;
    banner.value     = null;
    try {
        await api.patch(`/api/v1/admin/vendors/${id}/status`, {
            status: statusTarget.value,
            reason: statusReason.value.trim() || undefined,
        });
        statusOpen.value = false;
        banner.value = { tone: 'success', text: `Vendor → ${statusTarget.value}.` };
        await loadDetail();
    } catch (e: any) {
        const msg = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Update failed.';
        banner.value = { tone: 'error', text: msg };
        statusOpen.value = false;
    } finally { statusBusy.value = false; }
}

// ─ Helpers ───────────────────────────────────────────────────
function vStatusBadge(s: string) {
    return ({ approved: 'success', frozen: 'danger', suspended: 'warn', pending: 'neutral', closed: 'neutral' } as Record<string, string>)[s] ?? 'neutral';
}
function riskBadge(r: string) {
    return ({ high: 'danger', medium: 'warn', low: 'success' } as Record<string, string>)[r] ?? 'neutral';
}
function txBadge(s: string) {
    return ({ delivered: 'success', completed: 'success', token_issued: 'success', failed: 'danger', refunded: 'info' } as Record<string, string>)[s] ?? 'neutral';
}
function fundBadge(s: string) {
    return ({ success: 'success', initiated: 'warn', pending: 'warn', failed: 'danger', abandoned: 'neutral' } as Record<string, string>)[s] ?? 'neutral';
}
function staffBadge(s: string) {
    return ({ active: 'success', suspended: 'warn', inactive: 'neutral' } as Record<string, string>)[s] ?? 'neutral';
}
function dirSign(d: string) { return d === 'credit' ? '+' : '−'; }

// ── Analytics helpers ─────────────────────────────────────────
function barHeight(val: number, maxVal: number): number {
    if (!maxVal) return 0;
    return Math.round((val / maxVal) * 100);
}
function analyticsMaxDaily(daily: any[]): number {
    return Math.max(...(daily ?? []).map((d: any) => d.count), 1);
}
function modePct(count: number, total: number): string {
    return total ? `${Math.round((count / total) * 100)}%` : '0%';
}

onMounted(loadDetail);
</script>

<template>
  <AppShell title="Vendor">

    <div class="back-row">
      <button class="bw-btn sm" @click="router.push('/vendors')">← Vendors</button>
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
          <div class="avatar">{{ (detail.vendor.legal_name ?? '?')[0]?.toUpperCase() }}</div>
          <div>
            <h1 class="head-name">{{ detail.vendor.legal_name }}</h1>
            <p v-if="detail.vendor.trading_name" class="head-trade">Trading as <strong>{{ detail.vendor.trading_name }}</strong></p>
            <p class="head-meta bw-mono">{{ detail.vendor.contact_email }} · {{ detail.vendor.contact_phone }}</p>
            <div class="head-badges">
              <span :class="['bw-badge', vStatusBadge(detail.vendor.status)]">{{ detail.vendor.status }}</span>
              <span :class="['bw-badge', riskBadge(detail.vendor.risk_level)]">{{ detail.vendor.risk_level }} risk</span>
            </div>
          </div>
        </div>
        <div class="head-actions">
          <div class="head-action-buttons">
            <button
              v-if="canManageVendors && detail.vendor.status === 'pending'"
              class="bw-btn primary"
              @click="askStatus('approved')"
            >Approve</button>
            <button
              v-if="canManageVendors && detail.vendor.status === 'approved'"
              class="bw-btn"
              @click="askStatus('suspended')"
            >Suspend</button>
            <button
              v-if="canManageVendors && detail.vendor.status === 'approved'"
              class="bw-btn danger"
              @click="askStatus('frozen')"
            >Freeze</button>
            <button
              v-if="canManageVendors && (detail.vendor.status === 'frozen' || detail.vendor.status === 'suspended')"
              class="bw-btn primary"
              @click="askStatus('approved')"
            >Reactivate</button>
          </div>
          <MobileActionMenu label="Vendor actions">
            <button
              v-if="canManageVendors && detail.vendor.status === 'pending'"
              class="mobile-action-item primary"
              @click="askStatus('approved')"
            >Approve</button>
            <button
              v-if="canManageVendors && detail.vendor.status === 'approved'"
              class="mobile-action-item"
              @click="askStatus('suspended')"
            >Suspend</button>
            <button
              v-if="canManageVendors && detail.vendor.status === 'approved'"
              class="mobile-action-item danger"
              @click="askStatus('frozen')"
            >Freeze</button>
            <button
              v-if="canManageVendors && (detail.vendor.status === 'frozen' || detail.vendor.status === 'suspended')"
              class="mobile-action-item primary"
              @click="askStatus('approved')"
            >Reactivate</button>
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
          <p class="stat-value">{{ naira(detail.stats?.fundingValueMinor ?? 0) }}</p>
          <p class="stat-sub">{{ detail.stats?.fundingCount ?? 0 }} top-ups</p>
        </div>
        <div class="stat-tile">
          <p class="stat-label">Total vended</p>
          <p class="stat-value">{{ naira(detail.stats?.vendingValueMinor ?? 0) }}</p>
          <p class="stat-sub">{{ detail.stats?.vendingCount ?? 0 }} transactions</p>
        </div>
        <div class="stat-tile">
          <p class="stat-label">Assigned stations</p>
          <p class="stat-value">{{ detail.stats?.stationCount ?? '—' }}</p>
          <p class="stat-sub">distribution points</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button
          v-for="t in (['overview','wallet','transactions','funding','staff','analytics'] as const)"
          :key="t"
          :class="['tab', { active: tab === t }]"
          @click="switchTab(t)"
        >{{ t }}</button>
      </div>

      <!-- ── Overview ────────────────────────────────────────── -->
      <div v-if="tab === 'overview'" class="bw-card">
        <dl class="ov-dl">
          <dt>Vendor ID</dt>        <dd class="bw-mono">{{ detail.vendor.id }}</dd>
          <dt>Legal name</dt>       <dd>{{ detail.vendor.legal_name }}</dd>
          <dt>Trading name</dt>     <dd>{{ detail.vendor.trading_name || '—' }}</dd>
          <dt>Contact email</dt>    <dd class="bw-mono">{{ detail.vendor.contact_email }}</dd>
          <dt>Contact phone</dt>    <dd class="bw-mono">{{ detail.vendor.contact_phone }}</dd>
          <dt>Risk level</dt>
          <dd><span :class="['bw-badge', riskBadge(detail.vendor.risk_level)]">{{ detail.vendor.risk_level }}</span></dd>
          <dt>Status</dt>
          <dd><span :class="['bw-badge', vStatusBadge(detail.vendor.status)]">{{ detail.vendor.status }}</span></dd>
          <dt>Approved at</dt>      <dd>{{ detail.vendor.approved_at ? new Date(detail.vendor.approved_at).toLocaleString() : '—' }}</dd>
          <dt>Registered</dt>       <dd>{{ new Date(detail.vendor.created_at).toLocaleString() }}</dd>
          <template v-if="detail.vendor.rc_number">
            <dt>RC number</dt>      <dd class="bw-mono">{{ detail.vendor.rc_number }}</dd>
          </template>
          <template v-if="detail.vendor.nin">
            <dt>NIN</dt>            <dd class="bw-mono">{{ detail.vendor.nin }}</dd>
          </template>
          <template v-if="detail.vendor.address">
            <dt>Address</dt>        <dd>{{ detail.vendor.address }}</dd>
          </template>
          <template v-if="detail.vendor.lga">
            <dt>LGA / State</dt>    <dd>{{ detail.vendor.lga }}{{ detail.vendor.state ? ', ' + detail.vendor.state : '' }}</dd>
          </template>
          <template v-if="detail.vendor.station_id">
            <dt>Station</dt>        <dd class="bw-mono">{{ detail.vendor.station_id }}</dd>
          </template>
          <template v-if="detail.vendor.bank_name">
            <dt>Bank</dt>           <dd>{{ detail.vendor.bank_name }}</dd>
            <dt>Account</dt>        <dd class="bw-mono">{{ detail.vendor.account_number }} · {{ detail.vendor.account_name }}</dd>
          </template>
        </dl>
      </div>

      <!-- ── Wallet ─────────────────────────────────────────── -->
      <div v-else-if="tab === 'wallet'" class="bw-card flush">
        <div v-if="tabLoading" class="empty bw-muted">Loading…</div>
        <template v-else-if="wallet">
          <div class="wallet-head">
            <div>
              <p class="stat-label">Balance</p>
              <p class="wallet-bal">{{ naira(wallet.balance_minor) }}</p>
              <p class="stat-sub">Available {{ naira(wallet.available_minor) }} · Holds {{ naira(wallet.holds_minor) }}</p>
            </div>
            <router-link v-if="canViewWallets" to="/wallets" class="bw-btn sm" style="text-decoration: none">All wallets →</router-link>
          </div>
          <ul class="ledger-list">
            <li v-for="e in wallet.entries" :key="e.id" class="ledger-row">
              <span class="bw-mono ledger-when">{{ shortDate(e.created_at) }}</span>
              <span class="bw-mono ledger-type">{{ (e.entry_type ?? e.type ?? '').replace(/_/g, ' ') }}</span>
              <span class="bw-money ledger-amt" :class="e.direction">{{ dirSign(e.direction) }}{{ naira(e.amount_minor) }}</span>
              <span class="bw-money bw-muted ledger-bal">{{ naira(e.balance_after_minor) }}</span>
            </li>
            <li v-if="!wallet.entries?.length" class="bw-muted empty">No wallet movements yet.</li>
          </ul>
        </template>
        <div v-else class="empty bw-muted">No wallet provisioned for this vendor.</div>
      </div>

      <!-- ── Transactions ───────────────────────────────────── -->
      <div v-else-if="tab === 'transactions'" class="bw-card flush">
        <div v-if="tabLoading" class="empty bw-muted">Loading…</div>
        <div v-else class="bw-t-wrap">
          <table class="bw-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Meter</th>
                <th>Station</th>
                <th style="text-align:right">Paid</th>
                <th style="text-align:right">Energy</th>
                <th style="text-align:right">VAT</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in transactions" :key="tx.id">
                <td class="bw-mono bw-muted" style="font-size: var(--t-xs)">{{ shortDate(tx.created_at) }}</td>
                <td class="bw-mono">{{ tx.meter_id ?? tx.meter_number ?? '—' }}</td>
                <td class="bw-mono bw-muted">{{ tx.station_id ?? tx.station ?? '—' }}</td>
                <td class="bw-money" style="text-align:right">{{ naira(tx.amount_minor ?? tx.amount) }}</td>
                <td class="bw-money" style="text-align:right">{{ naira(tx.energy_amount_minor ?? tx.amount_minor ?? tx.amount) }}</td>
                <td class="bw-money" style="text-align:right">{{ naira(tx.vat_amount_minor ?? 0) }}</td>
                <td><span :class="['bw-badge', txBadge(tx.status)]">{{ tx.status }}</span></td>
              </tr>
              <tr v-if="!transactions.length">
                <td colspan="7" class="bw-muted empty">No transactions yet.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Funding ────────────────────────────────────────── -->
      <div v-else-if="tab === 'funding'" class="bw-card flush">
        <div v-if="tabLoading" class="empty bw-muted">Loading…</div>
        <div v-else class="bw-t-wrap">
          <table class="bw-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Reference</th>
                <th>Gateway</th>
                <th style="text-align:right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in funding" :key="f.id">
                <td class="bw-mono bw-muted" style="font-size: var(--t-xs)">{{ shortDate(f.created_at) }}</td>
                <td class="bw-mono" style="font-size: var(--t-xs)">{{ f.gateway_reference ?? f.reference ?? '—' }}</td>
                <td><span class="bw-badge neutral">{{ f.gateway ?? f.channel ?? '—' }}</span></td>
                <td class="bw-money" style="text-align:right">{{ naira(f.amount_minor ?? f.amount) }}</td>
                <td><span :class="['bw-badge', fundBadge(f.status)]">{{ f.status }}</span></td>
              </tr>
              <tr v-if="!funding.length">
                <td colspan="5" class="bw-muted empty">No funding history.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Staff ──────────────────────────────────────────── -->
      <div v-else-if="tab === 'staff'" class="bw-card flush">
        <div v-if="tabLoading" class="empty bw-muted">Loading…</div>
        <div v-else class="bw-t-wrap">
          <table class="bw-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in staff" :key="u.id">
                <td style="font-weight: 600">{{ u.full_name ?? u.name ?? '—' }}</td>
                <td class="bw-mono" style="font-size: var(--t-xs)">{{ u.email ?? u.username ?? '—' }}</td>
                <td><span class="bw-badge neutral">{{ u.role ?? u.role_key ?? 'vendor' }}</span></td>
                <td><span :class="['bw-badge', staffBadge(u.status ?? 'active')]">{{ u.status ?? 'active' }}</span></td>
                <td class="bw-mono bw-muted" style="font-size: var(--t-xs)">{{ shortDate(u.created_at) }}</td>
              </tr>
              <tr v-if="!staff.length">
                <td colspan="5" class="bw-muted empty">No staff accounts found.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Analytics ────────────────────────────────────── -->
      <div v-else-if="tab === 'analytics'">
        <!-- Period selector -->
        <div class="an-period-row">
          <span class="an-period-label">Period</span>
          <div class="an-period-pills">
            <button
              v-for="p in (['7d','30d','90d','all'] as const)"
              :key="p"
              :class="['an-pill', { active: analyticsPeriod === p }]"
              @click="changeAnalyticsPeriod(p)"
            >{{ p === 'all' ? 'All time' : p }}</button>
          </div>
        </div>

        <div v-if="tabLoading" class="bw-card empty bw-muted">Loading…</div>

        <template v-else-if="analytics">
          <!-- KPI cards -->
          <div class="an-kpi-grid">
            <div class="an-kpi brand">
              <p class="an-kpi-label">Total revenue</p>
              <p class="an-kpi-value">{{ naira(analytics.summary.total_amount_minor) }}</p>
              <p class="an-kpi-sub">{{ analytics.summary.total }} transactions</p>
            </div>
            <div class="an-kpi">
              <p class="an-kpi-label">Success rate</p>
              <p class="an-kpi-value">{{ analytics.summary.success_rate }}%</p>
              <p class="an-kpi-sub">{{ analytics.summary.delivered }} delivered · {{ analytics.summary.failed }} failed</p>
            </div>
            <div class="an-kpi">
              <p class="an-kpi-label">Avg transaction</p>
              <p class="an-kpi-value">{{ naira(analytics.summary.avg_amount_minor) }}</p>
              <p class="an-kpi-sub">per purchase order</p>
            </div>
            <div class="an-kpi">
              <p class="an-kpi-label">Total kWh vended</p>
              <p class="an-kpi-value">{{ analytics.summary.total_units_kwh.toLocaleString() }}</p>
              <p class="an-kpi-sub">kilowatt-hours delivered</p>
            </div>
          </div>

          <!-- Daily volume chart -->
          <div class="bw-card an-chart-card" v-if="analytics.daily?.length">
            <p class="an-section-title">Daily transaction volume</p>
            <div class="an-chart-scroll">
              <div class="an-chart">
                <div
                  v-for="day in analytics.daily"
                  :key="day.date"
                  class="an-bar-group"
                  :title="`${day.date}: ${day.count} orders · ${naira(day.amount_minor)}`"
                >
                  <div class="an-bar-wrap">
                    <div
                      class="an-bar delivered"
                      :style="{ height: barHeight(day.delivered, analyticsMaxDaily(analytics.daily)) + '%' }"
                    ></div>
                    <div
                      class="an-bar failed"
                      :style="{ height: barHeight(day.failed, analyticsMaxDaily(analytics.daily)) + '%' }"
                    ></div>
                  </div>
                  <span class="an-bar-date">{{ day.date.slice(5) }}</span>
                </div>
              </div>
            </div>
            <div class="an-legend">
              <span class="an-legend-dot delivered"></span><span>Delivered</span>
              <span class="an-legend-dot failed"></span><span>Failed</span>
            </div>
          </div>
          <div class="bw-card empty bw-muted" v-else>No transaction data for this period.</div>

          <!-- Mode breakdown + Top stations side by side -->
          <div class="an-two-col">
            <!-- By mode -->
            <div class="bw-card">
              <p class="an-section-title">By purchase mode</p>
              <div class="an-mode-list">
                <div
                  v-for="(v, mode) in analytics.by_mode"
                  :key="mode"
                  class="an-mode-row"
                >
                  <div class="an-mode-info">
                    <span class="an-mode-name">{{ String(mode).replace(/_/g, ' ') }}</span>
                    <span class="an-mode-count">{{ v.count }} orders</span>
                  </div>
                  <div class="an-mode-bar-wrap">
                    <div
                      class="an-mode-bar"
                      :style="{ width: modePct(v.count, analytics.summary.total) }"
                    ></div>
                  </div>
                  <span class="an-mode-amt">{{ naira(v.amount_minor) }}</span>
                </div>
                <p v-if="!Object.keys(analytics.by_mode ?? {}).length" class="bw-muted" style="font-size:var(--t-sm)">No data.</p>
              </div>
            </div>

            <!-- Top stations -->
            <div class="bw-card flush">
              <p class="an-section-title" style="padding: var(--s-4) var(--s-4) 0">Top stations</p>
              <table class="bw-table">
                <thead>
                  <tr>
                    <th>Station</th>
                    <th style="text-align:right">Orders</th>
                    <th style="text-align:right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in analytics.top_stations" :key="s.station_id">
                    <td class="bw-mono" style="font-size:var(--t-xs)">{{ s.station_id }}</td>
                    <td style="text-align:right">{{ s.count }}</td>
                    <td class="bw-money" style="text-align:right">{{ naira(s.amount_minor) }}</td>
                  </tr>
                  <tr v-if="!analytics.top_stations?.length">
                    <td colspan="3" class="bw-muted empty">No station data.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Top meters -->
          <div class="bw-card flush">
            <p class="an-section-title" style="padding: var(--s-4) var(--s-4) 0">Top meters</p>
            <table class="bw-table">
              <thead>
                <tr>
                  <th>Meter ID</th>
                  <th style="text-align:right">Orders</th>
                  <th style="text-align:right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in analytics.top_meters" :key="m.meter_id">
                  <td class="bw-mono">{{ m.meter_id }}</td>
                  <td style="text-align:right">{{ m.count }}</td>
                  <td class="bw-money" style="text-align:right">{{ naira(m.amount_minor) }}</td>
                </tr>
                <tr v-if="!analytics.top_meters?.length">
                  <td colspan="3" class="bw-muted empty">No meter data.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <div v-else class="bw-card empty bw-muted">Analytics unavailable.</div>
      </div>

    </template>

    <!-- Status confirm -->
    <ConfirmDialog
      v-model:open="statusOpen"
      :title="statusLabel"
      :description="detail ? `Change ${detail.vendor.legal_name} → ${statusTarget}. This is audit-logged.` : ''"
      :confirm-label="statusLabel"
      :tone="statusTone"
      :loading="statusBusy"
      :disable-confirm="!reasonValid"
      @confirm="doStatus"
    >
      <template v-if="actionRequiresReason">
        <label class="cd-input-label">Reason (visible to vendor) *</label>
        <textarea
          v-model="statusReason"
          rows="3"
          class="cd-input"
          placeholder="e.g. Suspected fraud — under investigation."
        />
        <p class="cd-input-hint">Minimum 4 characters.</p>
      </template>
    </ConfirmDialog>

  </AppShell>
</template>

<style scoped>
.back-row { margin-bottom: var(--s-3); }

.bw-banner {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--s-3); padding: var(--s-3) var(--s-4);
  border-radius: var(--r-md); margin-bottom: var(--s-3);
  font-size: var(--t-sm); border: 1px solid;
}
.bw-banner.success { background: oklch(from var(--brand) l c h / 0.08); border-color: oklch(from var(--brand) l c h / 0.30); color: var(--brand); }
.bw-banner.error   { background: oklch(from var(--danger) l c h / 0.08); border-color: oklch(from var(--danger) l c h / 0.30); color: var(--danger); }
.bw-banner-x { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 18px; padding: 2px 8px; opacity: 0.7; }
.bw-banner-x:hover { opacity: 1; }
.banner-enter-active, .banner-leave-active { transition: all 0.20s var(--ease-out); }
.banner-enter-from { opacity: 0; transform: translateY(-4px); }
.banner-leave-to   { opacity: 0; }

.empty { text-align: center; padding: var(--s-6); }

/* ── Header card ── */
.head-card { display: flex; justify-content: space-between; align-items: start; gap: var(--s-4); flex-wrap: wrap; margin-bottom: var(--s-3); }
.head-main { display: flex; gap: var(--s-4); align-items: center; }
.avatar {
  width: 56px; height: 56px; border-radius: 12px;
  background: linear-gradient(135deg, var(--brand-300), var(--brand-600));
  display: grid; place-items: center;
  font-size: 24px; font-weight: 700; color: oklch(8% 0.04 145); flex-shrink: 0;
}
.head-name  { margin: 0 0 2px; font-size: var(--t-xl); }
.head-trade { margin: 0 0 4px; font-size: var(--t-sm); color: var(--text-muted); }
.head-meta  { font-size: var(--t-sm); color: var(--text-muted); margin: 0 0 var(--s-2); }
.head-badges { display: flex; gap: var(--s-2); flex-wrap: wrap; }
.head-actions { display: flex; gap: var(--s-2); align-items: center; }
.head-action-buttons { display: flex; gap: var(--s-2); align-items: center; }

/* ── Stat tiles ── */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--s-3); margin-bottom: var(--s-3); }
.stat-tile { background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--r-lg); padding: var(--s-4); backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%); box-shadow: var(--glass-shine), var(--glass-shadow-card); }
.stat-tile.brand { background: linear-gradient(135deg, oklch(from var(--brand) l c h / 0.08), transparent); border-color: oklch(from var(--brand) l c h / 0.25); }
.stat-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 6px; }
.stat-value { font-family: var(--font-mono); font-weight: 700; font-size: var(--t-lg); margin: 0; }
.stat-tile.brand .stat-value { color: var(--brand); }
.stat-sub { font-size: var(--t-xs); color: var(--text-muted); margin: 4px 0 0; }

/* ── Tabs ── */
.tabs { display: flex; gap: var(--s-2); margin-bottom: var(--s-3); border-bottom: 1px solid var(--border); }
.tab { background: transparent; border: none; padding: 10px 16px; color: var(--text-muted); font-weight: 600; font-size: var(--t-sm); cursor: pointer; border-bottom: 2px solid transparent; text-transform: capitalize; }
.tab:hover  { color: var(--text); }
.tab.active { color: var(--brand); border-bottom-color: var(--brand); }

/* ── Overview dl ── */
.ov-dl { display: grid; grid-template-columns: 160px 1fr; gap: 8px var(--s-3); margin: 0; font-size: var(--t-sm); }
.ov-dl dt { color: var(--text-muted); }
.ov-dl dd { margin: 0; word-break: break-word; }

/* ── Wallet ── */
.wallet-head { display: flex; justify-content: space-between; align-items: start; padding: var(--s-4); border-bottom: 1px solid var(--border); }
.wallet-bal  { font-family: var(--font-mono); font-weight: 700; font-size: var(--t-2xl); color: var(--brand); margin: 4px 0 6px; }

.ledger-list { list-style: none; margin: 0; padding: var(--s-2) var(--s-4) var(--s-4); }
.ledger-row  { display: grid; grid-template-columns: 90px 1fr auto auto; gap: var(--s-3); align-items: center; padding: 8px 0; border-top: 1px solid var(--border); font-size: var(--t-xs); }
.ledger-when { color: var(--text-muted); }
.ledger-type { font-weight: 600; }
.ledger-amt  { font-weight: 700; }
.ledger-amt.credit { color: var(--brand); }
.ledger-amt.debit  { color: var(--text); }
.ledger-bal  { font-size: 10px; }

/* ── ConfirmDialog inputs ── */
:deep(.cd-body) .cd-input-label { display: block; font-size: var(--t-xs); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px; }
:deep(.cd-body) .cd-input { width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-md); padding: 10px 12px; color: var(--text); font-size: var(--t-sm); font-family: inherit; resize: vertical; min-height: 80px; }
:deep(.cd-body) .cd-input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
:deep(.cd-body) .cd-input-hint { font-size: var(--t-xs); color: var(--text-muted); margin: 6px 0 0; }

/* ── Analytics ── */
.an-period-row   { display: flex; align-items: center; gap: var(--s-3); margin-bottom: var(--s-3); }
.an-period-label { font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.an-period-pills { display: flex; gap: var(--s-1); background: var(--surface-2); border-radius: var(--r-full); padding: 3px; border: 1px solid var(--border); }
.an-pill         { background: transparent; border: none; border-radius: var(--r-full); padding: 4px 14px; font-size: var(--t-xs); font-weight: 600; color: var(--text-muted); cursor: pointer; }
.an-pill:hover   { color: var(--text); }
.an-pill.active  { background: var(--surface); color: var(--brand); box-shadow: 0 1px 4px oklch(0 0 0 / 0.12); }

.an-kpi-grid  { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--s-3); margin-bottom: var(--s-3); }
.an-kpi       { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: var(--s-4); }
.an-kpi.brand { background: linear-gradient(135deg, oklch(from var(--brand) l c h / 0.08), transparent); border-color: oklch(from var(--brand) l c h / 0.25); }
.an-kpi-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 6px; }
.an-kpi-value { font-family: var(--font-mono); font-weight: 700; font-size: var(--t-lg); margin: 0; }
.an-kpi.brand .an-kpi-value { color: var(--brand); }
.an-kpi-sub   { font-size: var(--t-xs); color: var(--text-muted); margin: 4px 0 0; }

.an-section-title { font-size: var(--t-xs); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 var(--s-3); }

.an-chart-card { margin-bottom: var(--s-3); }
.an-chart-scroll { overflow-x: auto; }
.an-chart     { display: flex; align-items: flex-end; gap: 3px; height: 120px; min-width: max-content; padding-bottom: 24px; position: relative; }
.an-bar-group { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 0 0 auto; }
.an-bar-wrap  { display: flex; align-items: flex-end; gap: 1px; height: 100px; }
.an-bar       { width: 10px; border-radius: 2px 2px 0 0; transition: height 0.25s var(--ease-out); min-height: 2px; }
.an-bar.delivered { background: var(--brand); }
.an-bar.failed    { background: var(--danger); opacity: 0.7; }
.an-bar-date  { font-size: 9px; color: var(--text-muted); font-family: var(--font-mono); white-space: nowrap; }
.an-legend    { display: flex; gap: var(--s-4); margin-top: var(--s-2); font-size: var(--t-xs); color: var(--text-muted); align-items: center; }
.an-legend-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.an-legend-dot.delivered { background: var(--brand); }
.an-legend-dot.failed    { background: var(--danger); opacity: 0.7; }

.an-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); margin-bottom: var(--s-3); }

.an-mode-list { display: flex; flex-direction: column; gap: var(--s-2); }
.an-mode-row  { display: flex; flex-direction: column; gap: 4px; }
.an-mode-info { display: flex; justify-content: space-between; font-size: var(--t-xs); }
.an-mode-name { font-weight: 600; text-transform: capitalize; }
.an-mode-count { color: var(--text-muted); }
.an-mode-bar-wrap { background: var(--surface-2); border-radius: var(--r-full); height: 6px; overflow: hidden; }
.an-mode-bar  { background: var(--brand); height: 100%; border-radius: var(--r-full); transition: width 0.4s var(--ease-out); min-width: 4px; }
.an-mode-amt  { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--text-muted); text-align: right; }

@media (max-width: 640px) {
  .head-card   { flex-direction: column; }
  .head-actions { width: 100%; justify-content: flex-end; }
  .head-action-buttons { display: none; }
  .ov-dl       { grid-template-columns: 1fr; }
  .ov-dl dt    { font-weight: 700; margin-top: var(--s-2); }
  .ledger-row  { grid-template-columns: 1fr auto; }
  .ledger-when, .ledger-bal { grid-column: 1 / -1; opacity: 0.7; }
  .tabs        { overflow-x: auto; }
  .an-two-col  { grid-template-columns: 1fr; }
}
</style>
