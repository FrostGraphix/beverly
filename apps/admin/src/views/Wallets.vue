<script setup lang="ts">
/**
 * Wallets admin view (super-admin).
 *
 * KPI strip + filterable list + click-to-drawer with:
 *   • Owner block (vendor org or customer profile)
 *   • Computed balance / holds / available
 *   • Ledger history (paginated)
 *   • Freeze/unfreeze (ConfirmDialog + reason)
 *   • Daily / monthly cap edit (ConfirmDialog + reason)
 *
 * Endpoints:
 *   GET    /api/v1/admin/wallets[?ownerType,status,q,minBalance,maxBalance,cursor]
 *   GET    /api/v1/admin/wallets/summary
 *   GET    /api/v1/admin/wallets/:id
 *   GET    /api/v1/admin/wallets/:id/ledger?limit&cursor
 *   PATCH  /api/v1/admin/wallets/:id/status   body: { status, reason? }
 *   PATCH  /api/v1/admin/wallets/:id/limits   body: { dailyCapMinor?, monthlyCapMinor?, reason }
 */
import { onMounted, ref, computed, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { api, naira, shortDate, ApiError } from '../lib/api';
import { exportCsv, printPdf } from '../lib/export';

interface Wallet {
    id: string;
    owner_type: 'vendor' | 'customer';
    owner_id: string;
    currency: string;
    status: 'active' | 'frozen' | 'closed';
    daily_debit_cap_minor: number | null;
    monthly_debit_cap_minor: number | null;
    created_at: string;
    balance_minor: number;
    holds_minor: number;
    available_minor: number;
    owner_name: string | null;
    owner_phone: string | null;
    owner_email: string | null;
}

interface WalletSummary {
    walletCount: number;
    totalFloatMinor: number;
    totalHoldsMinor: number;
    vendorFloatMinor: number;
    customerFloatMinor: number;
    byStatus: Record<string, number>;
    byOwnerType: Record<string, number>;
}

interface LedgerEntry {
    id: string;
    direction: 'debit' | 'credit';
    entry_type: string;
    amount_minor: number;
    balance_after_minor: number;
    memo: string | null;
    created_at: string;
}

// ─ List + filters ─────────────────────────────────────────────
const summary = ref<WalletSummary | null>(null);
const wallets = ref<Wallet[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const banner = ref<{ tone: 'success' | 'error'; text: string } | null>(null);

const fOwnerType = ref<'' | 'vendor' | 'customer'>('');
const fStatus    = ref<'' | 'active' | 'frozen' | 'closed'>('');
const fQ         = ref('');
const fMinBal    = ref<number | ''>('');
const fMaxBal    = ref<number | ''>('');

async function loadSummary() {
    try { summary.value = await api.get<WalletSummary>('/api/v1/admin/wallets/summary'); }
    catch { /* silent — summary is supplementary */ }
}

async function loadList(reset = true) {
    loading.value = true;
    try {
        const p = new URLSearchParams();
        if (fOwnerType.value) p.set('ownerType', fOwnerType.value);
        if (fStatus.value)    p.set('status',    fStatus.value);
        if (fQ.value)         p.set('q',         fQ.value);
        if (fMinBal.value !== '') p.set('minBalance', String(Math.round(Number(fMinBal.value) * 100)));
        if (fMaxBal.value !== '') p.set('maxBalance', String(Math.round(Number(fMaxBal.value) * 100)));
        p.set('limit', '100');
        if (!reset && cursor.value) p.set('cursor', cursor.value);
        const r = await api.get<{ wallets: Wallet[]; nextCursor: string | null }>(
            `/api/v1/admin/wallets?${p}`,
        );
        wallets.value = reset ? r.wallets : [...wallets.value, ...r.wallets];
        cursor.value = r.nextCursor;
    } catch (e: any) {
        banner.value = { tone: 'error', text: e?.message ?? 'Could not load wallets.' };
    } finally { loading.value = false; }
}

function resetFilters() {
    fOwnerType.value = '';
    fStatus.value = '';
    fQ.value = '';
    fMinBal.value = '';
    fMaxBal.value = '';
    void loadList();
}

// ─ Detail drawer ──────────────────────────────────────────────
const detail = ref<{ wallet: Wallet; owner: any; balance_minor: number; holds_minor: number; available_minor: number } | null>(null);
const ledger = ref<LedgerEntry[]>([]);
const ledgerCursor = ref<string | null>(null);
const ledgerLoading = ref(false);

async function openDetail(w: Wallet) {
    try {
        const [d, l] = await Promise.all([
            api.get<typeof detail.value>(`/api/v1/admin/wallets/${w.id}`),
            api.get<{ entries: LedgerEntry[] }>(`/api/v1/admin/wallets/${w.id}/ledger?limit=50`),
        ]);
        detail.value = d;
        ledger.value = l.entries;
        ledgerCursor.value = l.entries.length ? l.entries[l.entries.length - 1].created_at : null;
    } catch (e: any) {
        banner.value = { tone: 'error', text: e?.message ?? 'Could not load wallet detail.' };
    }
}

async function loadMoreLedger() {
    if (!detail.value || !ledgerCursor.value) return;
    ledgerLoading.value = true;
    try {
        const r = await api.get<{ entries: LedgerEntry[] }>(
            `/api/v1/admin/wallets/${detail.value.wallet.id}/ledger?limit=50&cursor=${encodeURIComponent(ledgerCursor.value)}`,
        );
        ledger.value = [...ledger.value, ...r.entries];
        ledgerCursor.value = r.entries.length ? r.entries[r.entries.length - 1].created_at : null;
    } finally { ledgerLoading.value = false; }
}

function closeDetail() {
    detail.value = null;
    ledger.value = [];
    ledgerCursor.value = null;
}

// ─ Freeze / unfreeze ─────────────────────────────────────────
const statusOpen = ref(false);
const statusTarget = ref<'active' | 'frozen' | 'closed'>('frozen');
const statusReason = ref('');
const statusBusy = ref(false);

const statusTone = computed<'brand' | 'danger' | 'warn'>(() =>
    statusTarget.value === 'frozen' ? 'warn'
        : statusTarget.value === 'closed' ? 'danger'
            : 'brand',
);

const statusLabel = computed(() => ({
    active: 'Reactivate wallet',
    frozen: 'Freeze wallet',
    closed: 'Close wallet',
}[statusTarget.value]));

const statusReasonValid = computed(() =>
    statusTarget.value === 'active' || statusReason.value.trim().length >= 4,
);

function askStatus(next: 'active' | 'frozen' | 'closed') {
    statusTarget.value = next;
    statusReason.value = '';
    statusOpen.value = true;
}

async function doStatus() {
    if (!detail.value || !statusReasonValid.value) return;
    statusBusy.value = true;
    banner.value = null;
    try {
        const body: Record<string, unknown> = { status: statusTarget.value };
        if (statusReason.value.trim()) body.reason = statusReason.value.trim();
        await api.patch(`/api/v1/admin/wallets/${detail.value.wallet.id}/status`, body);
        statusOpen.value = false;
        banner.value = { tone: 'success', text: `Wallet → ${statusTarget.value}.` };
        await Promise.all([loadList(), loadSummary(), openDetail(detail.value.wallet)]);
    } catch (e: any) {
        const msg = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Update failed.';
        banner.value = { tone: 'error', text: msg };
        statusOpen.value = false;
    } finally {
        statusBusy.value = false;
    }
}

// ─ Limit edit ────────────────────────────────────────────────
const limitsOpen = ref(false);
const limitDailyNaira = ref<number | ''>('');
const limitMonthlyNaira = ref<number | ''>('');
const limitReason = ref('');
const limitsBusy = ref(false);

const limitsValid = computed(() =>
    limitReason.value.trim().length >= 4 &&
    (limitDailyNaira.value !== '' || limitMonthlyNaira.value !== ''),
);

function askLimits() {
    if (!detail.value) return;
    limitDailyNaira.value = detail.value.wallet.daily_debit_cap_minor != null
        ? Math.round(detail.value.wallet.daily_debit_cap_minor / 100) : '';
    limitMonthlyNaira.value = detail.value.wallet.monthly_debit_cap_minor != null
        ? Math.round(detail.value.wallet.monthly_debit_cap_minor / 100) : '';
    limitReason.value = '';
    limitsOpen.value = true;
}

async function doLimits() {
    if (!detail.value || !limitsValid.value) return;
    limitsBusy.value = true;
    banner.value = null;
    try {
        const body: Record<string, unknown> = { reason: limitReason.value.trim() };
        if (limitDailyNaira.value !== '')   body.dailyCapMinor   = Math.round(Number(limitDailyNaira.value) * 100);
        if (limitMonthlyNaira.value !== '') body.monthlyCapMinor = Math.round(Number(limitMonthlyNaira.value) * 100);
        await api.patch(`/api/v1/admin/wallets/${detail.value.wallet.id}/limits`, body);
        limitsOpen.value = false;
        banner.value = { tone: 'success', text: 'Limits updated.' };
        await Promise.all([loadList(), openDetail(detail.value.wallet)]);
    } catch (e: any) {
        const msg = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Update failed.';
        banner.value = { tone: 'error', text: msg };
        limitsOpen.value = false;
    } finally {
        limitsBusy.value = false;
    }
}

// ─ Helpers ───────────────────────────────────────────────────
function statusBadge(s: string) {
    return ({ active: 'success', frozen: 'warn', closed: 'danger' } as Record<string, string>)[s] ?? 'neutral';
}

function ownerBadge(t: string) {
    return t === 'vendor' ? 'info' : 'neutral';
}

function dirSign(d: string) { return d === 'credit' ? '+' : '−'; }

function exportCsvRows() {
    exportCsv('wallets', wallets.value, [
        { key: 'id', header: 'Wallet ID', value: (w) => w.id },
        { key: 'owner_type', header: 'Owner Type', value: (w) => w.owner_type },
        { key: 'owner_name', header: 'Owner', value: (w) => w.owner_name ?? '' },
        { key: 'status', header: 'Status', value: (w) => w.status },
        { key: 'balance', header: 'Balance (₦)', value: (w) => (w.balance_minor ?? 0) / 100 },
        { key: 'holds', header: 'Holds (₦)', value: (w) => (w.holds_minor ?? 0) / 100 },
        { key: 'available', header: 'Available (₦)', value: (w) => (w.available_minor ?? 0) / 100 },
        { key: 'created_at', header: 'Created', value: (w) => w.created_at },
    ]);
}

function exportPdfDoc() {
    printPdf({
        title: 'Wallets',
        subtitle: `${wallets.value.length} wallets`,
        meta: [
            { label: 'Wallets', value: String(wallets.value.length) },
            { label: 'Total balance', value: naira(wallets.value.reduce((s, w) => s + Number(w.balance_minor ?? 0), 0)) },
        ],
        tables: [{
            title: 'Wallets',
            columns: ['Owner', 'Type', 'Status', 'Balance', 'Available'],
            rows: wallets.value.map((w) => [
                w.owner_name ?? w.id.slice(0, 8), w.owner_type, w.status, naira(w.balance_minor), naira(w.available_minor),
            ]),
        }],
    });
}

onMounted(() => { void loadSummary(); void loadList(); });

// Re-trigger list when select filters change
watch([fOwnerType, fStatus], () => loadList());
</script>

<template>
  <AppShell title="Wallets">
    <template #topbar-end>
      <button class="bw-btn sm" :disabled="!wallets.length" @click="exportCsvRows">CSV</button>
      <button class="bw-btn sm" :disabled="!wallets.length" @click="exportPdfDoc" style="margin-left:6px">PDF</button>
    </template>

    <!-- Banner -->
    <transition name="banner">
      <div v-if="banner" :class="['bw-banner', banner.tone]" role="status">
        {{ banner.text }}
        <button class="bw-banner-x" @click="banner = null" aria-label="Dismiss">×</button>
      </div>
    </transition>

    <!-- KPI strip -->
    <div class="kpi-grid">
      <div class="kpi-tile brand">
        <p class="kpi-label">Total float</p>
        <p class="kpi-value">{{ naira(summary?.totalFloatMinor) }}</p>
        <p class="kpi-sub">{{ summary?.walletCount ?? 0 }} wallets</p>
      </div>
      <div class="kpi-tile">
        <p class="kpi-label">On hold</p>
        <p class="kpi-value">{{ naira(summary?.totalHoldsMinor) }}</p>
        <p class="kpi-sub">active reservations</p>
      </div>
      <div class="kpi-tile">
        <p class="kpi-label">Vendor float</p>
        <p class="kpi-value">{{ naira(summary?.vendorFloatMinor) }}</p>
        <p class="kpi-sub">{{ summary?.byOwnerType?.vendor ?? 0 }} vendor wallets</p>
      </div>
      <div class="kpi-tile">
        <p class="kpi-label">Customer float</p>
        <p class="kpi-value">{{ naira(summary?.customerFloatMinor) }}</p>
        <p class="kpi-sub">{{ summary?.byOwnerType?.customer ?? 0 }} customer wallets</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="bw-card filter-card">
      <div class="filter-grid">
        <div>
          <label class="bw-label">Owner</label>
          <select class="bw-input" v-model="fOwnerType">
            <option value="">All</option>
            <option value="vendor">Vendor</option>
            <option value="customer">Customer</option>
          </select>
        </div>
        <div>
          <label class="bw-label">Status</label>
          <select class="bw-input" v-model="fStatus">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="frozen">Frozen</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div>
          <label class="bw-label">Search</label>
          <input class="bw-input bw-mono" v-model="fQ" placeholder="id / name / phone / email" @keyup.enter="loadList()" />
        </div>
        <div>
          <label class="bw-label">Min balance (₦)</label>
          <input class="bw-input bw-mono" v-model.number="fMinBal" type="number" min="0" />
        </div>
        <div>
          <label class="bw-label">Max balance (₦)</label>
          <input class="bw-input bw-mono" v-model.number="fMaxBal" type="number" min="0" />
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
        <h2 class="bw-h2" style="margin: 0">{{ wallets.length }} wallets</h2>
        <span class="bw-spacer"></span>
        <span v-if="loading" class="bw-muted bw-mono" style="font-size: var(--t-xs)">loading…</span>
      </div>

      <!-- Desktop table -->
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Owner</th>
              <th>Type</th>
              <th style="text-align: right">Balance</th>
              <th style="text-align: right">Available</th>
              <th style="text-align: right">Daily cap</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="w in wallets" :key="w.id" @click="openDetail(w)" class="w-row">
              <td>
                <div class="bw-truncate" style="max-width: 240px">{{ w.owner_name || '—' }}</div>
                <div class="bw-mono row-sub">{{ w.id.slice(0, 8) }}</div>
              </td>
              <td><span :class="['bw-badge', ownerBadge(w.owner_type)]">{{ w.owner_type }}</span></td>
              <td class="bw-money" style="text-align: right">{{ naira(w.balance_minor) }}</td>
              <td class="bw-money" style="text-align: right; color: var(--brand)">{{ naira(w.available_minor) }}</td>
              <td class="bw-money bw-muted" style="text-align: right; font-size: var(--t-xs)">
                {{ w.daily_debit_cap_minor != null ? naira(w.daily_debit_cap_minor) : '—' }}
              </td>
              <td><span :class="['bw-badge', statusBadge(w.status)]">{{ w.status }}</span></td>
              <td class="row-arrow">→</td>
            </tr>
            <tr v-if="!wallets.length && !loading">
              <td colspan="7" class="bw-muted empty">No wallets match the filters.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards w-cards">
        <div v-for="w in wallets" :key="w.id" class="w-card" @click="openDetail(w)">
          <div class="wc-head">
            <div>
              <div class="bw-truncate" style="font-weight: 700">{{ w.owner_name || '—' }}</div>
              <div class="bw-mono row-sub">{{ w.id.slice(0, 8) }}</div>
            </div>
            <span :class="['bw-badge', statusBadge(w.status)]">{{ w.status }}</span>
          </div>
          <div class="wc-grid">
            <div>
              <p class="wc-label">Balance</p>
              <p class="bw-money">{{ naira(w.balance_minor) }}</p>
            </div>
            <div>
              <p class="wc-label">Available</p>
              <p class="bw-money" style="color: var(--brand)">{{ naira(w.available_minor) }}</p>
            </div>
            <div>
              <p class="wc-label">Type</p>
              <span :class="['bw-badge', ownerBadge(w.owner_type)]">{{ w.owner_type }}</span>
            </div>
          </div>
        </div>
        <div v-if="!wallets.length && !loading" class="bw-muted empty">No wallets.</div>
      </div>

      <div v-if="cursor" class="load-more">
        <button class="bw-btn" :disabled="loading" @click="loadList(false)">
          {{ loading ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </div>

    <!-- ═══ DETAIL DRAWER ═══ -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="detail" class="drawer-scrim" @click.self="closeDetail">
          <aside class="drawer" role="dialog" aria-modal="true">

            <header class="drawer-head">
              <div>
                <p class="drawer-eyebrow">Wallet · {{ detail.wallet.owner_type }}</p>
                <h2 class="drawer-title">{{ detail.owner?.legal_name ?? detail.owner?.trading_name ?? detail.owner?.full_name ?? detail.wallet.owner_id.slice(0, 8) }}</h2>
                <p class="bw-mono drawer-id">{{ detail.wallet.id }}</p>
              </div>
              <button class="drawer-x" @click="closeDetail" aria-label="Close">×</button>
            </header>

            <!-- Balance tile -->
            <div class="dr-balance">
              <div>
                <p class="dr-balance-label">Available</p>
                <p class="dr-balance-value">{{ naira(detail.available_minor) }}</p>
                <p class="dr-balance-sub">
                  Balance {{ naira(detail.balance_minor) }} · Holds {{ naira(detail.holds_minor) }}
                </p>
              </div>
              <span :class="['bw-badge', statusBadge(detail.wallet.status)]">{{ detail.wallet.status }}</span>
            </div>

            <!-- Owner block -->
            <div class="dr-block">
              <p class="dr-block-title">Owner</p>
              <dl class="dr-dl">
                <template v-if="detail.wallet.owner_type === 'vendor' && detail.owner">
                  <dt>Legal name</dt><dd>{{ detail.owner.legal_name }}</dd>
                  <dt>Trading name</dt><dd>{{ detail.owner.trading_name || '—' }}</dd>
                  <dt>Email</dt><dd class="bw-mono">{{ detail.owner.contact_email || '—' }}</dd>
                  <dt>Phone</dt><dd class="bw-mono">{{ detail.owner.contact_phone || '—' }}</dd>
                  <dt>Status</dt><dd>{{ detail.owner.status }}</dd>
                  <dt>Risk</dt><dd>{{ detail.owner.risk_level }}</dd>
                </template>
                <template v-else-if="detail.wallet.owner_type === 'customer' && detail.owner">
                  <dt>Full name</dt><dd>{{ detail.owner.full_name || '—' }}</dd>
                  <dt>Email</dt><dd class="bw-mono">{{ detail.owner.email || '—' }}</dd>
                  <dt>Phone</dt><dd class="bw-mono">{{ detail.owner.phone || '—' }}</dd>
                  <dt>KYC tier</dt><dd>Tier {{ detail.owner.kyc_tier }}</dd>
                  <dt>Status</dt><dd>{{ detail.owner.status }}</dd>
                </template>
              </dl>
            </div>

            <!-- Limits + Actions -->
            <div class="dr-block">
              <div class="dr-block-row">
                <p class="dr-block-title" style="margin: 0">Limits</p>
                <button class="bw-btn sm" @click="askLimits">Edit</button>
              </div>
              <dl class="dr-dl">
                <dt>Daily cap</dt>
                <dd>{{ detail.wallet.daily_debit_cap_minor != null ? naira(detail.wallet.daily_debit_cap_minor) : 'No cap' }}</dd>
                <dt>Monthly cap</dt>
                <dd>{{ detail.wallet.monthly_debit_cap_minor != null ? naira(detail.wallet.monthly_debit_cap_minor) : 'No cap' }}</dd>
                <dt>Currency</dt><dd>{{ detail.wallet.currency }}</dd>
                <dt>Opened</dt><dd>{{ new Date(detail.wallet.created_at).toLocaleString() }}</dd>
              </dl>

              <div class="dr-actions">
                <button v-if="detail.wallet.status === 'active'" class="bw-btn" @click="askStatus('frozen')">Freeze</button>
                <button v-if="detail.wallet.status === 'frozen'" class="bw-btn primary" @click="askStatus('active')">Unfreeze</button>
                <button v-if="detail.wallet.status !== 'closed'" class="bw-btn danger" @click="askStatus('closed')">Close</button>
              </div>
            </div>

            <!-- Ledger -->
            <div class="dr-block">
              <p class="dr-block-title">Ledger · {{ ledger.length }} entries</p>
              <div v-if="!ledger.length" class="bw-muted empty">No movements yet.</div>
              <ul v-else class="ledger-list">
                <li v-for="e in ledger" :key="e.id" class="ledger-row">
                  <div class="ledger-when bw-mono">{{ shortDate(e.created_at) }}</div>
                  <div class="ledger-meta">
                    <span class="bw-mono ledger-type">{{ e.entry_type.replace(/_/g, ' ') }}</span>
                    <span v-if="e.memo" class="bw-muted ledger-memo">{{ e.memo }}</span>
                  </div>
                  <div class="ledger-amt bw-money" :class="e.direction">
                    {{ dirSign(e.direction) }}{{ naira(e.amount_minor) }}
                  </div>
                  <div class="ledger-bal bw-money bw-muted">{{ naira(e.balance_after_minor) }}</div>
                </li>
              </ul>
              <div v-if="ledgerCursor" class="load-more">
                <button class="bw-btn sm" :disabled="ledgerLoading" @click="loadMoreLedger">
                  {{ ledgerLoading ? 'Loading…' : 'Load older' }}
                </button>
              </div>
            </div>

          </aside>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══ STATUS CONFIRM ═══ -->
    <ConfirmDialog
      v-model:open="statusOpen"
      :title="statusLabel"
      :description="detail
        ? `Change wallet #${detail.wallet.id.slice(0, 8)} from ${detail.wallet.status} → ${statusTarget}. Audit-logged.`
        : ''"
      :confirm-label="statusLabel"
      :tone="statusTone"
      :loading="statusBusy"
      :disable-confirm="!statusReasonValid"
      @confirm="doStatus"
    >
      <template v-if="statusTarget !== 'active'">
        <label class="cd-input-label">Reason *</label>
        <textarea
          v-model="statusReason"
          rows="3"
          class="cd-input"
          placeholder="e.g. Suspicious vending pattern — under fraud review."
        />
        <p class="cd-input-hint">Minimum 4 characters.</p>
      </template>
    </ConfirmDialog>

    <!-- ═══ LIMITS CONFIRM ═══ -->
    <ConfirmDialog
      v-model:open="limitsOpen"
      title="Update wallet limits"
      description="Caps apply in a 24-hour and 30-day rolling window. Set to blank to remove a cap."
      confirm-label="Save limits"
      tone="brand"
      :loading="limitsBusy"
      :disable-confirm="!limitsValid"
      @confirm="doLimits"
    >
      <div class="cd-grid-2">
        <div>
          <label class="cd-input-label">Daily cap (₦)</label>
          <input v-model.number="limitDailyNaira" type="number" min="0" class="cd-input" />
        </div>
        <div>
          <label class="cd-input-label">Monthly cap (₦)</label>
          <input v-model.number="limitMonthlyNaira" type="number" min="0" class="cd-input" />
        </div>
      </div>
      <label class="cd-input-label" style="margin-top: var(--s-3)">Reason *</label>
      <textarea v-model="limitReason" rows="2" class="cd-input" placeholder="e.g. Vendor requested upgrade after Q2 review." />
      <p class="cd-input-hint">Minimum 4 characters.</p>
    </ConfirmDialog>

  </AppShell>
</template>

<style scoped>
/* Banners (re-used pattern) */
.bw-banner {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--s-3); padding: var(--s-3) var(--s-4);
  border-radius: var(--r-md); margin-bottom: var(--s-3);
  font-size: var(--t-sm); border: 1px solid;
}
.bw-banner.success { background: oklch(from var(--brand)  l c h / 0.08); border-color: oklch(from var(--brand)  l c h / 0.30); color: var(--brand); }
.bw-banner.error   { background: oklch(from var(--danger) l c h / 0.08); border-color: oklch(from var(--danger) l c h / 0.30); color: var(--danger); }
.bw-banner-x { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 18px; padding: 2px 8px; opacity: 0.7; }
.bw-banner-x:hover { opacity: 1; }
.banner-enter-active, .banner-leave-active { transition: all 0.20s var(--ease-out); }
.banner-enter-from { opacity: 0; transform: translateY(-4px); }
.banner-leave-to { opacity: 0; }

/* KPI */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}
.kpi-tile {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--s-4);
  position: relative;
  overflow: hidden;
}
.kpi-tile.brand {
  background: linear-gradient(135deg, oklch(from var(--brand) l c h / 0.08), transparent);
  border-color: oklch(from var(--brand) l c h / 0.25);
}
.kpi-tile.brand::before {
  content: ''; position: absolute; top: 0; left: 20%; right: 20%;
  height: 1px; background: linear-gradient(90deg, transparent, var(--brand), transparent);
}
.kpi-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--text-muted); margin: 0 0 6px;
}
.kpi-value {
  font-family: var(--font-mono); font-weight: 700;
  font-size: var(--t-xl); margin: 0;
}
.kpi-tile.brand .kpi-value { color: var(--brand); }
.kpi-sub { font-size: var(--t-xs); color: var(--text-muted); margin: 4px 0 0; }

