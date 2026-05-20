<script setup lang="ts">
/**
 * Purchases admin view (super-admin / operations).
 *
 * KPI strip + filterable list + detail drawer with:
 *   • Full lifecycle timeline (created → hold → captured → token → SMS)
 *   • Ledger entries tied to the purchase
 *   • Token (mono + copy), receipt link
 *   • Resend token SMS (ConfirmDialog)
 *   • Request refund — routes to the maker-checker refund flow (ConfirmDialog)
 *
 * Endpoints:
 *   GET  /api/v1/admin/purchases[?status,station,actorType,q,since,until,cursor]
 *   GET  /api/v1/admin/purchases/summary
 *   GET  /api/v1/admin/purchases/:id
 *   POST /api/v1/admin/purchases/:id/resend-sms
 *   POST /api/v1/admin/refunds          body: { purchaseOrderId, amountMinor, reason }
 */
import { onMounted, ref, computed, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { api, naira, shortDate, ApiError } from '../lib/api';
import { exportCsv, printPdf } from '../lib/export';

interface Purchase {
    id: string;
    actor_type: string;
    actor_id: string;
    customer_id: string | null;
    customer_name: string | null;
    meter_id: string;
    station_id: string | null;
    tariff_id: string | null;
    amount_minor: number;
    units_kwh: number | null;
    purchase_mode: string;
    status: string;
    token: string | null;
    receipt_id: string | null;
    wallet_id: string | null;
    delivery_state: string | null;
    failure_reason: string | null;
    created_at: string;
}

interface PurchaseSummary {
    todayCount: number;
    todayValueMinor: number;
    last24hCount: number;
    last24hValueMinor: number;
    failed24hCount: number;
    refundedCount: number;
}

interface LedgerEntry {
    id: string;
    direction: 'debit' | 'credit';
    entry_type: string;
    amount_minor: number;
    created_at: string;
    memo: string | null;
}

interface PurchaseDetail {
    purchase: Purchase;
    hold: any;
    ledger_entries: LedgerEntry[];
    receipt: any;
}

// ─ List ───────────────────────────────────────────────────────
const summary = ref<PurchaseSummary | null>(null);
const items = ref<Purchase[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const banner = ref<{ tone: 'success' | 'error'; text: string } | null>(null);

const fStatus    = ref('');
const fActorType = ref('');
const fStation   = ref('');
const fQ         = ref('');
const fSince     = ref('');
const fUntil     = ref('');

async function loadSummary() {
    try { summary.value = await api.get<PurchaseSummary>('/api/v1/admin/purchases/summary'); }
    catch { /* supplementary */ }
}

async function loadList(reset = true) {
    loading.value = true;
    try {
        const p = new URLSearchParams();
        if (fStatus.value)    p.set('status',    fStatus.value);
        if (fActorType.value) p.set('actorType', fActorType.value);
        if (fStation.value)   p.set('station',   fStation.value);
        if (fQ.value)         p.set('q',         fQ.value);
        if (fSince.value)     p.set('since',     new Date(fSince.value).toISOString());
        if (fUntil.value)     p.set('until',     new Date(fUntil.value).toISOString());
        p.set('limit', '100');
        if (!reset && cursor.value) p.set('cursor', cursor.value);
        const r = await api.get<{ purchases: Purchase[]; nextCursor: string | null }>(`/api/v1/admin/purchases?${p}`);
        items.value = reset ? r.purchases : [...items.value, ...r.purchases];
        cursor.value = r.nextCursor;
    } catch (e: any) {
        banner.value = { tone: 'error', text: e?.message ?? 'Could not load purchases.' };
    } finally { loading.value = false; }
}

function resetFilters() {
    fStatus.value = ''; fActorType.value = ''; fStation.value = '';
    fQ.value = ''; fSince.value = ''; fUntil.value = '';
    void loadList();
}

// ─ Detail drawer ──────────────────────────────────────────────
const detail = ref<PurchaseDetail | null>(null);
const copied = ref(false);

async function openDetail(p: Purchase) {
    try {
        detail.value = await api.get<PurchaseDetail>(`/api/v1/admin/purchases/${p.id}`);
    } catch (e: any) {
        banner.value = { tone: 'error', text: e?.message ?? 'Could not load detail.' };
    }
}
function closeDetail() { detail.value = null; }

async function copyToken() {
    if (!detail.value?.purchase.token) return;
    try {
        await navigator.clipboard.writeText(detail.value.purchase.token);
        copied.value = true;
        setTimeout(() => (copied.value = false), 1800);
    } catch { /* noop */ }
}

// Lifecycle timeline derived from purchase + ledger state.
const timeline = computed(() => {
    if (!detail.value) return [];
    const p = detail.value.purchase;
    const entries = detail.value.ledger_entries;
    const holdEntry = entries.find((e) => e.entry_type.includes('hold'));
    const captureEntry = entries.find((e) => e.entry_type.includes('purchase_debit') || e.entry_type.includes('capture'));
    const steps = [
        { key: 'created', label: 'Order created', at: p.created_at, done: true },
        { key: 'hold', label: 'Funds held', at: detail.value.hold?.created_at ?? holdEntry?.created_at ?? null, done: !!(detail.value.hold || holdEntry) },
        { key: 'captured', label: 'Payment captured', at: captureEntry?.created_at ?? null, done: !!captureEntry },
        { key: 'token', label: 'Token issued', at: p.token ? (captureEntry?.created_at ?? null) : null, done: !!p.token },
        { key: 'receipt', label: 'Receipt generated', at: null, done: !!p.receipt_id },
    ];
    if (p.status === 'failed') {
        steps.push({ key: 'failed', label: `Failed: ${p.failure_reason ?? 'unknown'}`, at: null, done: true });
    }
    if (p.status === 'refunded') {
        steps.push({ key: 'refunded', label: 'Refunded', at: null, done: true });
    }
    return steps;
});

// ─ Resend SMS ─────────────────────────────────────────────────
const resendOpen = ref(false);
const resendBusy = ref(false);

async function doResend() {
    if (!detail.value) return;
    resendBusy.value = true;
    banner.value = null;
    try {
        await api.post(`/api/v1/admin/purchases/${detail.value.purchase.id}/resend-sms`);
        resendOpen.value = false;
        banner.value = { tone: 'success', text: 'Token SMS resent to the customer.' };
    } catch (e: any) {
        const msg = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Resend failed.';
        banner.value = { tone: 'error', text: msg };
        resendOpen.value = false;
    } finally { resendBusy.value = false; }
}

// ─ Request refund ─────────────────────────────────────────────
const refundOpen = ref(false);
const refundReason = ref('');
const refundBusy = ref(false);
const refundValid = computed(() => refundReason.value.trim().length >= 5);

async function doRefund() {
    if (!detail.value || !refundValid.value) return;
    const po = detail.value.purchase;
    if (!po.wallet_id) {
        banner.value = { tone: 'error', text: 'This purchase has no wallet linked — cannot refund.' };
        refundOpen.value = false;
        return;
    }
    refundBusy.value = true;
    banner.value = null;
    try {
        await api.post('/api/v1/admin/refunds', {
            wallet_id: po.wallet_id,
            amount_minor: po.amount_minor,
            reason: `[purchase ${po.id}] ${refundReason.value.trim()}`,
        });
        refundOpen.value = false;
        refundReason.value = '';
        banner.value = { tone: 'success', text: 'Refund request created. A second approver must authorize it.' };
    } catch (e: any) {
        const msg = e instanceof ApiError ? `${e.message} (${e.code})` : e?.message ?? 'Refund request failed.';
        banner.value = { tone: 'error', text: msg };
        refundOpen.value = false;
    } finally { refundBusy.value = false; }
}

// ─ Helpers ───────────────────────────────────────────────────
function statusBadge(s: string) {
    return ({
        delivered: 'success', completed: 'success', token_issued: 'success',
        hold_active: 'warn', created: 'neutral', processing: 'warn',
        failed: 'danger', refunded: 'info',
    } as Record<string, string>)[s] ?? 'neutral';
}
function actorBadge(t: string) { return t === 'vendor' ? 'info' : 'neutral'; }

function exportCsvRows() {
    exportCsv('purchases', items.value, [
        { key: 'id', header: 'ID', value: (p) => p.id },
        { key: 'created_at', header: 'When', value: (p) => p.created_at },
        { key: 'actor_type', header: 'Actor', value: (p) => p.actor_type },
        { key: 'buyer', header: 'Buyer', value: (p) => p.customer_name ?? '' },
        { key: 'meter_id', header: 'Meter', value: (p) => p.meter_id },
        { key: 'station_id', header: 'Station', value: (p) => p.station_id ?? '' },
        { key: 'amount', header: 'Amount (₦)', value: (p) => (p.amount_minor ?? 0) / 100 },
        { key: 'units_kwh', header: 'Units (kWh)', value: (p) => p.units_kwh ?? '' },
        { key: 'status', header: 'Status', value: (p) => p.status },
    ]);
}

function exportPdfDoc() {
    printPdf({
        title: 'Purchases',
        subtitle: `${items.value.length} loaded purchases`,
        meta: [
            { label: 'Rows', value: String(items.value.length) },
            { label: 'Total value', value: naira(items.value.reduce((s, p) => s + Number(p.amount_minor ?? 0), 0)) },
        ],
        tables: [{
            title: 'Purchases',
            columns: ['When', 'Buyer', 'Meter', 'Station', 'Amount', 'Status'],
            rows: items.value.map((p) => [
                shortDate(p.created_at), p.customer_name ?? '—', p.meter_id, p.station_id ?? '—', naira(p.amount_minor), p.status,
            ]),
        }],
    });
}

onMounted(() => { void loadSummary(); void loadList(); });
watch([fStatus, fActorType], () => loadList());
</script>

<template>
  <AppShell title="Purchases">
    <template #topbar-end>
      <button class="bw-btn sm" :disabled="!items.length" @click="exportCsvRows">CSV</button>
      <button class="bw-btn sm" :disabled="!items.length" @click="exportPdfDoc" style="margin-left:6px">PDF</button>
    </template>

    <transition name="banner">
      <div v-if="banner" :class="['bw-banner', banner.tone]" role="status">
        {{ banner.text }}
        <button class="bw-banner-x" @click="banner = null" aria-label="Dismiss">×</button>
      </div>
    </transition>

    <!-- KPI strip -->
    <div class="kpi-grid">
      <div class="kpi-tile brand">
        <p class="kpi-label">Today</p>
        <p class="kpi-value">{{ naira(summary?.todayValueMinor) }}</p>
        <p class="kpi-sub">{{ summary?.todayCount ?? 0 }} purchases</p>
      </div>
      <div class="kpi-tile">
        <p class="kpi-label">Last 24h</p>
        <p class="kpi-value">{{ naira(summary?.last24hValueMinor) }}</p>
        <p class="kpi-sub">{{ summary?.last24hCount ?? 0 }} purchases</p>
      </div>
      <div class="kpi-tile">
        <p class="kpi-label">Failed 24h</p>
        <p class="kpi-value" :style="{ color: (summary?.failed24hCount ?? 0) > 0 ? 'var(--danger)' : undefined }">
          {{ summary?.failed24hCount ?? 0 }}
        </p>
        <p class="kpi-sub">needs review</p>
      </div>
      <div class="kpi-tile">
        <p class="kpi-label">Refunded</p>
        <p class="kpi-value">{{ summary?.refundedCount ?? 0 }}</p>
        <p class="kpi-sub">all time</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="bw-card filter-card">
      <div class="filter-grid">
        <div>
          <label class="bw-label">Status</label>
          <select class="bw-input" v-model="fStatus">
            <option value="">All</option>
            <option value="created">Created</option>
            <option value="hold_active">Hold active</option>
            <option value="processing">Processing</option>
            <option value="delivered">Delivered</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
        <div>
          <label class="bw-label">Actor</label>
          <select class="bw-input" v-model="fActorType">
            <option value="">All</option>
            <option value="vendor">Vendor</option>
            <option value="customer">Customer</option>
          </select>
        </div>
        <div>
          <label class="bw-label">Station</label>
          <input class="bw-input bw-mono" v-model="fStation" placeholder="e.g. TUNGA" @keyup.enter="loadList()" />
        </div>
        <div>
          <label class="bw-label">Search</label>
          <input class="bw-input bw-mono" v-model="fQ" placeholder="meter / customer / id" @keyup.enter="loadList()" />
        </div>
        <div>
          <label class="bw-label">Since</label>
          <input class="bw-input" type="datetime-local" v-model="fSince" />
        </div>
        <div>
          <label class="bw-label">Until</label>
          <input class="bw-input" type="datetime-local" v-model="fUntil" />
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
        <h2 class="bw-h2" style="margin: 0">{{ items.length }} purchases</h2>
        <span class="bw-spacer"></span>
        <span v-if="loading" class="bw-muted bw-mono" style="font-size: var(--t-xs)">loading…</span>
      </div>

      <!-- Desktop -->
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Buyer</th>
              <th>Meter</th>
              <th>Station</th>
              <th style="text-align: right">Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in items" :key="p.id" @click="openDetail(p)" class="p-row">
              <td class="bw-mono bw-muted" style="font-size: var(--t-xs)">{{ shortDate(p.created_at) }}</td>
              <td>
                <div class="bw-truncate" style="max-width: 180px">{{ p.customer_name || '—' }}</div>
                <span :class="['bw-badge', actorBadge(p.actor_type)]" style="font-size: 10px">{{ p.actor_type }}</span>
              </td>
              <td class="bw-mono">{{ p.meter_id }}</td>
              <td class="bw-mono bw-muted">{{ p.station_id || '—' }}</td>
              <td class="bw-money" style="text-align: right">{{ naira(p.amount_minor) }}</td>
              <td><span :class="['bw-badge', statusBadge(p.status)]">{{ p.status }}</span></td>
              <td class="row-arrow">→</td>
            </tr>
            <tr v-if="!items.length && !loading">
              <td colspan="7" class="bw-muted empty">No purchases match the filters.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile -->
      <div class="bw-t-cards p-cards">
        <div v-for="p in items" :key="p.id" class="p-card" @click="openDetail(p)">
          <div class="pc-head">
            <div>
              <div class="bw-money pc-amount">{{ naira(p.amount_minor) }}</div>
              <div class="bw-mono pc-meta">{{ p.meter_id }} · {{ shortDate(p.created_at) }}</div>
            </div>
            <span :class="['bw-badge', statusBadge(p.status)]">{{ p.status }}</span>
          </div>
          <div class="pc-row">
            <span class="pc-label">Buyer</span>
            <span>{{ p.customer_name || '—' }} <span :class="['bw-badge', actorBadge(p.actor_type)]" style="font-size: 10px">{{ p.actor_type }}</span></span>
          </div>
          <div class="pc-row">
            <span class="pc-label">Station</span>
            <span class="bw-mono">{{ p.station_id || '—' }}</span>
          </div>
        </div>
        <div v-if="!items.length && !loading" class="bw-muted empty">No purchases.</div>
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
                <p class="drawer-eyebrow">Purchase · {{ detail.purchase.actor_type }}</p>
                <h2 class="drawer-title">{{ naira(detail.purchase.amount_minor) }}</h2>
                <p class="bw-mono drawer-id">{{ detail.purchase.id }}</p>
              </div>
              <button class="drawer-x" @click="closeDetail" aria-label="Close">×</button>
            </header>

            <!-- Status + key facts -->
            <div class="dr-facts">
              <span :class="['bw-badge', statusBadge(detail.purchase.status)]">{{ detail.purchase.status }}</span>
              <span class="bw-muted bw-mono">{{ Number(detail.purchase.units_kwh ?? 0).toFixed(2) }} kWh</span>
              <span class="bw-muted bw-mono">{{ detail.purchase.tariff_id || '—' }}</span>
            </div>

            <!-- Token -->
            <div v-if="detail.purchase.token" class="dr-token">
              <p class="dr-token-label">Token</p>
              <div class="dr-token-row">
                <span class="dr-token-value bw-mono">{{ detail.purchase.token }}</span>
                <button class="bw-btn sm" @click="copyToken">{{ copied ? 'Copied ✓' : 'Copy' }}</button>
              </div>
            </div>

            <!-- Lifecycle timeline -->
            <div class="dr-block">
              <p class="dr-block-title">Lifecycle</p>
              <ul class="timeline">
                <li v-for="(s, i) in timeline" :key="s.key" :class="['tl-step', { done: s.done, last: i === timeline.length - 1 }]">
                  <span class="tl-dot" :class="{ done: s.done, fail: s.key === 'failed' }">
                    <svg v-if="s.done && s.key !== 'failed'" width="10" height="10" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span v-else-if="s.key === 'failed'">!</span>
                  </span>
                  <div class="tl-body">
                    <span class="tl-label">{{ s.label }}</span>
                    <span v-if="s.at" class="tl-at bw-mono">{{ shortDate(s.at) }}</span>
                  </div>
                </li>
              </ul>
            </div>

            <!-- Buyer + meter -->
            <div class="dr-block">
              <p class="dr-block-title">Details</p>
              <dl class="dr-dl">
                <dt>Buyer</dt><dd>{{ detail.purchase.customer_name || '—' }}</dd>
                <dt>Meter</dt><dd class="bw-mono">{{ detail.purchase.meter_id }}</dd>
                <dt>Station</dt><dd class="bw-mono">{{ detail.purchase.station_id || '—' }}</dd>
                <dt>Mode</dt><dd>{{ detail.purchase.purchase_mode }}</dd>
                <dt>Receipt</dt>
                <dd>
                  <span v-if="detail.receipt" class="bw-mono">#{{ String(detail.receipt.id).slice(0, 8) }}</span>
                  <span v-else class="bw-muted">—</span>
                </dd>
                <dt v-if="detail.purchase.failure_reason">Failure</dt>
                <dd v-if="detail.purchase.failure_reason" style="color: var(--danger)">{{ detail.purchase.failure_reason }}</dd>
              </dl>
            </div>

            <!-- Ledger -->
            <div class="dr-block">
              <p class="dr-block-title">Ledger · {{ detail.ledger_entries.length }}</p>
              <div v-if="!detail.ledger_entries.length" class="bw-muted empty">No ledger movements.</div>
              <ul v-else class="ledger-list">
                <li v-for="e in detail.ledger_entries" :key="e.id" class="ledger-row">
                  <span class="bw-mono ledger-when">{{ shortDate(e.created_at) }}</span>
                  <span class="bw-mono ledger-type">{{ e.entry_type.replace(/_/g, ' ') }}</span>
                  <span class="bw-money ledger-amt" :class="e.direction">
                    {{ e.direction === 'credit' ? '+' : '−' }}{{ naira(e.amount_minor) }}
                  </span>
                </li>
              </ul>
            </div>

            <!-- Actions -->
            <div class="dr-actions">
              <button
                v-if="detail.purchase.token && detail.purchase.actor_type === 'customer'"
                class="bw-btn"
                @click="resendOpen = true"
              >Resend SMS</button>
              <button
                v-if="['delivered','completed','token_issued'].includes(detail.purchase.status)"
                class="bw-btn danger"
                @click="refundOpen = true"
              >Request refund</button>
            </div>

          </aside>
        </div>
      </Transition>
    </Teleport>

    <!-- Resend confirm -->
    <ConfirmDialog
      v-model:open="resendOpen"
      title="Resend token SMS"
      :description="detail
        ? `Resend the token for meter ${detail.purchase.meter_id} to the customer's phone on file.`
        : ''"
      confirm-label="Resend SMS"
      tone="brand"
      :loading="resendBusy"
      @confirm="doResend"
    />

    <!-- Refund confirm -->
    <ConfirmDialog
      v-model:open="refundOpen"
      title="Request refund"
      :description="detail
        ? `Create a refund request for ${naira(detail.purchase.amount_minor)}. This does NOT immediately move money — a second staff member must approve it (maker-checker).`
        : ''"
      confirm-label="Create refund request"
      tone="danger"
      :loading="refundBusy"
      :disable-confirm="!refundValid"
      @confirm="doRefund"
    >
      <label class="cd-input-label">Reason *</label>
      <textarea v-model="refundReason" rows="3" class="cd-input" placeholder="e.g. Token never reached the meter; vend confirmed failed upstream." />
      <p class="cd-input-hint">Minimum 5 characters. Recorded in the audit trail.</p>
    </ConfirmDialog>

  </AppShell>
</template>

<style scoped>
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

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--s-3); margin-bottom: var(--s-3);
}
.kpi-tile {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--r-lg); padding: var(--s-4);
  position: relative; overflow: hidden;
}
.kpi-tile.brand {
  background: linear-gradient(135deg, oklch(from var(--brand) l c h / 0.08), transparent);
  border-color: oklch(from var(--brand) l c h / 0.25);
}
.kpi-tile.brand::before {
  content: ''; position: absolute; top: 0; left: 20%; right: 20%;
  height: 1px; background: linear-gradient(90deg, transparent, var(--brand), transparent);
}
.kpi-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 6px; }
.kpi-value { font-family: var(--font-mono); font-weight: 700; font-size: var(--t-xl); margin: 0; }
.kpi-tile.brand .kpi-value { color: var(--brand); }
.kpi-sub { font-size: var(--t-xs); color: var(--text-muted); margin: 4px 0 0; }

