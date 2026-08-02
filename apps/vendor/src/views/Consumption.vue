<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { naira } from '../lib/format';
import WalletPagination from '@beverly/tokens/WalletPagination.vue';
import { DEFAULT_PAGE_SIZE, paginate } from '@beverly/tokens';

interface AggRow {
  scope: string;
  scope_id: string;
  period_type: string;
  period_start: string;
  kwh_total: number;
  reading_count: number;
  /** Paid through the Beverly wallet. */
  amount_minor_total: number;
  /** Energy consumed, valued at the tariff in force on each reading date. */
  energy_value_minor?: number;
  meter_id?: string;
  customer_name?: string | null;
}

interface ConsumptionResponse {
  rows: AggRow[];
  count: number;
  stationId: string;
  meterCount?: number;
  truncated?: boolean;
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
const meterNumber = ref('');
const selectedMeter = ref('');
const meterError = ref('');
let loadRequestId = 0;

const periodLabelText = computed(() => PERIODS.find((option) => option.value === period.value)?.label ?? 'Monthly');
const totalKwh = computed(() => rows.value.reduce((sum, row) => sum + Number(row.kwh_total ?? 0), 0));
const totalSpend = computed(() => rows.value.reduce((sum, row) => sum + Number(row.amount_minor_total ?? 0), 0));
// Energy value is what the meters recorded, priced at tariff. Wallet sales is
// what customers paid Beverly. They are different numbers and the page must
// not imply otherwise — most sites have real consumption and no wallet spend.
const totalValue = computed(() => rows.value.reduce((sum, row) => sum + Number(row.energy_value_minor ?? 0), 0));
const truncated = ref(false);
// In the meter view a row is one meter *per period*, so row count is not a
// meter count — it read as "37 meters" for a site with 4. Count distinct ids.
const meterCount = computed(
  () => new Set(rows.value.map((row) => row.meter_id ?? row.scope_id).filter(Boolean)).size,
);
const periodCount = computed(() => new Set(rows.value.map((row) => row.period_start)).size);

const PAGE_SIZE = DEFAULT_PAGE_SIZE;
const page = ref(1);
const pagedRows = computed(() => paginate(rows.value, page.value, PAGE_SIZE));

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

async function load() {
  const requestId = ++loadRequestId;
  error.value = '';
  noStation.value = false;
  if (view.value === 'meters' && !selectedMeter.value) {
    rows.value = [];
    truncated.value = false;
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const scope = view.value === 'site' ? 'station' : 'meter';
    // The server sizes the row cap per scope; asking for a client-side number
    // here is how the meter view ended up truncated at 120 rows.
    const params = new URLSearchParams({ scope, period: period.value, spend: 'true' });
    if (scope === 'meter') params.set('meter_id', selectedMeter.value);
    const response = await api.get<ConsumptionResponse>(`/api/v1/vendor/consumption?${params}`);
    if (requestId !== loadRequestId) return;
    rows.value = Array.isArray(response.rows) ? response.rows : [];
    stationId.value = response.stationId ?? '';
    truncated.value = Boolean(response.truncated);
  } catch (cause: any) {
    if (requestId !== loadRequestId) return;
    if (cause?.code === 'no_station_assigned') {
      noStation.value = true;
      rows.value = [];
    } else {
      error.value = cause?.message ?? 'Could not load consumption.';
    }
  } finally {
    if (requestId === loadRequestId) loading.value = false;
  }
}

function searchMeter() {
  const value = meterNumber.value.trim();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(value)) {
    meterError.value = 'Enter a valid meter number.';
    return;
  }
  meterError.value = '';
  selectedMeter.value = value;
  page.value = 1;
  load();
}

// A new period or view is a different list; page 7 of the old one would be empty.
watch([period, view], () => { page.value = 1; });
watch([period, view], load);
onMounted(load);
</script>