/* Filter card */
.filter-card { margin-bottom: var(--s-3); }
.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--s-3);
  align-items: end;
}
.filter-actions { display: flex; gap: var(--s-2); align-items: end; }

/* Table */
.w-row { cursor: pointer; }
.w-row:hover { background: var(--surface-2); }
.row-sub { font-size: 10px; margin-top: 2px; color: var(--text-muted); }
.row-arrow { color: var(--text-muted); text-align: right; width: 24px; }
.empty { text-align: center; padding: var(--s-6); }
.load-more { padding: var(--s-3); text-align: center; }
.bw-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Mobile cards */
.w-cards { padding: var(--s-3); }
.w-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--s-4);
  margin-bottom: var(--s-2);
  cursor: pointer;
}
.w-card:hover { border-color: var(--brand); }
.wc-head {
  display: flex; justify-content: space-between; align-items: start;
  margin-bottom: var(--s-3); gap: var(--s-2);
}
.wc-grid {
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--s-2);
  padding-top: var(--s-3); border-top: 1px dashed var(--border);
}
.wc-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--text-muted); margin: 0 0 2px;
}

/* Drawer */
.drawer-scrim {
  position: fixed; inset: 0;
  background: oklch(0% 0 0 / 0.55); z-index: 200;
  display: flex; justify-content: flex-end;
}
.drawer {
  width: min(640px, 100%); height: 100%;
  background: var(--surface); border-left: 1px solid var(--border);
  overflow-y: auto; padding: var(--s-5);
  box-shadow: -16px 0 48px oklch(0% 0 0 / 0.40);
}
.drawer-head { display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--s-4); }
.drawer-eyebrow {
  font-size: 10px; font-weight: 700; letter-spacing: 0.10em; text-transform: uppercase;
  color: var(--brand); margin: 0 0 2px;
}
.drawer-title { margin: 0 0 4px; font-size: var(--t-lg); }
.drawer-id { font-size: 11px; color: var(--text-muted); margin: 0; }
.drawer-x {
  background: none; border: none; color: var(--text-muted); cursor: pointer;
  font-size: 22px; line-height: 1; padding: 4px 10px; border-radius: var(--r-sm);
}
.drawer-x:hover { color: var(--text); background: var(--surface-2); }

