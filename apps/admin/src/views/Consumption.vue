<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, naira } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AggRow {
    scope:               string;
    scope_id:            string;
    period_type:         string;
    period_start:        string;
    kwh_total:           number;
    transaction_count:   number;
    amount_minor_total:  number;
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

// ── Station name lookup ───────────────────────────────────────────────────────

const stationMap = computed(() => {
    const m: Record<string, string> = {};
    for (const s of stations.value) m[s.stationId] = s.name || s.stationId;
    return m;
});

function stnName(id: string): string {
    return stationMap.value[id] ?? id;
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadStations() {
    try {
        const r = await api.get<{ stations: Station[] }>('/api/v1/admin/stations');
        stations.value = r.stations ?? [];
    } catch { /* silent */ }
}

async function loadData() {
    loading.value = true;
    error.value   = '';
    try {
        const [stnRes, cumRes] = await Promise.all([
            api.get<{ rows: AggRow[] }>(`/api/v1/admin/consumption?scope=station&period=${period.value}&limit=500`),
            api.get<{ rows: AggRow[] }>(`/api/v1/admin/consumption?scope=cumulative&scope_id=ALL&period=${period.value}&limit=120`),
        ]);
        stationRows.value  = stnRes.rows ?? [];
        cumulRows.value    = cumRes.rows ?? [];

        const sample = [...(stnRes.rows ?? []), ...(cumRes.rows ?? [])].find(r => r.last_refreshed_at);
        refreshedAt.value  = sample?.last_refreshed_at ?? '';

        // Reset meter drill-down when period changes
        meterRows.value = [];
        drillMeter.value = '';
        if (selectedStn.value) await loadMeterBreakdown();
    } catch (e: any) {
        error.value = e.message ?? 'Failed to load consumption data.';
    } finally {
        loading.value = false;
    }
}

async function loadMeterBreakdown() {
    if (!selectedStn.value) { meterRows.value = []; return; }
    meterLoading.value = true;
    try {
        const r = await api.get<{ rows: AggRow[] }>(
            `/api/v1/admin/consumption/meters?station_id=${encodeURIComponent(selectedStn.value)}&period=${period.value}`
        );
        meterRows.value = r.rows ?? [];
    } catch { meterRows.value = []; }
    finally { meterLoading.value = false; }
}

async function triggerRefresh() {
    refreshing.value = true;
    try {
        const stationIds = selectedStn.value
            ? [selectedStn.value]
            : stations.value.map((station) => station.stationId).filter(Boolean);
        await api.post('/api/v1/admin/consumption/refresh', { stationIds });
        await loadData();
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

const uniqueStations = computed(() => [...stationPeriods.value.keys()]);

// Totals for each station (all periods summed — used for summary card)
const stationTotals = computed(() => {
    const out: Record<string, { kwh: number; txn: number; amount: number }> = {};
    for (const [sid, rows] of stationPeriods.value) {
        out[sid] = rows.reduce((a, r) => ({
            kwh:    a.kwh    + (r.kwh_total || 0),
            txn:    a.txn    + (r.transaction_count || 0),
            amount: a.amount + (r.amount_minor_total || 0),
        }), { kwh: 0, txn: 0, amount: 0 });
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

// ── Watchers ──────────────────────────────────────────────────────────────────

watch(period, () => loadData());
watch(selectedStn, () => loadMeterBreakdown());

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
          Pre-aggregated kWh vended · refreshes every 6 h
          <span v-if="refreshedAt" class="bw-muted"> · Last refresh: {{ fmtTs(refreshedAt) }}</span>
        </p>
      </div>
      <div style="display:flex; gap: var(--s-2); align-items:center; flex-wrap:wrap">
        <!-- Period tabs -->
        <div class="bw-seg">
          <button
            v-for="p in PERIODS" :key="p.value"
            :class="['bw-seg-btn', { active: period === p.value }]"
            @click="period = p.value"
          >{{ p.label }}</button>
        </div>
        <button class="bw-btn sm" :disabled="refreshing || loading" @click="triggerRefresh">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="refreshing ? 'animation:spin .7s linear infinite' : ''"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          {{ refreshing ? 'Refreshing…' : 'Refresh now' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="bw-error-banner" role="alert" style="margin-bottom: var(--s-4)">{{ error }}</div>

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
                <th style="text-align:right">kWh Vended</th>
                <th style="text-align:right">Transactions</th>
                <th style="text-align:right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!cumulRows.length">
                <td colspan="4" class="bw-muted" style="text-align:center; padding: var(--s-6)">No data for this period.</td>
              </tr>
              <tr v-for="r in [...cumulRows].sort((a,b) => a.period_start.localeCompare(b.period_start))" :key="r.period_start">
                <td class="bw-mono" style="font-size: var(--t-xs)">{{ periodLabel(r) }}</td>
                <td class="bw-money" style="text-align:right; font-weight:600">{{ fmtKwh(r.kwh_total) }}</td>
                <td style="text-align:right">{{ r.transaction_count.toLocaleString('en-NG') }}</td>
                <td class="bw-money" style="text-align:right">{{ naira(r.amount_minor_total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Station breakdown ─────────────────────────────────────────────── -->
      <div class="bw-card" style="padding:0; margin-bottom: var(--s-4)">
        <div style="padding: var(--s-3) var(--s-4); border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap: var(--s-2)">
          <p style="font-weight:600; margin:0">By station · {{ period }}</p>
          <select class="bw-select" v-model="selectedStn" style="min-width:180px">
            <option value="">— All stations —</option>
            <option v-for="sid in uniqueStations" :key="sid" :value="sid">{{ stnName(sid) }}</option>
          </select>
        </div>

        <div v-if="!uniqueStations.length" class="bw-muted" style="text-align:center; padding: var(--s-8)">
          No station data for this period.
        </div>

        <!-- Station summary cards -->
        <div v-else style="display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap: var(--s-3); padding: var(--s-4)">
          <div
            v-for="sid in uniqueStations"
            :key="sid"
            :class="['bw-stat-card', { selected: selectedStn === sid }]"
            style="cursor:pointer"
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
              <span>{{ (stationTotals[sid]?.txn ?? 0).toLocaleString('en-NG') }} txns</span>
              <span>{{ naira(stationTotals[sid]?.amount ?? 0) }}</span>
            </div>
          </div>
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
                  <th style="text-align:right">kWh Vended</th>
                  <th style="text-align:right">Transactions</th>
                  <th style="text-align:right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in rowsForStation(selectedStn)" :key="r.period_start">
                  <td class="bw-mono" style="font-size: var(--t-xs)">{{ periodLabel(r) }}</td>
                  <td class="bw-money" style="text-align:right; font-weight:600">{{ fmtKwh(r.kwh_total) }}</td>
                  <td style="text-align:right">{{ r.transaction_count.toLocaleString('en-NG') }}</td>
                  <td class="bw-money" style="text-align:right">{{ naira(r.amount_minor_total) }}</td>
                </tr>
                <tr v-if="!rowsForStation(selectedStn).length">
                  <td colspan="4" class="bw-muted" style="text-align:center; padding: var(--s-5)">No data.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ── Meter breakdown (drill-down) ─────────────────────────────────── -->
      <div v-if="selectedStn" class="bw-card" style="padding:0">
        <div style="padding: var(--s-3) var(--s-4); border-bottom:1px solid var(--border)">
          <p style="font-weight:600; margin:0">Meter breakdown — {{ stnName(selectedStn) }} · {{ period }}</p>
          <p class="bw-muted" style="font-size: var(--t-xs); margin:0">One section per meter. Click a meter ID to expand its periods.</p>
        </div>

        <div v-if="meterLoading" style="text-align:center; padding: var(--s-8)">
          <div class="bw-spinner" style="margin:auto" />
        </div>
        <div v-else-if="!uniqueMeters.length" class="bw-muted" style="text-align:center; padding: var(--s-8)">
          No meter data for this station / period.
        </div>

        <template v-else>
          <div v-for="mid in uniqueMeters" :key="mid" style="border-bottom:1px solid var(--border)">
            <!-- Meter header -->
            <div
              style="display:flex; align-items:center; justify-content:space-between; padding: var(--s-3) var(--s-4); cursor:pointer"
              @click="drillMeter = drillMeter === mid ? '' : mid"
            >
              <div style="display:flex; align-items:center; gap: var(--s-3)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline v-if="drillMeter === mid" points="18 15 12 9 6 15"/>
                  <polyline v-else points="6 9 12 15 18 9"/>
                </svg>
                <span class="bw-mono" style="font-weight:600">{{ mid }}</span>
              </div>
              <div style="display:flex; gap: var(--s-5); font-size: var(--t-xs)">
                <span class="bw-money" style="font-weight:600; color:var(--brand)">
                  {{ fmtKwh(rowsForMeter(mid).reduce((a,r) => a + r.kwh_total, 0)) }}
                </span>
                <span class="bw-muted">{{ rowsForMeter(mid).reduce((a,r) => a + r.transaction_count, 0).toLocaleString('en-NG') }} txns</span>
              </div>
            </div>

            <!-- Expanded period table -->
            <div v-if="drillMeter === mid" style="background: var(--surface-subtle, #f9f9f9)">
              <table class="bw-table" style="font-size: var(--t-xs)">
                <thead>
                  <tr>
                    <th style="padding-left: var(--s-8)">Period</th>
                    <th style="text-align:right">kWh</th>
                    <th style="text-align:right">Txns</th>
                    <th style="text-align:right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in rowsForMeter(mid)" :key="r.period_start">
                    <td class="bw-mono" style="padding-left: var(--s-8)">{{ periodLabel(r) }}</td>
                    <td class="bw-money" style="text-align:right">{{ fmtKwh(r.kwh_total) }}</td>
                    <td style="text-align:right">{{ r.transaction_count.toLocaleString('en-NG') }}</td>
                    <td class="bw-money" style="text-align:right">{{ naira(r.amount_minor_total) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
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

/* Station summary card */
.bw-stat-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--s-3) var(--s-4);
  transition: border-color .15s, box-shadow .15s;
}
.bw-stat-card:hover { border-color: var(--brand); }
.bw-stat-card.selected { border-color: var(--brand); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 20%, transparent); }
</style>
