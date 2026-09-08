<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira } from '../lib/format';
import WalletPagination from '@beverly/tokens/WalletPagination.vue';
import WalletTableSkeleton from '@beverly/tokens/WalletTableSkeleton.vue';
import { DEFAULT_PAGE_SIZE, paginate } from '@beverly/tokens';
import WalletExportMenu from '@beverly/tokens/WalletExportMenu.vue';
import type { WalletExportColumn } from '@beverly/tokens/wallet-export';

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
    /** Paid through the Beverly wallet. */
    amount_minor_total: number;
    /** Energy used, priced at the tariff in force. */
    energy_value_minor?: number;
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
const meterNumber = ref('');
const selectedMeter = ref('');
const meterError = ref('');
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
// What the meter recorded, priced at tariff — distinct from what was paid to
// Beverly, which is zero for a customer who vends elsewhere.
const totalValue = computed(() => rows.value.reduce((sum, row) => sum + Number(row.energy_value_minor ?? 0), 0));
const showMeterColumn = computed(() => !selectedMeter.value && meters.value.length > 1);

const PAGE_SIZE = DEFAULT_PAGE_SIZE;
const page = ref(1);
const pagedRows = computed(() => paginate(rows.value, page.value, PAGE_SIZE));
const consumptionExportColumns: WalletExportColumn<AggRow>[] = [
    { key: 'period_start', header: 'Period', value: (row) => periodLabel(row) },
    { key: 'meter_id', header: 'Meter', value: (row) => row.meter_id || selectedMeter.value || '' },
    { key: 'kwh_total', header: 'Energy Used', value: (row) => fmtKwh(row.kwh_total) },
    { key: 'energy_value_minor', header: 'Energy Value', value: (row) => naira(row.energy_value_minor || 0) },
    { key: 'amount_minor_total', header: 'Amount Spent', value: (row) => naira(row.amount_minor_total) },
    { key: 'reading_count', header: 'Readings', value: (row) => row.reading_count },
];
// Changing period or meter produces a different list; staying on page 7 of the
// old one would show an empty table.
watch([period, selectedMeter], () => { page.value = 1; });

// Period and meter can both change faster than the network responds; without
// this guard a slow earlier request could land last and repaint stale figures.
let loadRequestId = 0;

async function load() {
    const requestId = ++loadRequestId;
    loading.value = true;
    error.value = '';
    try {
        const params = new URLSearchParams({ period: period.value });
        if (selectedMeter.value) params.set('meter_id', selectedMeter.value);
        const res = await api.get<ConsumptionResponse>(`/api/v1/customer/consumption?${params}`);
        if (requestId !== loadRequestId) return;
        rows.value = res.rows ?? [];
        meters.value = res.meters ?? [];
    } catch (e: any) {
        if (requestId !== loadRequestId) return;
        error.value = e?.message ?? 'Could not load your consumption.';
    } finally {
        if (requestId === loadRequestId) loading.value = false;
    }
}

function searchMeter() {
    const value = meterNumber.value.trim().toUpperCase();
    if (value && !/^[A-Z0-9_-]{3,64}$/.test(value)) {
        meterError.value = 'Enter a valid meter number.';
        return;
    }
    meterError.value = '';
    selectedMeter.value = value;
    page.value = 1;
    load();
}