<template>
  <AppShell title="Consumption">
    <div class="consumption" :aria-busy="loading">
      <header class="head">
        <div>
          <span class="eyebrow">Analytics</span>
          <h1>Consumption</h1>
          <p class="sub">Review energy usage and sales.</p>
          <p v-if="stationId" class="station">Station {{ stationId }}</p>
        </div>

        <div class="controls">
          <div class="seg" role="tablist" aria-label="View">
            <button
              v-for="option in (['site', 'meters'] as View[])"
              :key="option"
              type="button"
              role="tab"
              :aria-selected="view === option"
              aria-controls="consumption-results"
              :class="['seg-btn', { active: view === option }]"
              @click="view = option"
            >{{ option === 'site' ? 'Site total' : 'By meter' }}</button>
          </div>

          <label class="period-control">
            <span>Period</span>
            <select v-model="period" class="select">
              <option v-for="option in PERIODS" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
        </div>
      </header>

      <form v-if="view === 'meters'" class="meter-search" aria-label="Meter consumption search" novalidate @submit.prevent="searchMeter">
        <label for="consumption-meter-number">
          <span>Meter number</span>
          <input
            id="consumption-meter-number"
            v-model="meterNumber"
            class="meter-input"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            maxlength="64"
            placeholder="Enter meter number"
            :aria-invalid="Boolean(meterError)"
            :aria-describedby="meterError ? 'meter-number-error' : undefined"
            @input="meterError = ''"
          />
        </label>
        <button type="submit" class="meter-submit" :disabled="loading">View analytics</button>
        <span v-if="meterError" id="meter-number-error" class="meter-error" role="alert">{{ meterError }}</span>
      </form>

      <div v-if="loading" class="notice loading" role="status">Loading consumption…</div>
      <div v-else-if="noStation" class="notice" role="status">
        No station is assigned yet. Contact Beverly operations.
      </div>
      <div v-else-if="error" class="notice error" role="alert">
        <span>{{ error }}</span>
        <button type="button" class="retry" @click="load">Retry</button>
      </div>
      <div v-else-if="view === 'meters' && !selectedMeter" class="notice" role="status">
        Enter a meter number to view consumption analytics.
      </div>

      <section v-else id="consumption-results" aria-live="polite">
        <div v-if="truncated" class="notice" role="status">
          This station has more data than one page holds for the selected period — figures below cover the rows
          shown. Choose a coarser period for the full site total.
        </div>
        <div class="kpis bw-mobile-kpi-grid">
          <article class="kpi featured">
            <span class="kpi-label">Total consumption</span>
            <strong class="kpi-value">{{ fmtKwh(totalKwh) }}</strong>
            <small>Across displayed periods</small>
          </article>
          <article class="kpi">
            <span class="kpi-label">Energy value</span>
            <strong class="kpi-value">{{ naira(totalValue) }}</strong>
            <small>Consumption priced at tariff</small>
          </article>
          <article class="kpi">
            <span class="kpi-label">Wallet sales</span>
            <strong class="kpi-value">{{ naira(totalSpend) }}</strong>
            <small>Paid through Beverly</small>
          </article>
          <article class="kpi">
            <span class="kpi-label">{{ view === 'meters' ? 'Meters' : 'Periods' }}</span>
            <strong class="kpi-value">{{ view === 'meters' ? meterCount : periodCount }}</strong>
            <small>{{ periodLabelText }} view</small>
          </article>
        </div>

        <div class="table-wrap" role="region" aria-label="Consumption results" tabindex="0">
          <table>
            <caption>Consumption results for {{ periodLabelText.toLowerCase() }} periods</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th v-if="view === 'meters'" scope="col">Meter</th>
                <th v-if="view === 'meters'" scope="col">Customer</th>
                <th scope="col" class="num">Consumption</th>
                <th scope="col" class="num">Energy value</th>
                <th scope="col" class="num">Wallet sales</th>
                <th scope="col" class="num">Readings</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!rows.length"><td :colspan="view === 'meters' ? 7 : 5" class="empty">{{ view === 'meters' ? `No consumption found for meter ${selectedMeter}.` : 'No consumption recorded.' }}</td></tr>
              <tr v-for="(row, index) in pagedRows" v-else :key="`${row.scope_id}-${row.period_start}-${index}`">
                <td>{{ periodLabel(row) }}</td>
                <td v-if="view === 'meters'" class="mono">{{ row.meter_id }}</td>
                <td v-if="view === 'meters'">{{ row.customer_name || '—' }}</td>
                <td class="num">{{ fmtKwh(row.kwh_total) }}</td>
                <td class="num">{{ naira(row.energy_value_minor ?? 0) }}</td>
                <td class="num">{{ naira(row.amount_minor_total) }}</td>
                <td class="num">{{ row.reading_count }}</td>
              </tr>
            </tbody>
          </table>
          <WalletPagination
            v-model:page="page"
            :total="rows.length"
            :page-size="PAGE_SIZE"
            :item-label="view === 'meters' ? 'meter periods' : 'periods'"
          />
        </div>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.consumption { display: flex; flex-direction: column; gap: var(--s-5); max-width: 1180px; margin: 0 auto; }
