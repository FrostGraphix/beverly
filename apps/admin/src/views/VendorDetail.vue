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
import { api, naira, shortDate, ApiError } from '../lib/api';

const route  = useRoute();
const router = useRouter();
const id     = route.params.id as string;

type Tab = 'overview' | 'wallet' | 'transactions' | 'funding' | 'staff';
const tab = ref<Tab>('overview');

const detail     = ref<any>(null);
const loading    = ref(true);
const banner     = ref<{ tone: 'success' | 'error'; text: string } | null>(null);

// Lazy per-tab data
const wallet       = ref<any>(null);
const transactions = ref<any[]>([]);
const funding      = ref<any[]>([]);
const staff        = ref<any[]>([]);
const tabLoading   = ref(false);

async function loadDetail() {
    loading.value = true;
    try {
        detail.value = await api.get<any>(`/api/v1/admin/vendors/${id}`);
    } catch (e: any) {
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
          <button
            v-if="detail.vendor.status === 'pending'"
            class="bw-btn primary"
            @click="askStatus('approved')"
          >Approve</button>
          <button
            v-if="detail.vendor.status === 'approved'"
            class="bw-btn"
            @click="askStatus('suspended')"
          >Suspend</button>
          <button
            v-if="detail.vendor.status === 'approved'"
            class="bw-btn danger"
            @click="askStatus('frozen')"
          >Freeze</button>
          <button
            v-if="detail.vendor.status === 'frozen' || detail.vendor.status === 'suspended'"
            class="bw-btn primary"
            @click="askStatus('approved')"
          >Reactivate</button>
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
          v-for="t in (['overview','wallet','transactions','funding','staff'] as const)"
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
            <router-link to="/wallets" class="bw-btn sm" style="text-decoration: none">All wallets →</router-link>
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
                <th style="text-align:right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in transactions" :key="tx.id">
                <td class="bw-mono bw-muted" style="font-size: var(--t-xs)">{{ shortDate(tx.created_at) }}</td>
                <td class="bw-mono">{{ tx.meter_id ?? tx.meter_number ?? '—' }}</td>
                <td class="bw-mono bw-muted">{{ tx.station_id ?? tx.station ?? '—' }}</td>
                <td class="bw-money" style="text-align:right">{{ naira(tx.amount_minor ?? tx.amount) }}</td>
                <td><span :class="['bw-badge', txBadge(tx.status)]">{{ tx.status }}</span></td>
              </tr>
              <tr v-if="!transactions.length">
                <td colspan="5" class="bw-muted empty">No transactions yet.</td>
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
  font-size: 24px; font-weight: 700; color: white; flex-shrink: 0;
}
.head-name  { margin: 0 0 2px; font-size: var(--t-xl); }
.head-trade { margin: 0 0 4px; font-size: var(--t-sm); color: var(--text-muted); }
.head-meta  { font-size: var(--t-sm); color: var(--text-muted); margin: 0 0 var(--s-2); }
.head-badges { display: flex; gap: var(--s-2); flex-wrap: wrap; }
.head-actions { display: flex; gap: var(--s-2); align-items: center; }

/* ── Stat tiles ── */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--s-3); margin-bottom: var(--s-3); }
.stat-tile { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: var(--s-4); }
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

@media (max-width: 640px) {
  .head-card   { flex-direction: column; }
  .ov-dl       { grid-template-columns: 1fr; }
  .ov-dl dt    { font-weight: 700; margin-top: var(--s-2); }
  .ledger-row  { grid-template-columns: 1fr auto; }
  .ledger-when, .ledger-bal { grid-column: 1 / -1; opacity: 0.7; }
  .tabs        { overflow-x: auto; }
}
</style>