watch(period, load);
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
          <WalletExportMenu
            :rows="rows"
            :columns="consumptionExportColumns"
            filename="beverly-customer-consumption"
            title="Customer Consumption"
            :subtitle="`${periodLabel({ period_start: new Date().toISOString().slice(0, 10), period_type: period } as AggRow)} view`"
            :loading="loading"
            :formats="['pdf']"
          />
          <select v-model="period" aria-label="Period" class="select">
            <option v-for="option in PERIODS" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </div>
      </header>

      <form class="meter-search" aria-label="Meter consumption search" novalidate @submit.prevent="searchMeter">
        <label for="customer-consumption-meter">
          <span>Meter number</span>
          <input
            id="customer-consumption-meter"
            v-model="meterNumber"
            class="meter-input"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            maxlength="64"
            list="customer-consumption-meters"
            placeholder="Enter meter number"
            :aria-invalid="Boolean(meterError)"
            :aria-describedby="meterError ? 'customer-meter-error' : undefined"
            @input="meterError = ''"
          />
          <datalist id="customer-consumption-meters">
            <option v-for="meter in meters" :key="meter" :value="meter" />
          </datalist>
        </label>
        <button type="submit" class="meter-submit" :disabled="loading">View analytics</button>
        <span v-if="meterError" id="customer-meter-error" class="meter-error" role="alert">{{ meterError }}</span>
      </form>

      <div v-if="error" class="notice error" role="alert">{{ error }}</div>

      <template v-else>
        <div class="kpis bw-mobile-kpi-grid">
          <div class="kpi">
            <span class="kpi-label">Energy used</span>
            <strong class="kpi-value">{{ fmtKwh(totalKwh) }}</strong>
          </div>
          <div class="kpi">
            <span class="kpi-label">Value of energy used</span>
            <strong class="kpi-value">{{ naira(totalValue) }}</strong>
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
                <th class="num">Value</th>
                <th class="num">Spent</th>
              </tr>
            </thead>
            <tbody>
              <WalletTableSkeleton v-if="loading" :columns="showMeterColumn ? 5 : 4" />
              <tr v-else-if="!rows.length"><td :colspan="showMeterColumn ? 5 : 4" class="empty">No consumption recorded for this period.</td></tr>
              <tr v-for="(row, index) in pagedRows" v-else :key="`${row.scope_id}-${row.period_start}-${index}`">
                <td>{{ periodLabel(row) }}</td>
                <td v-if="showMeterColumn" class="mono">{{ row.meter_id }}</td>
                <td class="num">{{ fmtKwh(row.kwh_total) }}</td>
                <td class="num">{{ naira(row.energy_value_minor ?? 0) }}</td>
                <td class="num">{{ naira(row.amount_minor_total) }}</td>
              </tr>
            </tbody>
          </table>
          <WalletPagination v-model:page="page" :total="rows.length" :page-size="PAGE_SIZE" item-label="periods" />
        </div>
      </template>
    </div>
  </AppShell>
</template>

<style scoped>
.consumption { display: flex; flex-direction: column; gap: 1.25rem; }
.head { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-start; justify-content: space-between; }
h1 { margin: 0; font-size: 1.5rem; color: var(--text); }
.sub { margin: 0.25rem 0 0; color: var(--text-muted); font-size: 0.875rem; }
.controls { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.select { padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 8px; font: inherit; background: var(--surface-2); color: var(--text); }
.meter-search { display: grid; grid-template-columns: minmax(240px, 420px) auto; gap: 0.5rem; align-items: end; padding: 1rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); }
.meter-search label { display: grid; gap: 0.35rem; color: var(--text-muted); font-size: 0.8125rem; font-weight: 600; }
.meter-input { width: 100%; min-height: 44px; padding: 0 0.75rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font: 600 1rem/1 var(--font-mono); }
.meter-submit { min-height: 44px; padding: 0 1rem; border: 0; border-radius: 8px; background: var(--brand); color: oklch(8% 0.04 145); font: 700 1rem/1 var(--font-sans); cursor: pointer; }
.meter-submit:disabled { opacity: .55; cursor: wait; }
.meter-error { grid-column: 1 / -1; color: var(--danger-on-surface); font-size: 0.8125rem; }
.meter-input:focus-visible, .meter-submit:focus-visible { outline: 0; box-shadow: 0 0 0 3px var(--brand-glow), 0 0 0 5px var(--brand); }
.notice { padding: 1rem; border-radius: 8px; background: var(--surface-2); }
.notice.error { border-color: oklch(from var(--danger) l c h / .30); background: oklch(from var(--danger) l c h / .12); color: var(--danger-on-surface); }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; }
.kpi { display: flex; flex-direction: column; gap: 0.35rem; padding: 1rem; border: 1px solid var(--border); border-radius: 10px; }
.kpi-label { font-size: 0.8125rem; color: var(--text-muted); }
.kpi-value { font-size: 1.25rem; color: var(--text); }
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
table { width: 100%; border-collapse: collapse; min-width: 420px; }
th, td { padding: 0.7rem 0.85rem; text-align: left; border-bottom: 1px solid var(--border); }
th { font-size: 0.8125rem; color: var(--text-muted); font-weight: 600; background: var(--surface-2); }
td { color: var(--text-dim); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.mono { font-family: ui-monospace, monospace; font-size: 0.875rem; }
.empty { text-align: center; color: var(--text-muted); padding: 2rem; }
@media (max-width: 640px) {
  .meter-search { grid-template-columns: 1fr; }
  .meter-submit { width: 100%; }
}
</style>
