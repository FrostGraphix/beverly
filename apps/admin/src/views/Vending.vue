<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, naira, shortDate } from '../lib/api';
import { printReceipt, purchaseReceipt, viewReceipt } from '../lib/receipts';

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

const items      = ref<Purchase[]>([]);
const stations   = ref<Station[]>([]);
const status     = ref('');
const station    = ref('');
const meterType  = ref('');
const q          = ref('');
const loading    = ref(false);
const error      = ref('');
const nextCursor = ref<string | null>(null);
const loadingMore = ref(false);
const PAGE = 100;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function statusBadge(s: string) {
    if (s === 'delivered') return 'success';
    if (s === 'failed') return 'danger';
    if (s === 'dispatching' || s === 'hold_active') return 'info';
    if (s === 'delivery_pending_review' || s === 'reversed') return 'warn';
    return 'neutral';
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

watch([status, station, meterType], () => load());

onMounted(async () => {
    await Promise.all([load(), loadStations()]);
    pollTimer = setInterval(load, 30_000);
});
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer); });
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
        <p class="bw-page-sub vm-sub">{{ items.length }} most-recent purchases · refreshes every 30 s</p>
      </div>
      <button class="bw-btn sm vm-refresh" :disabled="loading" @click="load">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="loading ? 'animation: spin .7s linear infinite' : ''"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
        Refresh
      </button>
    </div>

    <!-- Filters -->
    <div class="bw-card" style="padding: var(--s-3) var(--s-4); display:flex; flex-wrap:wrap; gap: var(--s-2); margin-bottom: var(--s-4)">
      <input
        class="bw-input bw-mono"
        v-model="q"
        placeholder="Search meter / customerâ€¦"
        style="flex:1; min-width:180px"
        @keyup.enter="load"
      />
      <select class="bw-select" v-model="status" style="min-width:150px">
        <option value="">All statuses</option>
        <option value="delivered">Delivered</option>
        <option value="failed">Failed</option>
        <option value="dispatching">Dispatching</option>
        <option value="hold_active">Hold active</option>
        <option value="delivery_pending_review">Pending review</option>
        <option value="reversed">Reversed</option>
      </select>
      <select class="bw-select" v-model="station" style="min-width:140px">
        <option value="">All stations</option>
        <option v-for="s in stations" :key="s.stationId" :value="s.stationId">{{ s.name || s.stationId }}</option>
      </select>
      <select class="bw-select" v-model="meterType" style="min-width:140px">
        <option value="">All phases</option>
        <option value="single_phase">Single Phase</option>
        <option value="three_phase">Three Phase</option>
      </select>
    </div>

    <div v-if="error" class="bw-error-banner" role="alert" style="margin-bottom: var(--s-4)">{{ error }}</div>

    <!-- Table -->
    <div class="bw-card" style="padding:0">
      <div class="bw-t-wrap">
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
                <span :class="['bw-badge', statusBadge(p.status)]">{{ p.status.replace(/_/g, ' ') }}</span>
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
              <span :class="['bw-badge', statusBadge(p.status)]">{{ p.status.replace(/_/g, ' ') }}</span>
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

.vm-refresh {
  flex: 0 0 auto;
  white-space: nowrap;
}
.receipt-actions {
  display: inline-flex;
  gap: 4px;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .vm-head {
    align-items: flex-start;
  }

  .vm-sub {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}
</style>

