<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, naira } from '../lib/api';
import { downloadAuthedCsv, printPdf } from '../lib/export';

interface DailyPoint { date: string; revenueMinor: number; purchaseCount: number; fundingMinor: number; newCustomers: number; refundMinor: number; }
interface ReportOverview {
    range: { since: string; until: string; days: number };
    kpis: {
        revenueMinor: number; feeMinor: number; purchaseCount: number; deliveredCount: number;
        failedCount: number; successRate: number; avgOrderValueMinor: number;
        fundingApprovedMinor: number; fundingCount: number; settlementNetMinor: number;
        settlementGrossMinor: number; settlementBatches: number; refundApprovedMinor: number;
        refundCount: number; disputesOpened: number; newCustomers: number;
    };
    series: { daily: DailyPoint[] };
    breakdowns: {
        purchasesByStatus: Record<string, number>;
        revenueByActorType: Record<string, number>;
        topStations: { station_id: string; count: number; revenueMinor: number }[];
    };
}

const PRESETS = [
    { key: '7d', label: '7 days', days: 7 },
    { key: '30d', label: '30 days', days: 30 },
    { key: '90d', label: '90 days', days: 90 },
];

const loading = ref(true);
const error = ref('');
const report = ref<ReportOverview | null>(null);
const activePreset = ref('30d');
const since = ref('');
const until = ref('');
const metric = ref<'revenueMinor' | 'purchaseCount' | 'fundingMinor' | 'newCustomers'>('revenueMinor');

const METRIC_META: Record<string, { label: string; money: boolean; color: string }> = {
    revenueMinor: { label: 'Revenue', money: true, color: '#34d399' },
    purchaseCount: { label: 'Purchases', money: false, color: '#60a5fa' },
    fundingMinor: { label: 'Funding inflow', money: true, color: '#fbbf24' },
    newCustomers: { label: 'New customers', money: false, color: '#a78bfa' },
};

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }

function applyPreset(days: number, key: string) {
    activePreset.value = key;
    const now = new Date();
    until.value = isoDay(now);
    since.value = isoDay(new Date(now.getTime() - (days - 1) * 86400_000));
    void load();
}

function applyCustom() {
    if (!since.value || !until.value) return;
    activePreset.value = 'custom';
    void load();
}

async function load() {
    loading.value = true; error.value = '';
    try {
        const q = new URLSearchParams();
        if (since.value) q.set('since', since.value);
        if (until.value) q.set('until', until.value);
        report.value = await api.get<ReportOverview>(`/api/v1/admin/reports/overview?${q.toString()}`);
    } catch (e: any) {
        error.value = e?.message ?? 'Failed to load reports.';
    } finally {
        loading.value = false;
    }
}

const k = computed(() => report.value?.kpis);
const daily = computed(() => report.value?.series.daily ?? []);

function fmtMoney(minor: number) { return naira(minor); }
function fmtNum(n: number) { return Number(n ?? 0).toLocaleString('en-NG'); }

// ── Main chart geometry (area + line) ──────────────────────────────────────
const CHART_W = 720;
const CHART_H = 220;
const chart = computed(() => {
    const pts = daily.value;
    const values = pts.map((p) => Number((p as any)[metric.value] ?? 0));
    const max = Math.max(1, ...values);
    const n = values.length;
    const stepX = n > 1 ? CHART_W / (n - 1) : 0;
    const y = (v: number) => CHART_H - (v / max) * (CHART_H - 24) - 8;
    const coords = values.map((v, i) => [n > 1 ? i * stepX : CHART_W / 2, y(v)] as [number, number]);
    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
    const area = coords.length
        ? `${line} L${coords[coords.length - 1][0].toFixed(1)},${CHART_H} L${coords[0][0].toFixed(1)},${CHART_H} Z`
        : '';
    return { line, area, max, coords, values };
});

const gridLines = computed(() => {
    const max = chart.value.max;
    return [0, 0.25, 0.5, 0.75, 1].map((f) => ({
        y: (CHART_H - 8) - f * (CHART_H - 24),
        label: METRIC_META[metric.value].money ? naira(Math.round(max * f)) : fmtNum(Math.round(max * f)),
    }));
});

const axisLabels = computed(() => {
    const pts = daily.value;
    if (!pts.length) return [];
    const idxs = pts.length <= 6 ? pts.map((_, i) => i) : [0, Math.floor(pts.length / 3), Math.floor((2 * pts.length) / 3), pts.length - 1];
    return idxs.map((i) => ({
        x: pts.length > 1 ? (i * CHART_W) / (pts.length - 1) : CHART_W / 2,
        label: pts[i].date.slice(5),
    }));
});

