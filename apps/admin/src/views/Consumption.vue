<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, naira } from '../lib/api';
import WalletPagination from '@beverly/tokens/WalletPagination.vue';
import { DEFAULT_PAGE_SIZE, paginate } from '@beverly/tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AggRow {
    scope:               string;
    scope_id:            string;
    period_type:         string;
    period_start:        string;
    kwh_total:           number;
    reading_count:       number;
    transaction_count?:  number;
    /** Paid through the Beverly wallet. */
    amount_minor_total:  number;
    /** Energy consumed, valued at the tariff in force. */
    energy_value_minor?: number;
    priced_kwh?:         number;
    unpriced_kwh?:       number;
    meter_id?:           string;
    customer_id?:        string | null;
    customer_name?:      string | null;
    last_refreshed_at:   string;
}

interface Station { stationId: string; name: string; }

// ── State ─────────────────────────────────────────────────────────────────────

type Period = 'day' | 'week' | 'month' | 'year';

const PERIODS: { label: string; value: Period }[] = [
    { label: 'Daily',   value: 'day'   },
    { label: 'Weekly',  value: 'week'  },
    { label: 'Monthly', value: 'month' },
    { label: 'Yearly',  value: 'year'  },
];

const period        = ref<Period>('month');
const selectedStn   = ref('');      // '' = cumulative
const drillMeter    = ref('');      // '' = no drill-down open

const stations      = ref<Station[]>([]);
const stationRows   = ref<AggRow[]>([]);  // station-level table rows
const cumulRows     = ref<AggRow[]>([]);  // cumulative rows
const meterRows     = ref<AggRow[]>([]);  // meter breakdown for selected station
const refreshedAt   = ref('');

const loading       = ref(false);
const meterLoading  = ref(false);
const refreshing    = ref(false);
const error         = ref('');
const stationError  = ref('');
const meterError    = ref('');
const meterTruncated = ref(false);
const refreshInfo   = ref('');

// ── Date helpers ──────────────────────────────────────────────────────────────

