<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import { api, naira, shortDate } from '../lib/api';
import { printReceipt, purchaseReceipt, viewReceipt } from '../lib/receipts';
import { useStaffAuthStore } from '../stores/auth';

interface Purchase {
    id: string;
    actor_id: string;
    customer_name: string | null;
    meter_id: string;
    meter_type: 'single_phase' | 'three_phase' | null;
    station_id: string | null;
    amount_minor: number;
    energy_amount_minor?: number | null;
    vat_amount_minor?: number | null;
    vat_rate_basis_points?: number | null;
    units_kwh: number | null;
    purchase_mode: string;
    status: string;
    delivery_state: string | null;
    created_at: string;
    failure_reason: string | null;
}

interface Station { stationId: string; name: string; }
interface RecoveryPayment {
    id: string;
    reference: string;
    amountMinor: number;
    gatewayChargedMinor: number;
    gatewayFeeMinor: number;
    blockedReason: string | null;
    blockedDetail: string | null;
    attempts: number;
    createdAt: string;
    meterId: string | null;
    customerName: string | null;
    tokenGenerated: boolean;
}

const auth = useStaffAuthStore();
const items      = ref<Purchase[]>([]);
const stations   = ref<Station[]>([]);
const status     = ref('');
const station    = ref('');
const meterType  = ref('');
const q          = ref('');
const filtersOpen = ref(false);
const loading    = ref(false);
const error      = ref('');
const nextCursor = ref<string | null>(null);
const loadingMore = ref(false);
const cardView = ref<'table' | 'list'>('table');
const recoveryItems = ref<RecoveryPayment[]>([]);
const recoveryLoading = ref(false);
const retryingId = ref<string | null>(null);
const recoveryNotice = ref<{ tone: 'success' | 'error'; text: string } | null>(null);
const canRetryRecovery = computed(() => auth.hasPermission('wallet.funding.approve'));
const activeFilterCount = computed(() => [q.value.trim(), status.value, station.value, meterType.value].filter(Boolean).length);
const PAGE = 100;
const POLL_INTERVAL_MS = 5_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function statusBadge(s: string) {
    if (s === 'delivered') return 'success';
    if (s === 'failed') return 'danger';
    if (s === 'dispatching' || s === 'hold_active') return 'info';
    if (s === 'delivery_pending_review' || s === 'reversed') return 'warn';
    return 'neutral';
}

function statusLabel(p: Purchase) {
    if (p.status === 'delivered') return 'Token ready';
    if (p.failure_reason?.includes('payment_amount_mismatch')) return 'Payment needs review';
    if (p.delivery_state === 'token_generated_needs_reconciliation') return 'Token generated; reconciling';
    if (p.delivery_state === 'awaiting_payment') return 'Payment awaiting confirmation';
    return p.status.replace(/_/g, ' ');
}

function meterTypeLabel(type?: string | null) {
    if (type === 'three_phase') return 'Three Phase';
    if (type === 'single_phase') return 'Single Phase';
    return 'Unknown';
}

function viewVendReceipt(p: Purchase) {
    viewReceipt(purchaseReceipt(p));
}

function printVendReceipt(p: Purchase) {
    printReceipt(purchaseReceipt(p));
}

function buildParams(cursor?: string) {
    const p = new URLSearchParams();
    if (status.value)  p.set('status', status.value);
    if (station.value) p.set('station', station.value);
    if (meterType.value) p.set('meterType', meterType.value);
    if (q.value.trim()) p.set('q', q.value.trim());
    p.set('limit', String(PAGE));
    if (cursor) p.set('cursor', cursor);
    return p.toString();
}

async function load() {
    loading.value = true;
    error.value = '';
    nextCursor.value = null;
    try {
        const r = await api.get<{ purchases: Purchase[]; nextCursor: string | null }>(
            `/api/v1/admin/purchases?${buildParams()}`
        );
        items.value = r.purchases;
        nextCursor.value = r.nextCursor;
    } catch (e: any) {
        error.value = e.message ?? 'Vending monitor failed to load.';
    } finally { loading.value = false; }
}