.dr-balance {
  display: flex; justify-content: space-between; align-items: start;
  background: linear-gradient(135deg, oklch(from var(--brand) l c h / 0.10), transparent);
  border: 1px solid oklch(from var(--brand) l c h / 0.25);
  border-radius: var(--r-lg);
  padding: var(--s-4);
  margin-bottom: var(--s-4);
}
.dr-balance-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.10em; text-transform: uppercase;
  color: var(--brand); margin: 0;
}
.dr-balance-value {
  font-family: var(--font-mono); font-weight: 700;
  font-size: var(--t-2xl); color: var(--brand);
  margin: 4px 0 6px;
}
.dr-balance-sub { font-size: var(--t-xs); color: var(--text-muted); margin: 0; }

.dr-block {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--s-4);
  margin-bottom: var(--s-3);
}
.dr-block-title {
  font-size: 10px; font-weight: 700; letter-spacing: 0.10em; text-transform: uppercase;
  color: var(--text-muted); margin: 0 0 var(--s-3);
}
.dr-block-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--s-3); }

.dr-dl {
  display: grid; grid-template-columns: 130px 1fr;
  gap: 4px var(--s-3); margin: 0; font-size: var(--t-sm);
}
.dr-dl dt { color: var(--text-muted); }
.dr-dl dd { margin: 0; word-break: break-word; }

