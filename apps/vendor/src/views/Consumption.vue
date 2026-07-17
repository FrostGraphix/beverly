<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira } from '../lib/format';

// The backend derives the station from the authenticated vendor. Nothing here
// selects a site — a vendor has exactly one, and asking for another returns
// nothing by construction.

interface ConsumptionResponse {
    rows: AggRow[];
    count: number;
    stationId: string;
}

interface AggRow {
    scope: string;
    scope_id: string;
    period_type: string;
    period_start: string;
    kwh_total: number;
    reading_count: number;
    amount_minor_total: number;
    meter_id?: string;
    customer_id?: string | null;
    customer_name?: string | null;
    last_refreshed_at: string;
}

type Period = 'day' | 'week' | 'month' | 'year';
type View = 'site' | 'meters';

const PERIODS: { label: string; value: Period }[] = [
    { label: 'Daily', value: 'day' },
    { label: 'Weekly', value: 'week' },
    { label: 'Monthly', value: 'month' },
    { label: 'Yearly', value: 'year' },
];

const period = ref<Period>('month');
const view = ref<View>('site');
const rows = ref<AggRow[]>([]);
const stationId = ref('');
const loading = ref(false);
const error = ref('');
const noStation = ref(false);

function periodLabel(row: AggRow): string {
    const date = new Date(`${row.period_start}T00:00:00`);
    if (row.period_type === 'day') return date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
    if (row.period_type === 'week') return `Wk of ${date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })}`;
    if (row.period_type === 'month') return date.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
    if (row.period_type === 'year') return String(date.getFullYear());
    return row.period_start;
}

const fmtKwh = (value: number) =>
    `${Number(value ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh`;

const totalKwh = computed(() => rows.value.reduce((sum, row) => sum + Number(row.kwh_total ?? 0), 0));
const totalSpend = computed(() => rows.value.reduce((sum, row) => sum + Number(row.amount_minor_total ?? 0), 0));

async function load() {
    loading.value = true;
    error.value = '';
    noStation.value = false;
    try {
        const scope = view.value === 'site' ? 'station' : 'meter';
        const res = await api.get<ConsumptionResponse>(
            `/api/v1/vendor/consumption?scope=${scope}&period=${period.value}&spend=true`,
        );
        rows.value = res.rows ?? [];
        stationId.value = res.stationId ?? '';
    } catch (e: any) {
        if (e?.code === 'no_station_assigned' || e?.status === 409) {
            noStation.value = true;
            rows.value = [];
        } else {
            error.value = e?.message ?? 'Could not load consumption.';
        }
    } finally {
        loading.value = false;
    }
}

watch([period, view], load);
onMounted(load);
</script>

<template>
  <AppShell>
    <div class="consumption">
      <header class="head">
        <div>
          <h1>Consumption</h1>
          <p v-if="stationId" class="sub">Station {{ stationId }}</p>
        </div>
        <div class="controls">
          <div class="seg" role="tablist" aria-label="View">
            <button
              v-for="option in (['site', 'meters'] as View[])"
              :key="option"
              role="tab"
              :aria-selected="view === option"
              :class="['seg-btn', { active: view === option }]"
              @click="view = option"
            >{{ option === 'site' ? 'Site total' : 'By meter' }}</button>
          </div>
          <select v-model="period" aria-label="Period" class="select">
            <option v-for="option in PERIODS" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </div>
      </header>

      <div v-if="noStation" class="notice" role="status">
        No station is assigned to your vendor account yet. Contact Beverly operations to have one assigned.
      </div>
      <div v-else-if="error" class="notice error" role="alert">{{ error }}</div>

      <template v-else>
        <div class="kpis">
          <div class="kpi">
            <span class="kpi-label">Total consumption</span>
            <strong class="kpi-value">{{ fmtKwh(totalKwh) }}</strong>
          </div>
          <div class="kpi">
            <span class="kpi-label">Total sales</span>
            <strong class="kpi-value">{{ naira(totalSpend) }}</strong>
          </div>
          <div class="kpi">
            <span class="kpi-label">{{ view === 'meters' ? 'Meters' : 'Periods' }}</span>
            <strong class="kpi-value">{{ rows.length }}</strong>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th v-if="view === 'meters'">Meter</th>
                <th v-if="view === 'meters'">Customer</th>
                <th class="num">Consumption</th>
                <th class="num">Sales</th>
                <th class="num">Readings</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading"><td :colspan="view === 'meters' ? 6 : 4" class="empty">Loading…</td></tr>
              <tr v-else-if="!rows.length"><td :colspan="view === 'meters' ? 6 : 4" class="empty">No consumption recorded for this period.</td></tr>
              <tr v-for="(row, index) in rows" v-else :key="`${row.scope_id}-${row.period_start}-${index}`">
                <td>{{ periodLabel(row) }}</td>
                <td v-if="view === 'meters'" class="mono">{{ row.meter_id }}</td>
                <td v-if="view === 'meters'">{{ row.customer_name || '—' }}</td>
                <td class="num">{{ fmtKwh(row.kwh_total) }}</td>
                <td class="num">{{ naira(row.amount_minor_total) }}</td>
                <td class="num">{{ row.reading_count }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </AppShell>
</template>

<style scoped>
.consumption { display: flex; flex-direction: column; gap: 1.25rem; }
.head { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-start; justify-content: space-between; }
h1 { margin: 0; font-size: 1.5rem; }
.sub { margin: 0.25rem 0 0; color: var(--text-muted, #667); font-size: 0.875rem; }
.controls { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.seg { display: inline-flex; border: 1px solid var(--border, #d5d8e0); border-radius: 8px; overflow: hidden; }
.seg-btn { padding: 0.5rem 0.9rem; border: 0; background: transparent; cursor: pointer; font: inherit; }
.seg-btn.active { background: var(--accent, #2f6feb); color: #fff; }
.select { padding: 0.5rem 0.75rem; border: 1px solid var(--border, #d5d8e0); border-radius: 8px; font: inherit; }
.notice { padding: 1rem; border-radius: 8px; background: var(--surface-muted, #f4f6fa); }
.notice.error { background: #fdecec; color: #8c1b1b; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
.kpi { display: flex; flex-direction: column; gap: 0.35rem; padding: 1rem; border: 1px solid var(--border, #d5d8e0); border-radius: 10px; }
.kpi-label { font-size: 0.8125rem; color: var(--text-muted, #667); }
.kpi-value { font-size: 1.25rem; }
.table-wrap { overflow-x: auto; border: 1px solid var(--border, #d5d8e0); border-radius: 10px; }
table { width: 100%; border-collapse: collapse; min-width: 520px; }
th, td { padding: 0.7rem 0.85rem; text-align: left; border-bottom: 1px solid var(--border, #eceef3); }
th { font-size: 0.8125rem; color: var(--text-muted, #667); font-weight: 600; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.mono { font-family: ui-monospace, monospace; font-size: 0.875rem; }
.empty { text-align: center; color: var(--text-muted, #667); padding: 2rem; }
</style>