.head { display: flex; flex-wrap: wrap; gap: var(--s-4); align-items: flex-start; justify-content: space-between; }
.eyebrow { display: block; margin-bottom: var(--s-1); color: var(--brand-on-surface); font-size: var(--t-xs); font-weight: var(--fw-bold); letter-spacing: .09em; text-transform: uppercase; }
h1 { margin: 0; color: var(--text); font: var(--fw-extrabold) var(--t-3xl)/1.15 var(--font-display); }
.sub, .station { margin: var(--s-2) 0 0; color: var(--text-muted); font-size: var(--t-md); }
.station { color: var(--text-dim); font-weight: var(--fw-semibold); }
.controls { display: flex; gap: var(--s-3); flex-wrap: wrap; align-items: flex-end; }
.seg { display: inline-flex; min-height: 44px; padding: var(--s-1); border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface-2); }
.seg-btn { min-height: 36px; padding: 0 var(--s-4); border: 0; border-radius: var(--r-md); background: transparent; color: var(--text-muted); cursor: pointer; font: var(--fw-semibold) var(--t-base)/1 var(--font-sans); }
.seg-btn:hover { color: var(--text); background: var(--surface-3); }
.seg-btn.active { background: var(--brand); color: oklch(8% 0.04 145); box-shadow: 0 3px 10px var(--brand-glow); }
.seg-btn:focus-visible, .select:focus-visible, .meter-input:focus-visible, .meter-submit:focus-visible, .retry:focus-visible, .table-wrap:focus-visible { outline: 0; box-shadow: 0 0 0 3px var(--brand-glow), 0 0 0 5px var(--brand); }
.period-control { display: grid; gap: var(--s-1); color: var(--text-muted); font-size: var(--t-xs); font-weight: var(--fw-semibold); }
.select { min-height: 44px; padding: 0 var(--s-8) 0 var(--s-3); border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface-2); color: var(--text); font: inherit; }
.meter-search { display: grid; grid-template-columns: minmax(240px, 420px) auto; gap: var(--s-2); align-items: end; padding: var(--s-4); border: 1px solid var(--border); border-radius: var(--r-xl); background: var(--surface-2); }
.meter-search label { display: grid; gap: var(--s-1); color: var(--text-muted); font-size: var(--t-xs); font-weight: var(--fw-semibold); }
.meter-input { width: 100%; min-height: 44px; padding: 0 var(--s-3); border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); color: var(--text); font: var(--fw-semibold) var(--t-base)/1 var(--font-mono); }
.meter-input::placeholder { color: var(--text-muted); font-family: var(--font-sans); font-weight: var(--fw-regular); }
.meter-submit { min-height: 44px; padding: 0 var(--s-4); border: 0; border-radius: var(--r-md); background: var(--brand); color: oklch(8% 0.04 145); font: var(--fw-bold) var(--t-base)/1 var(--font-sans); cursor: pointer; }
.meter-submit:disabled { opacity: .55; cursor: wait; }
.meter-error { grid-column: 1 / -1; color: var(--danger-on-surface); font-size: var(--t-xs); }
.notice { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); padding: var(--s-4); border: 1px solid var(--border); border-radius: var(--r-xl); background: var(--surface-2); color: var(--text-dim); }
.notice.error { border-color: oklch(from var(--danger) l c h / .30); background: oklch(from var(--danger) l c h / .12); color: var(--danger-on-surface); }
.loading { min-height: 84px; justify-content: center; }
.retry { min-height: 44px; padding: 0 var(--s-4); border: 1px solid currentColor; border-radius: var(--r-md); background: transparent; color: inherit; font: inherit; font-weight: var(--fw-bold); cursor: pointer; }
.retry:hover { background: oklch(from var(--danger) l c h / .10); }
#consumption-results { display: grid; gap: var(--s-4); }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--s-3); }
.kpi { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-5); border: 1px solid var(--border); border-radius: var(--r-xl); background: var(--surface-2); box-shadow: var(--shadow-1); }
.kpi.featured { border-color: oklch(from var(--brand) l c h / .28); background: linear-gradient(135deg, var(--brand-glow), var(--surface-2) 72%); }
.kpi-label { color: var(--text-muted); font-size: var(--t-xs); font-weight: var(--fw-bold); letter-spacing: .06em; text-transform: uppercase; }
.kpi-value { color: var(--text); font-family: var(--font-mono); font-size: var(--t-2xl); }
.kpi small { color: var(--text-muted); font-size: var(--t-xs); }
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--r-xl); background: var(--surface); box-shadow: var(--shadow-1); }
table { width: 100%; border-collapse: collapse; min-width: 520px; }
caption { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
th, td { padding: var(--s-3) var(--s-4); text-align: left; border-bottom: 1px solid var(--border); }
th { background: var(--surface-2); color: var(--text-muted); font-size: var(--t-xs); font-weight: var(--fw-bold); letter-spacing: .04em; text-transform: uppercase; }
td { color: var(--text-dim); }
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover td { background: var(--surface-2); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.mono { font-family: var(--font-mono); font-size: var(--t-base); }
.empty { text-align: center; color: var(--text-muted); padding: var(--s-8); }
@media (max-width: 640px) {
  .head, .controls { width: 100%; }
  .controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
  .seg { width: 100%; }
  .seg-btn { flex: 1; padding-inline: var(--s-2); }
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .kpi:first-child { grid-column: 1 / -1; }
  .kpi { padding: var(--s-4); }
  .kpi-value { font-size: var(--t-xl); overflow-wrap: anywhere; }
  .notice.error { align-items: flex-start; flex-direction: column; }
  .meter-search { grid-template-columns: 1fr; }
  .meter-submit { width: 100%; }
}
@media (max-width: 360px) {
  .controls, .kpis { grid-template-columns: 1fr; }
  .period-control, .select { width: 100%; }
  .kpi:first-child { grid-column: auto; }
}
</style>