.dr-actions {
  display: flex; gap: var(--s-2); margin-top: var(--s-4);
  padding-top: var(--s-3); border-top: 1px dashed var(--border);
}

.ledger-list { list-style: none; margin: 0; padding: 0; }
.ledger-row {
  display: grid;
  grid-template-columns: 90px 1fr auto auto;
  gap: var(--s-3); align-items: center;
  padding: 8px 0; border-top: 1px solid var(--border);
  font-size: var(--t-xs);
}
.ledger-row:first-child { border-top: none; }
.ledger-when { color: var(--text-muted); }
.ledger-meta { display: flex; flex-direction: column; min-width: 0; }
.ledger-type { font-weight: 600; }
.ledger-memo { font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ledger-amt { font-weight: 700; }
.ledger-amt.credit { color: var(--brand); }
.ledger-amt.debit { color: var(--text); }
.ledger-bal { font-size: 10px; }

.drawer-enter-active, .drawer-leave-active { transition: opacity 0.20s var(--ease-out); }
.drawer-enter-active .drawer, .drawer-leave-active .drawer { transition: transform 0.22s var(--ease-out); }
.drawer-enter-from { opacity: 0; }
.drawer-enter-from .drawer { transform: translateX(40px); }
.drawer-leave-to { opacity: 0; }
.drawer-leave-to .drawer { transform: translateX(40px); }

/* Dialog body */
:deep(.cd-body) .cd-input-label {
  display: block;
  font-size: var(--t-xs); font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--text-muted); margin-bottom: 6px;
}
:deep(.cd-body) .cd-input {
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 10px 12px;
  color: var(--text); font-size: var(--t-sm);
  font-family: inherit; resize: vertical;
}
:deep(.cd-body) .cd-input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-glow);
}
:deep(.cd-body) .cd-input-hint { font-size: var(--t-xs); color: var(--text-muted); margin: 6px 0 0; }
:deep(.cd-body) .cd-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }

@media (max-width: 640px) {
  .filter-grid { grid-template-columns: 1fr; }
  .drawer { width: 100%; padding: var(--s-4); }
  .dr-dl { grid-template-columns: 1fr; }
  .dr-dl dt { font-weight: 700; margin-top: var(--s-2); }
  .ledger-row { grid-template-columns: 1fr auto; gap: 4px; }
  .ledger-when, .ledger-bal { grid-column: 1 / -1; opacity: 0.7; }
  :deep(.cd-body) .cd-grid-2 { grid-template-columns: 1fr; }
}
</style>