.filter-card { margin-bottom: var(--s-3); }
.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--s-3); align-items: end;
}
.filter-actions { display: flex; gap: var(--s-2); align-items: end; }

.p-row { cursor: pointer; }
.p-row:hover { background: var(--surface-2); }
.row-arrow { color: var(--text-muted); text-align: right; width: 24px; }
.empty { text-align: center; padding: var(--s-6); }
.load-more { padding: var(--s-3); text-align: center; }
.bw-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.p-cards { padding: var(--s-3); }
.p-card {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--r-md); padding: var(--s-4); margin-bottom: var(--s-2); cursor: pointer;
}
.p-card:hover { border-color: var(--brand); }
.pc-head { display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--s-3); gap: var(--s-2); }
.pc-amount { font-weight: 700; font-size: var(--t-lg); }
.pc-meta { font-size: var(--t-xs); color: var(--text-muted); margin-top: 2px; }
.pc-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: var(--t-sm); border-top: 1px dashed var(--border); }
.pc-label { color: var(--text-muted); }

/* Drawer */
.drawer-scrim { position: fixed; inset: 0; background: oklch(0% 0 0 / 0.55); z-index: 200; display: flex; justify-content: flex-end; }
.drawer { width: min(640px, 100%); height: 100%; background: var(--surface); border-left: 1px solid var(--border); overflow-y: auto; padding: var(--s-5); box-shadow: -16px 0 48px oklch(0% 0 0 / 0.40); }
.drawer-head { display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--s-4); }
.drawer-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.10em; text-transform: uppercase; color: var(--brand); margin: 0 0 2px; }
.drawer-title { margin: 0 0 4px; font-size: var(--t-xl); font-family: var(--font-mono); }
.drawer-id { font-size: 11px; color: var(--text-muted); margin: 0; }
.drawer-x { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 22px; line-height: 1; padding: 4px 10px; border-radius: var(--r-sm); }
.drawer-x:hover { color: var(--text); background: var(--surface-2); }