function periodLabel(row: AggRow): string {
    const d = new Date(row.period_start + 'T00:00:00');
    if (row.period_type === 'day')   return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
    if (row.period_type === 'week')  return `Wk of ${d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    if (row.period_type === 'month') return d.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
    if (row.period_type === 'year')  return String(d.getFullYear());
    return row.period_start;
}

function fmtKwh(v: number): string {
    return v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kWh';
}

function fmtTs(iso: string): string {
    try { return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return iso; }
}

function readingCount(row: AggRow): number {
    return Number(row.reading_count ?? row.transaction_count ?? 0);
}

function energyValue(row: AggRow): number {
    return Number(row.energy_value_minor ?? 0);
}

// ── Station name lookup ───────────────────────────────────────────────────────

const stationMap = computed(() => {
    // Keyed on the canonical (upper-cased) id so a differently-cased station
    // name from the registry still resolves against aggregate rows.
    const m: Record<string, string> = {};
    for (const s of stations.value) {
        const id = String(s.stationId ?? '').trim().toUpperCase();
        if (id) m[id] = s.name || id;
    }
    return m;
});

function stnName(id: string): string {
    return stationMap.value[id] ?? id;
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadStations() {
    stationError.value = '';
    try {
        const r = await api.get<{ stations: Station[] }>('/api/v1/admin/stations');
        stations.value = r.stations ?? [];
    } catch (e: any) {
        stationError.value = e.message ?? 'Station names unavailable.';
    }
}

// Period tabs and station selection can both be clicked faster than the API
// answers. Without these guards a slow earlier response repaints over a newer
// one, so the table and the selected period disagree.
let dataRequestId = 0;
let meterRequestId = 0;

async function loadData() {
    const requestId = ++dataRequestId;
    loading.value = true;
    error.value   = '';
    refreshInfo.value = '';
    try {
        const [stnRes, cumRes] = await Promise.all([
            api.get<{ rows: AggRow[] }>(`/api/v1/admin/consumption?scope=station&period=${period.value}&limit=500&spend=true`),
            api.get<{ rows: AggRow[] }>(`/api/v1/admin/consumption?scope=cumulative&scope_id=ALL&period=${period.value}&limit=120&spend=true`),
        ]);
        if (requestId !== dataRequestId) return;
        stationRows.value  = stnRes.rows ?? [];
        cumulRows.value    = cumRes.rows ?? [];

        const sample = [...(stnRes.rows ?? []), ...(cumRes.rows ?? [])].find(r => r.last_refreshed_at);
        refreshedAt.value  = sample?.last_refreshed_at ?? '';

        // Reset meter drill-down when period changes
        meterRows.value = [];
        drillMeter.value = '';
        if (selectedStn.value) await loadMeterBreakdown();
    } catch (e: any) {
        if (requestId !== dataRequestId) return;
        error.value = e.message ?? 'Failed to load consumption data.';
    } finally {
        if (requestId === dataRequestId) loading.value = false;
    }
}

async function loadMeterBreakdown() {
    const requestId = ++meterRequestId;
    if (!selectedStn.value) { meterRows.value = []; return; }
    meterLoading.value = true;
    meterError.value = '';
    try {
        const r = await api.get<{ rows: AggRow[]; meterCount?: number; truncated?: boolean }>(
            `/api/v1/admin/consumption/meters?station_id=${encodeURIComponent(selectedStn.value)}&period=${period.value}&spend=true`
        );
        if (requestId !== meterRequestId) return;
        meterRows.value = r.rows ?? [];
        meterTruncated.value = Boolean(r.truncated);
    } catch (e: any) {
        if (requestId !== meterRequestId) return;
        meterRows.value = [];
        meterTruncated.value = false;
        meterError.value = e.message ?? 'Meter data unavailable.';
    }
    finally { if (requestId === meterRequestId) meterLoading.value = false; }
}

async function triggerRefresh() {
    refreshing.value = true;
    refreshInfo.value = '';
    error.value = '';
    try {
        // With no station selected we send no list at all: the server resolves
        // the full estate from the database, which stays correct when a station
        // is onboarded after this page was loaded.
        const body = selectedStn.value ? { stationIds: [selectedStn.value] } : {};
        const result = await api.post('/api/v1/admin/consumption/refresh', body) as {
            ok?: boolean;
            refreshedStations?: number;
            failedStations?: number;
            stations?: Array<{ stationId: string; ok: boolean; error?: string }>;
        };
        const refreshed = Number(result?.refreshedStations ?? 0);
        const failed = Number(result?.failedStations ?? 0);
        await loadData();
        if (failed > 0) {
            const names = (result?.stations ?? []).filter((s) => !s.ok).map((s) => s.stationId).join(', ');
            error.value = `Rebuild finished with failures: ${refreshed} station(s) refreshed, ${failed} failed${names ? ` (${names})` : ''}.`;
        } else {
            refreshInfo.value = `Rebuild finished: ${refreshed} station(s) refreshed.`;
        }
    } catch (e: any) {
        error.value = e.message ?? 'Refresh failed.';
    } finally {
        refreshing.value = false;
    }
}

// ── Station table: group by station, show each period ────────────────────────

const stationPeriods = computed(() => {
    // Group rows by scope_id, keeping them in date order (API returns desc)
    const map = new Map<string, AggRow[]>();
    for (const r of stationRows.value) {
        if (!map.has(r.scope_id)) map.set(r.scope_id, []);
        map.get(r.scope_id)!.push(r);
    }
    return map;
});

// Every station the platform knows about, not only those that already have
// aggregate rows for the selected period. A station with no data still has to
// be listable and selectable — otherwise the one station whose aggregates are
// stale is precisely the one nobody can rebuild.
const uniqueStations = computed(() => {
    const ids = new Set<string>();
    for (const station of stations.value) {
        const id = String(station.stationId ?? '').trim().toUpperCase();
        if (id) ids.add(id);
    }
    for (const id of stationPeriods.value.keys()) if (id) ids.add(id);
    return [...ids].sort();
});

// Totals for each station (all periods summed — used for summary card)
const stationTotals = computed(() => {
    const out: Record<string, { kwh: number; readings: number; amount: number; value: number }> = {};
    for (const [sid, rows] of stationPeriods.value) {
        out[sid] = rows.reduce((a, r) => ({
            kwh:    a.kwh    + (r.kwh_total || 0),
            readings: a.readings + readingCount(r),
            amount: a.amount + (r.amount_minor_total || 0),
            value:  a.value  + energyValue(r),
        }), { kwh: 0, readings: 0, amount: 0, value: 0 });
    }
    return out;
});

// Periods sorted ascending for display
function rowsForStation(sid: string): AggRow[] {
    return [...(stationPeriods.value.get(sid) ?? [])].sort((a, b) => a.period_start.localeCompare(b.period_start));
}

// Meter rows for expanded station, sorted by period
const metersByMeter = computed(() => {
    const map = new Map<string, AggRow[]>();
    for (const r of meterRows.value) {
        if (!map.has(r.scope_id)) map.set(r.scope_id, []);
        map.get(r.scope_id)!.push(r);
    }
    return map;
});

const uniqueMeters = computed(() => [...metersByMeter.value.keys()]);

function rowsForMeter(mid: string): AggRow[] {
    return [...(metersByMeter.value.get(mid) ?? [])].sort((a, b) => a.period_start.localeCompare(b.period_start));
}

/** Customer identity travels on the aggregate rows; show the first non-blank. */
function meterCustomer(mid: string): string {
    for (const row of metersByMeter.value.get(mid) ?? []) {
        const name = (row.customer_name ?? '').trim();
        if (name) return name;
    }
    return '';
}

function meterCustomerId(mid: string): string {
    for (const row of metersByMeter.value.get(mid) ?? []) {
        const id = (row.customer_id ?? '').trim();
        if (id) return id;
    }
    return '';
}

function meterTotals(mid: string) {
    return rowsForMeter(mid).reduce((a, r) => ({
        kwh:      a.kwh      + (r.kwh_total || 0),
        readings: a.readings + readingCount(r),
        value:    a.value    + energyValue(r),
        amount:   a.amount   + (r.amount_minor_total || 0),
    }), { kwh: 0, readings: 0, value: 0, amount: 0 });
}

// ── Pagination ────────────────────────────────────────────────────────────────
// Every table here can run long: the estate has 13 months of history and the
// largest station carries 726 meters. Ten rows a page, one shared control.

const PAGE_SIZE = DEFAULT_PAGE_SIZE;
const cumulPage   = ref(1);
const stationPage = ref(1);
const meterPage   = ref(1);

function pageSlice<T>(items: T[], page: number): T[] {
    return paginate(items, page, PAGE_SIZE);
}

const cumulSorted = computed(
    () => [...cumulRows.value].sort((a, b) => a.period_start.localeCompare(b.period_start)),
);
const cumulPaged = computed(() => pageSlice(cumulSorted.value, cumulPage.value));

const stationPeriodRows = computed(() => (selectedStn.value ? rowsForStation(selectedStn.value) : []));
const stationPeriodPaged = computed(() => pageSlice(stationPeriodRows.value, stationPage.value));

const uniqueMetersPaged = computed(() => pageSlice(uniqueMeters.value, meterPage.value));

// ── Watchers ──────────────────────────────────────────────────────────────────

watch(period, () => {
    // A new period is a different dataset; keeping page 7 would show an empty
    // table with no obvious way back.
    cumulPage.value = 1;
    stationPage.value = 1;
    meterPage.value = 1;
    loadData();
});
watch(selectedStn, () => {
    stationPage.value = 1;
    meterPage.value = 1;
    drillMeter.value = '';
    loadMeterBreakdown();
});

// ── Mount ─────────────────────────────────────────────────────────────────────

onMounted(() => Promise.all([loadStations(), loadData()]));
</script>

<template>
  <AppShell title="Consumption Analytics">

    <!-- Header -->
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: var(--s-4); margin-bottom: var(--s-4); flex-wrap:wrap">
      <div>
        <p class="bw-page-title" style="margin:0">Consumption Analytics</p>
        <p class="bw-page-sub" style="margin:0">
          Pre-aggregated meter usage · refreshes every 6 h
          <span v-if="refreshedAt" class="bw-muted"> · Last refresh: {{ fmtTs(refreshedAt) }}</span>
        </p>
      </div>
      <div style="display:flex; gap: var(--s-2); align-items:center; flex-wrap:wrap">
        <!-- Period tabs -->
        <div class="bw-seg" aria-label="Aggregation period">
          <button
            v-for="p in PERIODS" :key="p.value"
            :class="['bw-seg-btn', { active: period === p.value }]"
            :aria-pressed="period === p.value"
            :disabled="loading || refreshing"
            @click="period = p.value"
          >{{ p.label }}</button>
        </div>
        <button class="bw-btn bw-btn-sm" :disabled="refreshing || loading" @click="triggerRefresh">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="refreshing ? 'animation:spin .7s linear infinite' : ''"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          {{ refreshing ? 'Rebuilding…' : 'Rebuild aggregates' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="bw-error-banner" role="alert" style="margin-bottom: var(--s-4)">
      <span>{{ error }}</span>
      <button class="bw-btn bw-btn-sm" @click="loadData">Try again</button>
    </div>
    <div v-else-if="stationError" class="bw-error-banner" role="status" style="margin-bottom: var(--s-4)">{{ stationError }}</div>
    <div v-else-if="refreshInfo" class="bw-success-banner" role="status" style="margin-bottom: var(--s-4)">{{ refreshInfo }}</div>

    <!-- Loading skeleton -->
    <div v-if="loading" style="text-align:center; padding: var(--s-10)">
      <div class="bw-spinner" style="margin:auto" />
    </div>

    <template v-else>

      <!-- ── Cumulative system-wide card ──────────────────────────────────── -->
      <div class="bw-card" style="margin-bottom: var(--s-4); padding: var(--s-4)">
        <p style="font-weight:600; margin:0 0 var(--s-3)">System-wide totals (all periods shown)</p>
        <div class="bw-t-wrap">
          <table class="bw-table">
            <thead>
              <tr>
                <th>Period</th>
                <th style="text-align:right">Meter Usage</th>
                <th style="text-align:right">Readings</th>
                <th style="text-align:right">Energy value</th>
                <th style="text-align:right">Wallet spend</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!cumulRows.length">
                <td colspan="5" class="bw-muted" style="text-align:center; padding: var(--s-6)">No data for this period.</td>
              </tr>
              <tr v-for="r in cumulPaged" :key="`${r.scope_id}-${r.period_start}`">
                <td class="bw-mono" style="font-size: var(--t-xs)">{{ periodLabel(r) }}</td>
                <td class="bw-money" style="text-align:right; font-weight:600">{{ fmtKwh(r.kwh_total) }}</td>
                <td style="text-align:right">{{ readingCount(r).toLocaleString('en-NG') }}</td>
                <td class="bw-money" style="text-align:right">{{ naira(energyValue(r)) }}</td>
                <td class="bw-money" style="text-align:right">{{ naira(r.amount_minor_total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <WalletPagination v-model:page="cumulPage" :total="cumulSorted.length" :page-size="PAGE_SIZE" item-label="periods" />
      </div>

      <!-- ── Station breakdown ─────────────────────────────────────────────── -->
      <div class="bw-card" style="padding:0; margin-bottom: var(--s-4)">
        <div style="padding: var(--s-3) var(--s-4); border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap: var(--s-2)">
          <p style="font-weight:600; margin:0">By station · {{ period }}</p>
          <select class="bw-select" v-model="selectedStn" aria-label="Filter by station" style="min-width:180px">
            <option value="">— All stations —</option>
            <option v-for="sid in uniqueStations" :key="sid" :value="sid">{{ stnName(sid) }}</option>
          </select>
        </div>

        <div v-if="!uniqueStations.length" class="bw-muted" style="text-align:center; padding: var(--s-8)">
          No station data for this period.
        </div>

        <!-- Station summary cards -->
        <div v-else style="display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap: var(--s-3); padding: var(--s-4)">
          <button
            v-for="sid in uniqueStations"
            :key="sid"
            :class="['bw-stat-card', { selected: selectedStn === sid }]"
            type="button"
            :aria-pressed="selectedStn === sid"
            @click="selectedStn = selectedStn === sid ? '' : sid"
          >
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: var(--s-1)">
              <span style="font-weight:600; font-size: var(--t-sm)">{{ stnName(sid) }}</span>
              <svg v-if="selectedStn === sid" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="bw-mono" style="font-size: var(--t-xl); font-weight:700; color:var(--brand)">
              {{ fmtKwh(stationTotals[sid]?.kwh ?? 0) }}
            </div>
            <div style="display:flex; gap: var(--s-4); margin-top: var(--s-1); font-size: var(--t-xs); color: var(--text-muted)">
              <span>{{ (stationTotals[sid]?.readings ?? 0).toLocaleString('en-NG') }} readings</span>
              <span>{{ naira(stationTotals[sid]?.amount ?? 0) }}</span>
            </div>
          </button>
        </div>

        <!-- Period table for selected station -->
        <div v-if="selectedStn" style="border-top:1px solid var(--border)">
          <div style="padding: var(--s-3) var(--s-4); font-weight:600; font-size: var(--t-sm)">
            {{ stnName(selectedStn) }} — period breakdown
          </div>
          <div class="bw-t-wrap">
            <table class="bw-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th style="text-align:right">Meter Usage</th>
                  <th style="text-align:right">Readings</th>
                  <th style="text-align:right">Energy value</th>
                  <th style="text-align:right">Wallet spend</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in stationPeriodPaged" :key="r.period_start">
                  <td class="bw-mono" style="font-size: var(--t-xs)">{{ periodLabel(r) }}</td>
                  <td class="bw-money" style="text-align:right; font-weight:600">{{ fmtKwh(r.kwh_total) }}</td>
                  <td style="text-align:right">{{ readingCount(r).toLocaleString('en-NG') }}</td>
                  <td class="bw-money" style="text-align:right">{{ naira(energyValue(r)) }}</td>
                  <td class="bw-money" style="text-align:right">{{ naira(r.amount_minor_total) }}</td>
                </tr>
                <tr v-if="!stationPeriodRows.length">
                  <td colspan="5" class="bw-muted" style="text-align:center; padding: var(--s-5)">No data.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <WalletPagination v-model:page="stationPage" :total="stationPeriodRows.length" :page-size="PAGE_SIZE" item-label="periods" />
        </div>
      </div>

      <!-- ── Meter breakdown (drill-down) ─────────────────────────────────── -->
      <div v-if="selectedStn" class="bw-card" style="padding:0">
        <div style="padding: var(--s-3) var(--s-4); border-bottom:1px solid var(--border)">
          <p style="font-weight:600; margin:0">Meter breakdown — {{ stnName(selectedStn) }} · {{ period }}</p>
          <p class="bw-muted" style="font-size: var(--t-xs); margin:0">One section per meter. Select a meter ID to expand its periods.</p>
        </div>

        <div v-if="meterLoading" style="text-align:center; padding: var(--s-8)">
          <div class="bw-spinner" style="margin:auto" />
        </div>
        <div v-else-if="meterError" class="bw-error-banner" role="alert" style="margin: var(--s-4)">
          <span>{{ meterError }}</span>
          <button class="bw-btn bw-btn-sm" @click="loadMeterBreakdown">Try again</button>
        </div>
        <div v-else-if="!uniqueMeters.length" class="bw-muted" style="text-align:center; padding: var(--s-8)">
          No meter data for this station / period.
        </div>

        <template v-else>
          <div v-if="meterTruncated" class="bw-error-banner" role="status" style="margin: var(--s-4)">
            Showing {{ uniqueMeters.length.toLocaleString('en-NG') }} meters — this station has more data than one
            page holds for the selected period. Choose a coarser period to see the whole site.
          </div>
          <div v-for="mid in uniqueMetersPaged" :key="mid" style="border-bottom:1px solid var(--border)">
            <!-- Meter header -->
            <button
              class="meter-header"
              type="button"
              :aria-expanded="drillMeter === mid"
              @click="drillMeter = drillMeter === mid ? '' : mid"
            >
              <div style="display:flex; align-items:center; gap: var(--s-3); min-width:0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline v-if="drillMeter === mid" points="18 15 12 9 6 15"/>
                  <polyline v-else points="6 9 12 15 18 9"/>
                </svg>
                <span style="display:flex; flex-direction:column; gap:2px; min-width:0; text-align:left">
                  <span class="bw-mono" style="font-weight:600">{{ mid }}</span>
                  <span class="meter-customer">
                    {{ meterCustomer(mid) || 'Unassigned meter' }}
                    <span v-if="meterCustomerId(mid) && meterCustomerId(mid) !== mid" class="bw-mono"> · {{ meterCustomerId(mid) }}</span>
                  </span>
                </span>
              </div>
              <div style="display:flex; gap: var(--s-5); font-size: var(--t-xs); align-items:center; flex-shrink:0">
                <span class="bw-money" style="font-weight:600; color:var(--brand)">
                  {{ fmtKwh(meterTotals(mid).kwh) }}
                </span>
                <span class="bw-money" style="font-weight:600">{{ naira(meterTotals(mid).value) }}</span>
                <span class="bw-muted">{{ meterTotals(mid).readings.toLocaleString('en-NG') }} readings</span>
              </div>
            </button>

            <!-- Expanded period table -->
            <div v-if="drillMeter === mid" class="meter-detail">
              <table class="bw-table" style="font-size: var(--t-xs)">
                <thead>
                  <tr>
                    <th style="padding-left: var(--s-8)">Period</th>
                    <th style="text-align:right">kWh</th>
                    <th style="text-align:right">Readings</th>
                    <th style="text-align:right">Energy value</th>
                    <th style="text-align:right">Wallet spend</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in rowsForMeter(mid)" :key="r.period_start">
                    <td class="bw-mono" style="padding-left: var(--s-8)">{{ periodLabel(r) }}</td>
                    <td class="bw-money" style="text-align:right">{{ fmtKwh(r.kwh_total) }}</td>
                    <td style="text-align:right">{{ readingCount(r).toLocaleString('en-NG') }}</td>
                    <td class="bw-money" style="text-align:right">{{ naira(energyValue(r)) }}</td>
                    <td class="bw-money" style="text-align:right">{{ naira(r.amount_minor_total) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <WalletPagination v-model:page="meterPage" :total="uniqueMeters.length" :page-size="PAGE_SIZE" item-label="meters" />
        </template>
      </div>

    </template>

  </AppShell>
</template>

<style scoped>
@keyframes spin { to { transform: rotate(360deg); } }
.bw-spinner { width: 24px; height: 24px; border: 2.5px solid var(--border); border-top-color: var(--brand); border-radius: 50%; animation: spin 0.7s linear infinite; }

/* Segmented control */
.bw-seg { display:flex; border:1px solid var(--border); border-radius: var(--radius); overflow:hidden; }
.bw-seg-btn { padding: 4px 12px; font-size: var(--t-xs); background:transparent; border:none; cursor:pointer; color: var(--text-muted); font-weight:500; }
.bw-seg-btn.active { background: var(--brand); color:#fff; }
.bw-seg-btn:disabled { cursor:not-allowed; opacity:.65; }

/* Station summary card */
.bw-stat-card {
  width: 100%;
  text-align: left;
  color: inherit;
  background: transparent;
  cursor: pointer;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--s-3) var(--s-4);
  transition: border-color .15s, box-shadow .15s;
}
.bw-stat-card:hover { border-color: var(--brand); }
.bw-stat-card.selected { border-color: var(--brand); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 20%, transparent); }
.bw-stat-card:focus-visible,
.meter-header:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

/* Expanded meter periods. This used to name a custom property that no
   stylesheet defines, with a light hex as the fallback — so in every dark theme
   the fallback won and the drawer rendered as a white slab. surface-2 is a real
   token and flips with the theme. */
.meter-detail { background: var(--surface-2); border-top: 1px solid var(--border); }
.meter-customer { color: var(--text-muted); font-size: var(--t-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meter-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--s-3) var(--s-4);
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
</style>