// ── Breakdown helpers ──────────────────────────────────────────────────────
const statusRows = computed(() => {
    const obj = report.value?.breakdowns.purchasesByStatus ?? {};
    const total = Object.values(obj).reduce((s, n) => s + n, 0) || 1;
    const palette: Record<string, string> = { delivered: '#34d399', failed: '#f87171', pending: '#fbbf24', refunded: '#a78bfa' };
    return Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({ key, count, pct: Math.round((count / total) * 100), color: palette[key] ?? '#64748b' }));
});

const actorRows = computed(() => {
    const obj = report.value?.breakdowns.revenueByActorType ?? {};
    const total = Object.values(obj).reduce((s, n) => s + n, 0) || 1;
    return Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .map(([key, minor]) => ({ key, minor, pct: Math.round((minor / total) * 100) }));
});

const STATION_NAMES: Record<string, string> = {};

async function exportCsv() {
    const q = new URLSearchParams();
    if (since.value) q.set('since', since.value);
    if (until.value) q.set('until', until.value);
    try { await downloadAuthedCsv(`/api/v1/admin/reports/export.csv?${q.toString()}`, 'beverly-report'); }
    catch (e: any) { error.value = e?.message ?? 'CSV export failed.'; }
}

function exportPdf() {
    if (!report.value) return;
    const kp = report.value.kpis;
    printPdf({
        title: 'Wallet Operations Report',
        subtitle: `${report.value.range.since.slice(0, 10)} → ${report.value.range.until.slice(0, 10)} (${report.value.range.days} days)`,
        meta: [
            { label: 'Revenue', value: naira(kp.revenueMinor) },
            { label: 'Purchases', value: fmtNum(kp.deliveredCount) },
            { label: 'Success rate', value: `${kp.successRate}%` },
            { label: 'Funding inflow', value: naira(kp.fundingApprovedMinor) },
            { label: 'Settlement (net)', value: naira(kp.settlementNetMinor) },
            { label: 'Refunds approved', value: naira(kp.refundApprovedMinor) },
            { label: 'Disputes opened', value: fmtNum(kp.disputesOpened) },
            { label: 'New customers', value: fmtNum(kp.newCustomers) },
        ],
        tables: [
            {
                title: 'Daily breakdown',
                columns: ['Date', 'Revenue', 'Purchases', 'Funding', 'Refunds', 'New customers'],
                rows: report.value.series.daily.map((d) => [
                    d.date, naira(d.revenueMinor), d.purchaseCount, naira(d.fundingMinor), naira(d.refundMinor), d.newCustomers,
                ]),
            },
            {
                title: 'Top stations by revenue',
                columns: ['Station', 'Vends', 'Revenue'],
                rows: report.value.breakdowns.topStations.map((s) => [s.station_id, s.count, naira(s.revenueMinor)]),
            },
        ],
    });
}

onMounted(() => applyPreset(30, '30d'));
</script>