.dr-facts { display: flex; gap: var(--s-3); align-items: center; margin-bottom: var(--s-4); font-size: var(--t-sm); flex-wrap: wrap; }

.dr-token {
  background: linear-gradient(135deg, oklch(from var(--brand) l c h / 0.10), transparent);
  border: 1px solid oklch(from var(--brand) l c h / 0.25);
  border-radius: var(--r-md); padding: var(--s-4); margin-bottom: var(--s-4);
}
.dr-token-label { font-size: 10px; font-weight: 700; letter-spacing: 0.10em; text-transform: uppercase; color: var(--brand); margin: 0 0 6px; }
.dr-token-row { display: flex; align-items: center; gap: var(--s-3); }
.dr-token-value { font-size: var(--t-lg); font-weight: 700; letter-spacing: 0.08em; flex: 1; word-break: break-all; }

.dr-block { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-md); padding: var(--s-4); margin-bottom: var(--s-3); }
.dr-block-title { font-size: 10px; font-weight: 700; letter-spacing: 0.10em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 var(--s-3); }
.dr-dl { display: grid; grid-template-columns: 110px 1fr; gap: 4px var(--s-3); margin: 0; font-size: var(--t-sm); }
.dr-dl dt { color: var(--text-muted); }
.dr-dl dd { margin: 0; word-break: break-word; }