async function loadMore() {
    if (!nextCursor.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
        const r = await api.get<{ purchases: Purchase[]; nextCursor: string | null }>(
            `/api/v1/admin/purchases?${buildParams(nextCursor.value)}`
        );
        items.value.push(...r.purchases);
        nextCursor.value = r.nextCursor;
    } catch { /* noop */ } finally { loadingMore.value = false; }
}

async function loadStations() {
    try {
        const r = await api.get<{ stations: Station[] }>('/api/v1/admin/stations');
        stations.value = r.stations ?? [];
    } catch { /* use empty */ }
}

function clearFilters() {
    q.value = '';
    status.value = '';
    station.value = '';
    meterType.value = '';
    void load();
}

async function loadRecovery() {
    recoveryLoading.value = true;
    try {
        const response = await api.get<{ payments: RecoveryPayment[] }>('/api/v1/admin/vending/payment-recovery');
        recoveryItems.value = response.payments ?? [];
    } catch (e: any) {
        recoveryNotice.value = { tone: 'error', text: e?.message ?? 'Recovery queue failed to load.' };
    } finally {
        recoveryLoading.value = false;
    }
}

async function retryRecovery(payment: RecoveryPayment) {
    if (!canRetryRecovery.value || retryingId.value) return;
    retryingId.value = payment.id;
    recoveryNotice.value = null;
    try {
        const result = await api.post<{ fulfillmentStatus: string; reason?: string }>(
            `/api/v1/admin/payments/${payment.id}/retry-fulfillment`,
            {},
        );
        recoveryNotice.value = result.fulfillmentStatus === 'fulfilled'
            ? { tone: 'success', text: `Token delivery recovered for ${payment.reference}.` }
            : { tone: 'error', text: `Recovery remains held: ${result.reason ?? result.fulfillmentStatus}.` };
        await Promise.all([load(), loadRecovery()]);
    } catch (e: any) {
        recoveryNotice.value = { tone: 'error', text: e?.message ?? 'Recovery failed.' };
    } finally {
        retryingId.value = null;
    }
}

watch([status, station, meterType], () => load());
watch(q, () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void load(), 300);
});

onMounted(async () => {
    await Promise.all([load(), loadStations(), loadRecovery()]);
    pollTimer = setInterval(() => {
        if (!loading.value) void load();
        if (!recoveryLoading.value) void loadRecovery();
    }, POLL_INTERVAL_MS);
});
onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (searchTimer) clearTimeout(searchTimer);
});
</script>