<template>
  <AppShell title="Reports">
    <template #topbar-end>
      <button class="bw-btn bw-btn-sm" :disabled="!report" @click="exportCsv">CSV</button>
      <button class="bw-btn bw-btn-sm" :disabled="!report" @click="exportPdf" style="margin-left:6px">PDF</button>
    </template>

    <!-- Controls -->
    <div class="rp-controls">
      <div class="rp-presets">
        <button
          v-for="p in PRESETS" :key="p.key"
          :class="['rp-chip', activePreset === p.key && 'on']"
          @click="applyPreset(p.days, p.key)"
        >{{ p.label }}</button>
      </div>
      <div class="rp-range">
        <input v-model="since" type="date" class="bw-input bw-input-sm" />
        <span class="rp-range-sep">→</span>
        <input v-model="until" type="date" class="bw-input bw-input-sm" />
        <button class="bw-btn bw-btn-sm bw-btn-ghost" @click="applyCustom">Apply</button>
      </div>
    </div>

    <div v-if="error" class="bw-error-banner">{{ error }}</div>

    <!-- KPI grid -->
    <div class="rp-kpis">
      <div class="rp-kpi rp-kpi--hero">
        <span class="rp-kpi-label">Revenue</span>
        <strong class="rp-kpi-value">{{ loading ? '—' : fmtMoney(k?.revenueMinor ?? 0) }}</strong>
        <span class="rp-kpi-sub">{{ fmtNum(k?.deliveredCount ?? 0) }} delivered · avg {{ fmtMoney(k?.avgOrderValueMinor ?? 0) }}</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">Success rate</span>
        <strong class="rp-kpi-value">{{ loading ? '—' : (k?.successRate ?? 0) + '%' }}</strong>
        <span class="rp-kpi-sub">{{ fmtNum(k?.failedCount ?? 0) }} failed</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">Funding inflow</span>
        <strong class="rp-kpi-value">{{ loading ? '—' : fmtMoney(k?.fundingApprovedMinor ?? 0) }}</strong>
        <span class="rp-kpi-sub">{{ fmtNum(k?.fundingCount ?? 0) }} top-ups</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">Settlement (net)</span>
        <strong class="rp-kpi-value">{{ loading ? '—' : fmtMoney(k?.settlementNetMinor ?? 0) }}</strong>
        <span class="rp-kpi-sub">{{ fmtNum(k?.settlementBatches ?? 0) }} batches</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">Refunds approved</span>
        <strong class="rp-kpi-value">{{ loading ? '—' : fmtMoney(k?.refundApprovedMinor ?? 0) }}</strong>
        <span class="rp-kpi-sub">{{ fmtNum(k?.refundCount ?? 0) }} requests</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">Disputes</span>
        <strong class="rp-kpi-value">{{ loading ? '—' : fmtNum(k?.disputesOpened ?? 0) }}</strong>
        <span class="rp-kpi-sub">opened in range</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">New customers</span>
        <strong class="rp-kpi-value">{{ loading ? '—' : fmtNum(k?.newCustomers ?? 0) }}</strong>
        <span class="rp-kpi-sub">in range</span>
      </div>
    </div>

    <!-- Trend chart -->
    <section class="bw-card rp-chart-card">
      <div class="rp-chart-head">
        <div>
          <p class="bw-label" style="color: var(--brand)">Trend</p>
          <h2 class="bw-h2" style="margin:0">{{ METRIC_META[metric].label }} over time</h2>
        </div>
        <div class="rp-metric-toggle">
          <button
            v-for="(m, key) in METRIC_META" :key="key"
            :class="['rp-chip sm', metric === key && 'on']"
            @click="metric = key as any"
          >{{ m.label }}</button>
        </div>
      </div>

      <div v-if="loading" class="bw-loading">Loading…</div>
      <div v-else-if="!daily.length" class="bw-empty">No data for this range.</div>
      <svg v-else class="rp-chart" :viewBox="`0 0 ${CHART_W} ${CHART_H + 24}`" preserveAspectRatio="none">
        <defs>
          <linearGradient :id="`rp-fill`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" :stop-color="METRIC_META[metric].color" stop-opacity="0.35" />
            <stop offset="100%" :stop-color="METRIC_META[metric].color" stop-opacity="0" />
          </linearGradient>
        </defs>
        <g>
          <line v-for="(g, i) in gridLines" :key="i" x1="0" :x2="CHART_W" :y1="g.y" :y2="g.y" class="rp-grid" />
          <text v-for="(g, i) in gridLines" :key="'t'+i" x="2" :y="g.y - 3" class="rp-grid-label">{{ g.label }}</text>
        </g>
        <path :d="chart.area" :fill="`url(#rp-fill)`" />
        <path :d="chart.line" fill="none" :stroke="METRIC_META[metric].color" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
        <g>
          <circle v-for="(c, i) in chart.coords" :key="i" :cx="c[0]" :cy="c[1]" r="2.5" :fill="METRIC_META[metric].color" />
        </g>
        <text v-for="(a, i) in axisLabels" :key="'x'+i" :x="a.x" :y="CHART_H + 16" class="rp-axis-label" text-anchor="middle">{{ a.label }}</text>
      </svg>
    </section>

    <!-- Breakdowns -->
    <div class="rp-breakdowns">
      <section class="bw-card">
        <p class="bw-label" style="color: var(--brand)">Quality</p>
        <h2 class="bw-h2">Purchases by status</h2>
        <div v-if="!statusRows.length" class="bw-empty">No purchases.</div>
        <div v-for="r in statusRows" :key="r.key" class="rp-bar-row">
          <span class="rp-bar-key">{{ r.key }}</span>
          <div class="rp-bar-track"><div class="rp-bar-fill" :style="{ width: r.pct + '%', background: r.color }" /></div>
          <span class="rp-bar-val">{{ fmtNum(r.count) }} · {{ r.pct }}%</span>
        </div>
      </section>

      <section class="bw-card">
        <p class="bw-label" style="color: var(--brand)">Mix</p>
        <h2 class="bw-h2">Revenue by channel</h2>
        <div v-if="!actorRows.length" class="bw-empty">No revenue.</div>
        <div v-for="r in actorRows" :key="r.key" class="rp-bar-row">
          <span class="rp-bar-key">{{ r.key }}</span>
          <div class="rp-bar-track"><div class="rp-bar-fill" :style="{ width: r.pct + '%' }" /></div>
          <span class="rp-bar-val">{{ fmtMoney(r.minor) }}</span>
        </div>
      </section>

      <section class="bw-card">
        <p class="bw-label" style="color: var(--brand)">Network</p>
        <h2 class="bw-h2">Top stations</h2>
        <div v-if="!(report?.breakdowns.topStations.length)" class="bw-empty">No station activity.</div>
        <table v-else class="bw-table rp-station-table">
          <thead><tr><th>Station</th><th>Vends</th><th>Revenue</th></tr></thead>
          <tbody>
            <tr v-for="s in report?.breakdowns.topStations" :key="s.station_id">
              <td class="bw-mono bw-text-sm">{{ STATION_NAMES[s.station_id] || s.station_id }}</td>
              <td>{{ fmtNum(s.count) }}</td>
              <td>{{ fmtMoney(s.revenueMinor) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.rp-controls { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); flex-wrap: wrap; margin-bottom: var(--s-4); }
.rp-presets, .rp-metric-toggle { display: flex; gap: 6px; flex-wrap: wrap; }
.rp-range { display: flex; align-items: center; gap: 8px; }
.rp-range-sep { color: var(--text-muted, #94a3b8); }
.rp-chip { padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border, #1e293b); background: transparent; color: var(--text-muted, #94a3b8); font-size: var(--t-sm); font-weight: 600; cursor: pointer; transition: all .15s; }
.rp-chip.sm { padding: 4px 10px; font-size: var(--t-xs); }
.rp-chip:hover { color: var(--text, #e2e8f0); border-color: var(--border-strong, #334155); }
.rp-chip.on { background: oklch(from var(--brand) l c h / .14); border-color: oklch(from var(--brand) l c h / .4); color: var(--brand); }

.rp-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--s-3); margin-bottom: var(--s-4); }
.rp-kpi { background: var(--surface, #0d1117); border: 1px solid var(--border, #1e293b); border-radius: var(--r-lg, 14px); padding: var(--s-4); display: flex; flex-direction: column; gap: 4px; }
.rp-kpi--hero { grid-column: span 2; background: linear-gradient(135deg, oklch(from var(--brand) l c h / .12), var(--surface, #0d1117)); border-color: oklch(from var(--brand) l c h / .3); }
.rp-kpi-label { font-size: var(--t-xs); text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint, #64748b); font-weight: 700; }
.rp-kpi-value { font-size: clamp(1.4rem, 2.4vw, 2rem); font-weight: 800; letter-spacing: -.02em; font-family: var(--font-mono, monospace); }
.rp-kpi-sub { font-size: var(--t-xs); color: var(--text-muted, #94a3b8); }

.rp-chart-card { margin-bottom: var(--s-4); }
.rp-chart-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s-3); flex-wrap: wrap; margin-bottom: var(--s-4); }
.rp-chart { width: 100%; height: auto; overflow: visible; }
.rp-grid { stroke: var(--border, #1e293b); stroke-width: 1; stroke-dasharray: 3 4; }
.rp-grid-label { fill: var(--text-faint, #64748b); font-size: 10px; font-family: var(--font-mono, monospace); }
.rp-axis-label { fill: var(--text-muted, #94a3b8); font-size: 10px; }

.rp-breakdowns { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--s-4); }
.rp-bar-row { display: grid; grid-template-columns: 90px 1fr auto; align-items: center; gap: 10px; margin: 10px 0; }
.rp-bar-key { font-size: var(--t-sm); text-transform: capitalize; color: var(--text-dim, #cbd5e1); }
.rp-bar-track { height: 8px; background: var(--surface-2, #161b22); border-radius: 999px; overflow: hidden; }
.rp-bar-fill { height: 100%; border-radius: 999px; background: var(--brand); transition: width .5s cubic-bezier(.4,0,.2,1); }
.rp-bar-val { font-size: var(--t-xs); font-family: var(--font-mono, monospace); color: var(--text-muted, #94a3b8); white-space: nowrap; }
.rp-station-table td, .rp-station-table th { text-align: left; }

@media (max-width: 640px) {
  .rp-kpi--hero { grid-column: span 1; }
  .rp-controls { flex-direction: column; align-items: stretch; }
}
</style>
