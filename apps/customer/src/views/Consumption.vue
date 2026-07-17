<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira } from '../lib/format';

// A customer sees only their own meters. The backend resolves that set from
// registered meters UNION meters they have bought tokens for, so a meter paid
// for but never registered still appears here.

interface AggRow {
    scope: string;
    scope_id: string;
    period_type: string;
    period_start: string;
    kwh_total: number;
    reading_count: number;
    amount_minor_total: number;
    meter_id?: string;
    last_refreshed_at: string;
}

interface ConsumptionResponse {
    rows: AggRow[];
    count: number;
    meters: string[];
}

type Period = 'day' | 'week' | 'month' | 'year';

const PERIODS: { label: string; value: Period }[] = [
    { label: 'Daily', value: 'day' },
    { label: 'Weekly', value: 'week' },
    { label: 'Monthly', value: 'month' },
    { label: 'Yearly', value: 'year' },
];

const period = ref<Period>('month');
const selectedMeter = ref('');
const rows = ref<AggRow[]>([]);
const meters = ref<string[]>([]);
const loading = ref(false);
const error = ref('');

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
const showMeterColumn = computed(() => !selectedMeter.value && meters.value.length > 1);

async function load() {
    loading.value = true;
    error.value = '';
    try {
        const meterParam = selectedMeter.value ? `&meter_id=${encodeURIComponent(selectedMeter.value)}` : '';
        const res = await api.get<ConsumptionResponse>(
            `/api/v1/customer/consumption?period=${period.value}${meterParam}`,
        );
        rows.value = res.rows ?? [];
        meters.value = res.meters ?? [];
    } catch (e: any) {
        error.value = e?.message ?? 'Could not load your consumption.';
    } finally {
        loading.value = false;
    }
}

watch([period, selectedMeter], load);
onMounted(load);
</script>

<template>
  <AppShell>
    <div class="consumption">
      <header class="head">
        <div>
          <h1>My consumption</h1>
          <p class="sub">Energy used on your meters.</p>
        </div>
        <div class="controls">
          <select v-if="meters.length > 1" v-model="selectedMeter" aria-label="Meter" class="select">
            <option value="">All my meters</option>
            <option v-for="meter in meters" :key="meter" :value="meter">{{ meter }}</option>
          </select>
          <select v-model="period" aria-label="Period" class="select">
            <option v-for="option in PERIODS" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </div>
      </header>

      <div v-if="error" class="notice error" role="alert">{{ error }}</div>

      <template v-else>
        <div class="kpis">
          <div class="kpi">
            <span class="kpi-label">Energy used</span>
            <strong class="kpi-value">{{ fmtKwh(totalKwh) }}</strong>
          </div>
          <div class="kpi">
            <span class="kpi-label">Amount spent</span>
            <strong class="kpi-value">{{ naira(totalSpend) }}</strong>
          </div>
          <div class="kpi">
            <span class="kpi-label">Meters</span>
            <strong class="kpi-value">{{ meters.length }}</strong>
          </div>
        </div>

        <div v-if="!loading && !meters.length" class="notice" role="status">
          No meters are linked to your account yet. Buy a token or register a meter to see consumption here.
        </div>

        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th v-if="showMeterColumn">Meter</th>
                <th class="num">Energy used</th>
                <th class="num">Spent</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading"><td :colspan="showMeterColumn ? 4 : 3" class="empty">Loading…</td></tr>
              <tr v-else-if="!rows.length"><td :colspan="showMeterColumn ? 4 : 3" class="empty">No consumption recorded for this period.</td></tr>
              <tr v-for="(row, index) in rows" v-else :key="`${row.scope_id}-${row.period_start}-${index}`">
                <td>{{ periodLabel(row) }}</td>
                <td v-if="showMeterColumn" class="mono">{{ row.meter_id }}</td>
                <td class="num">{{ fmtKwh(row.kwh_total) }}</td>
                <td class="num">{{ naira(row.amount_minor_total) }}</td>
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
.select { padding: 0.5rem 0.75rem; border: 1px solid var(--border, #d5d8e0); border-radius: 8px; font: inherit; }
.notice { padding: 1rem; border-radius: 8px; background: var(--surface-muted, #f4f6fa); }
.notice.error { background: #fdecec; color: #8c1b1b; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; }
.kpi { display: flex; flex-direction: column; gap: 0.35rem; padding: 1rem; border: 1px solid var(--border, #d5d8e0); border-radius: 10px; }
.kpi-label { font-size: 0.8125rem; color: var(--text-muted, #667); }
.kpi-value { font-size: 1.25rem; }
.table-wrap { overflow-x: auto; border: 1px solid var(--border, #d5d8e0); border-radius: 10px; }
table { width: 100%; border-collapse: collapse; min-width: 420px; }
th, td { padding: 0.7rem 0.85rem; text-align: left; border-bottom: 1px solid var(--border, #eceef3); }
th { font-size: 0.8125rem; color: var(--text-muted, #667); font-weight: 600; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.mono { font-family: ui-monospace, monospace; font-size: 0.875rem; }
.empty { text-align: center; color: var(--text-muted, #667); padding: 2rem; }
</style>