/* Timeline */
.timeline { list-style: none; margin: 0; padding: 0; }
.tl-step { display: flex; gap: var(--s-3); position: relative; padding-bottom: var(--s-4); }
.tl-step:not(.last)::before {
  content: ''; position: absolute; left: 9px; top: 20px; bottom: 0;
  width: 2px; background: var(--border);
}
.tl-step.done:not(.last)::before { background: oklch(from var(--brand) l c h / 0.40); }
.tl-dot {
  width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
  border: 2px solid var(--border-strong); background: var(--surface);
  display: grid; place-items: center; color: var(--text-muted); z-index: 1;
}
.tl-dot.done { border-color: var(--brand); background: var(--brand); color: white; }
.tl-dot.fail { border-color: var(--danger); background: var(--danger); color: white; font-weight: 700; font-size: 11px; }
.tl-body { display: flex; flex-direction: column; gap: 2px; padding-top: 1px; }
.tl-label { font-size: var(--t-sm); color: var(--text); }
.tl-at { font-size: 10px; color: var(--text-muted); }

.ledger-list { list-style: none; margin: 0; padding: 0; }
.ledger-row { display: grid; grid-template-columns: 90px 1fr auto; gap: var(--s-3); align-items: center; padding: 8px 0; border-top: 1px solid var(--border); font-size: var(--t-xs); }
.ledger-row:first-child { border-top: none; }
.ledger-when { color: var(--text-muted); }
.ledger-type { font-weight: 600; }
.ledger-amt { font-weight: 700; }
.ledger-amt.credit { color: var(--brand); }
.ledger-amt.debit { color: var(--text); }