<template>
  <AppShell title="Vending Monitor">

    <!-- Header -->
    <div class="vm-head">
      <div class="vm-head-text">
        <p class="bw-page-title vm-title">
          Vending Monitor
          <span class="bw-live-tag vm-live-tag">
            <span class="bw-live-dot" />LIVE
          </span>
        </p>
        <p class="bw-page-sub vm-sub">{{ items.length }} most-recent purchases · updates automatically</p>
      </div>
    </div>

    <section v-if="recoveryItems.length || recoveryLoading" class="bw-card recovery-panel" aria-labelledby="recovery-title">
      <div class="recovery-head">
        <div>
          <p id="recovery-title" class="recovery-title">Token payment recovery</p>
          <p class="bw-muted recovery-copy">Paystack confirmed payment. Token delivery remains incomplete.</p>
        </div>
        <span class="bw-badge warn">{{ recoveryItems.length }} held</span>
      </div>
      <div v-if="recoveryNotice" :class="recoveryNotice.tone === 'success' ? 'bw-success-banner' : 'bw-error-banner'" role="status">
        {{ recoveryNotice.text }}
      </div>
      <div class="recovery-grid">
        <article v-for="payment in recoveryItems" :key="payment.id" class="recovery-item">
          <div>
            <strong class="bw-mono">{{ payment.meterId || payment.reference }}</strong>
            <p class="bw-muted recovery-meta">{{ payment.customerName || 'Customer payment' }} · {{ shortDate(payment.createdAt) }}</p>
            <p v-if="payment.blockedDetail" class="recovery-error">{{ payment.blockedDetail }}</p>
          </div>
          <dl class="recovery-amounts">
            <div><dt>Principal</dt><dd>{{ naira(payment.amountMinor) }}</dd></div>
            <div><dt>Gateway fee</dt><dd>{{ naira(payment.gatewayFeeMinor) }}</dd></div>
            <div><dt>Charged</dt><dd>{{ naira(payment.gatewayChargedMinor) }}</dd></div>
          </dl>
          <div class="recovery-action">
            <span class="bw-badge warn">{{ payment.tokenGenerated ? 'Token saved' : 'Token not generated' }}</span>
            <button
              v-if="canRetryRecovery"
              class="bw-btn sm primary"
              :disabled="Boolean(retryingId)"
              @click="retryRecovery(payment)"
            >{{ retryingId === payment.id ? 'Recovering…' : 'Retry delivery' }}</button>
          </div>
        </article>
      </div>
    </section>

    <div v-if="error" class="bw-error-banner" role="alert" style="margin-bottom: var(--s-4)">{{ error }}</div>

    <!-- Table -->
    <div class="bw-card bw-data-region" :data-view="cardView" style="padding:0">
      <div class="vending-layout-bar">
        <span>Purchase results</span>
        <div class="vending-toolbar-actions">
          <button
            type="button"
            class="bw-btn sm vending-filter-button"
            :class="{ active: filtersOpen || activeFilterCount }"
            :aria-expanded="filtersOpen"
            aria-controls="vending-filters"
            @click="filtersOpen = !filtersOpen"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" />
            </svg>
            <span>Filters</span>
            <span v-if="activeFilterCount" class="filter-count">{{ activeFilterCount }}</span>
          </button>
          <WalletDataViewSwitch v-model="cardView" label="Vending display view" />
        </div>
      </div>
      <div v-if="filtersOpen" id="vending-filters" class="vending-filter-panel">
        <input
          v-model="q"
          class="bw-input bw-mono"
          placeholder="Search meter or customer"
          aria-label="Search purchases"
        />
        <select v-model="status" class="bw-select" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
          <option value="dispatching">Dispatching</option>
          <option value="hold_active">Hold active</option>
          <option value="delivery_pending_review">Pending review</option>
          <option value="reversed">Reversed</option>
        </select>
        <select v-model="station" class="bw-select" aria-label="Filter by station">
          <option value="">All stations</option>
          <option v-for="s in stations" :key="s.stationId" :value="s.stationId">{{ s.name || s.stationId }}</option>
        </select>
        <select v-model="meterType" class="bw-select" aria-label="Filter by phase">
          <option value="">All phases</option>
          <option value="single_phase">Single Phase</option>
          <option value="three_phase">Three Phase</option>
        </select>
        <button v-if="activeFilterCount" type="button" class="bw-btn sm" @click="clearFilters">Clear filters</button>
      </div>
      <div class="bw-t-wrap vending-table-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Vendor</th>
              <th>Customer</th>
              <th>Meter</th>
              <th>Phase</th>
              <th>Station</th>
              <th>Mode</th>
              <th style="text-align:right">Amount</th>
              <th style="text-align:right">VAT</th>
              <th>Status</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading && !items.length">
              <td colspan="11" style="text-align:center; padding: var(--s-8)">
                <div class="bw-spinner" style="margin: auto" />
              </td>
            </tr>
            <tr v-for="p in items" :key="p.id">
              <td class="bw-mono bw-muted" style="font-size: var(--t-xs); white-space:nowrap">{{ shortDate(p.created_at) }}</td>
              <td class="bw-mono" style="font-size: var(--t-xs)">#{{ p.actor_id.slice(0, 8) }}</td>
              <td>{{ p.customer_name || 'â€”' }}</td>
              <td class="bw-mono">{{ p.meter_id }}</td>
              <td>
                <span :class="['bw-badge', p.meter_type === 'three_phase' ? 'info' : 'neutral']">
                  {{ meterTypeLabel(p.meter_type) }}
                </span>
              </td>
              <td>{{ p.station_id || 'â€”' }}</td>
              <td><span class="bw-badge neutral">{{ p.purchase_mode }}</span></td>
              <td class="bw-money" style="text-align:right">{{ naira(p.amount_minor) }}</td>
              <td class="bw-money" style="text-align:right">{{ naira(p.vat_amount_minor ?? 0) }}</td>
              <td>
                <span :class="['bw-badge', statusBadge(p.status)]">{{ statusLabel(p) }}</span>
                <div v-if="p.failure_reason" class="bw-muted" style="font-size: 10px; margin-top: 2px; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ p.failure_reason }}</div>
              </td>
              <td>
                <div class="receipt-actions">
                  <button class="bw-btn sm" @click="viewVendReceipt(p)">View</button>
                  <button class="bw-btn sm" @click="printVendReceipt(p)">Print</button>
                </div>
              </td>
            </tr>
            <tr v-if="!items.length && !loading">
              <td colspan="11" class="bw-muted" style="text-align:center; padding: var(--s-8)">No purchases match your filters.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="bw-t-cards">
        <div v-for="p in items" :key="p.id" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor bw-mono">{{ p.meter_id }}</div>
              <div class="bw-tc-id bw-mono">#{{ p.actor_id.slice(0, 8) }} Â· {{ shortDate(p.created_at) }}</div>
            </div>
            <div class="bw-tc-amt bw-money">{{ naira(p.amount_minor) }}</div>
            <div class="bw-muted" style="font-size: var(--t-xs)">VAT {{ naira(p.vat_amount_minor ?? 0) }}</div>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Status</span>
              <span :class="['bw-badge', statusBadge(p.status)]">{{ statusLabel(p) }}</span>
            </div>
            <div class="bw-tc-pair" v-if="p.station_id">
              <span class="bw-tc-pair-label">Station</span>
              <span class="bw-tc-pair-val">{{ p.station_id }}</span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Phase</span>
              <span :class="['bw-badge', p.meter_type === 'three_phase' ? 'info' : 'neutral']">
                {{ meterTypeLabel(p.meter_type) }}
              </span>
            </div>
            <div class="bw-tc-pair" v-if="p.failure_reason">
              <span class="bw-tc-pair-label">Reason</span>
              <span class="bw-tc-pair-val bw-muted" style="font-size: var(--t-xs)">{{ p.failure_reason }}</span>
            </div>
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Receipt</span>
              <span class="receipt-actions">
                <button class="bw-btn sm" @click="viewVendReceipt(p)">View</button>
                <button class="bw-btn sm" @click="printVendReceipt(p)">Print</button>
              </span>
            </div>
          </div>
        </div>
        <div v-if="!items.length && !loading" class="bw-muted" style="text-align:center; padding: var(--s-8); font-size: var(--t-sm)">
          No purchases match your filters.
        </div>
      </div>

      <!-- Load more -->
      <div v-if="nextCursor" style="padding: var(--s-3) var(--s-5); border-top: 1px solid var(--border); display:flex; justify-content:center">
        <button class="bw-btn" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Loadingâ€¦' : 'Load more' }}
        </button>
      </div>
    </div>

  </AppShell>