.dr-actions { display: flex; gap: var(--s-2); margin-top: var(--s-4); }

.drawer-enter-active, .drawer-leave-active { transition: opacity 0.20s var(--ease-out); }
.drawer-enter-active .drawer, .drawer-leave-active .drawer { transition: transform 0.22s var(--ease-out); }
.drawer-enter-from { opacity: 0; }
.drawer-enter-from .drawer { transform: translateX(40px); }
.drawer-leave-to { opacity: 0; }
.drawer-leave-to .drawer { transform: translateX(40px); }

:deep(.cd-body) .cd-input-label { display: block; font-size: var(--t-xs); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px; }
:deep(.cd-body) .cd-input { width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-md); padding: 10px 12px; color: var(--text); font-size: var(--t-sm); font-family: inherit; resize: vertical; }
:deep(.cd-body) .cd-input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
:deep(.cd-body) .cd-input-hint { font-size: var(--t-xs); color: var(--text-muted); margin: 6px 0 0; }

@media (max-width: 640px) {
  .filter-grid { grid-template-columns: 1fr; }
  .drawer { width: 100%; padding: var(--s-4); }
  .dr-dl { grid-template-columns: 1fr; }
  .dr-dl dt { font-weight: 700; margin-top: var(--s-2); }
}
</style>