</template>

<style scoped>
@keyframes spin { to { transform: rotate(360deg); } }
.bw-spinner { width: 24px; height: 24px; border: 2.5px solid var(--border); border-top-color: var(--brand); border-radius: 50%; animation: spin 0.7s linear infinite; }
.vm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}

.vm-head-text {
  min-width: 0;
  flex: 1;
}

.vm-title {
  margin: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.vm-live-tag {
  margin-left: 0;
}

.vm-sub {
  margin: 0;
  line-height: 1.35;
}

.receipt-actions {
  display: inline-flex;
  gap: 4px;
  white-space: nowrap;
}
.recovery-panel { margin-bottom: var(--s-4); padding: var(--s-4); }
.recovery-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-3); margin-bottom: var(--s-3); }
.recovery-title { margin: 0; font-size: var(--t-lg); font-weight: 800; }
.recovery-copy { margin: 4px 0 0; }
.recovery-grid { display: grid; gap: var(--s-2); margin-top: var(--s-3); }
.recovery-item { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(280px, 1fr) auto; align-items: center; gap: var(--s-4); padding: var(--s-3); border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface-2); }
.recovery-meta { margin: 4px 0 0; font-size: var(--t-xs); }
.recovery-error { margin: 6px 0 0; color: var(--danger); font-size: var(--t-xs); }
.recovery-amounts { display: grid; grid-template-columns: repeat(3, minmax(80px, 1fr)); gap: var(--s-3); margin: 0; }
.recovery-amounts dt { color: var(--text-muted); font-size: var(--t-xs); }
.recovery-amounts dd { margin: 3px 0 0; font-weight: 700; }
.recovery-action { display: flex; align-items: center; justify-content: flex-end; gap: var(--s-2); flex-wrap: wrap; }
.vending-layout-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  border-bottom: 1px solid var(--border);
  font-weight: 700;
}
.vending-toolbar-actions { display: flex; align-items: center; gap: var(--s-2); }
.vending-filter-button svg { width: 17px; height: 17px; }
.vending-filter-button.active { color: var(--brand); border-color: var(--brand); }
.filter-count { min-width: 20px; height: 20px; display: inline-grid; place-items: center; padding: 0 5px; border-radius: var(--r-pill); background: var(--brand); color: var(--surface-1); font-size: var(--t-xs); }
.vending-filter-panel { display: grid; grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(140px, auto)) auto; gap: var(--s-2); padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--border); background: var(--surface-2); }
.vending-view-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
}
.vending-view-toggle button {
  width: 36px;
  height: 34px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.vending-view-toggle button:hover { color: var(--text); }
.vending-view-toggle button.active { background: var(--brand-glow); color: var(--brand); }
.vending-view-toggle svg { width: 17px; height: 17px; }

@media (max-width: 640px) {
  .recovery-item { grid-template-columns: 1fr; gap: var(--s-3); }
  .recovery-amounts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .recovery-action { justify-content: space-between; }
  .vm-head {
    align-items: flex-start;
  }

  .vm-sub {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .vending-layout-bar { align-items: center; }
  .vending-filter-panel { grid-template-columns: 1fr; }
  .vending-filter-button span:not(.filter-count) { display: none; }

  .vending-cards--grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-2);
    padding: var(--s-2);
  }

  .bw-t-wrap ~ .vending-cards--grid { display: grid; }
  .vending-table-wrap.mobile-table-active { display: block; overflow-x: auto; }
  .vending-cards--table { display: none !important; }
  .vending-cards--grid .bw-tc {
    min-width: 0;
    padding: var(--s-3);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    overflow: hidden;
  }
  .vending-cards--grid .bw-tc-top { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .vending-cards--grid .bw-tc-vendor,
  .vending-cards--grid .bw-tc-id,
  .vending-cards--grid .bw-tc-pair-val { overflow-wrap: anywhere; }
  .vending-cards--grid .bw-tc-mid { gap: var(--s-2); }
  .vending-cards--grid .bw-tc-pair { min-width: 0; }
  .vending-cards--grid .receipt-actions { white-space: normal; }
}
</style>

