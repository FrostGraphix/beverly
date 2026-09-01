<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, naira } from '../lib/api';
import { downloadAuthedCsv } from '../lib/export';
import { downloadReportPdf, type ReportFamily } from '../lib/report-pdf';

type ReportAudience = 'all' | 'vendor' | 'customer';
type ReportGrouping = 'site' | 'vendor' | 'customer';
interface DailyPoint { date: string; revenueMinor: number; purchaseCount: number; fundingMinor: number; newCustomers: number; newVendors: number; refundMinor: number; auditLogsCount?: number; securityEventsCount?: number; }
interface CountRow { key: string; count: number; pct: number; }
interface MoneyRow { key: string; minor: number; pct: number; }
interface StationOption { stationId: string; name: string; }
interface EntityPerformanceRow {
    siteId: string; groupType: ReportGrouping; entityId: string; entityName: string;
    purchaseCount: number; deliveredCount: number; failedCount: number; customerCount: number;
    directPurchaseCount: number; vendorPurchaseCount: number; revenueMinor: number;
    energyRevenueMinor: number; vatMinor: number; unitsKwh: number; averagePurchaseMinor: number;
    successRate: number; firstPurchaseAt: string | null; lastPurchaseAt: string | null;
}
interface ReportOverview {
    audience: ReportAudience;
    scope: { siteId: string | null; groupBy: ReportGrouping };
    range: { since: string; until: string; days: number };
    kpis: {
        revenueMinor: number; energyRevenueMinor: number; vatMinor: number; feeMinor: number; purchaseCount: number; deliveredCount: number;
        failedCount: number; successRate: number; avgOrderValueMinor: number;
        fundingApprovedMinor: number; fundingCount: number; settlementNetMinor: number;
        settlementGrossMinor: number; settlementBatches: number; refundApprovedMinor: number;
        refundCount: number; disputesOpened: number; newCustomers: number; newVendors: number;
        auditLogsCount?: number; securityEventsCount?: number; securityAlertsHigh?: number;
        ledgerNetMinor?: number; ledgerCreditMinor?: number; ledgerDebitMinor?: number; ledgerEntryCount?: number;
        activeHoldsMinor?: number; activeHoldsCount?: number;
        reconciliationRunCount?: number; reconciliationMismatches?: number; reconciliationMismatchMinor?: number;
    };
    series: { daily: DailyPoint[] };
    breakdowns: {
        purchasesByStatus: Record<string, number>;
        revenueByActorType: Record<string, number>;
        topStations: { station_id: string; count: number; revenueMinor: number }[];
        auditActionsBreakdown?: Record<string, number>;
        securitySeveritiesBreakdown?: Record<string, number>;
        fundingByChannel?: Record<string, number>;
        fundingRequestsByStatus?: Record<string, number>;
        disputesByStatus?: Record<string, number>;
        refundsByStatus?: Record<string, number>;
        settlementByStatus?: Record<string, number>;
        ledgerByEntryType?: Record<string, number>;
        reconciliationByStatus?: Record<string, number>;
        entityPerformance: EntityPerformanceRow[];
    };
    sources?: Record<string, number>;
}

const PRESETS = [
    { key: '7d', label: '7 days', days: 7 },
    { key: '30d', label: '30 days', days: 30 },
    { key: '90d', label: '90 days', days: 90 },
];

const loading = ref(true);
const error = ref('');
const rangeError = ref('');
const report = ref<ReportOverview | null>(null);
const activePreset = ref('30d');
const since = ref('');
const until = ref('');
const metric = ref<'revenueMinor' | 'purchaseCount' | 'fundingMinor' | 'newCustomers'>('revenueMinor');
const selectedFamily = ref<ReportFamily>('financial');
const audience = ref<ReportAudience>('all');
const groupBy = ref<ReportGrouping>('site');
const siteId = ref('');
const stations = ref<StationOption[]>([]);
const breakdownSearch = ref('');
const breakdownPage = ref(1);
const BREAKDOWN_PAGE_SIZE = 25;
let loadSequence = 0;

const AUDIENCES: { key: ReportAudience; label: string; description: string }[] = [
    { key: 'all', label: 'Combined', description: 'Vendors and customers' },
    { key: 'vendor', label: 'Vendors', description: 'Vendor-owned activity' },
    { key: 'customer', label: 'Customers', description: 'Customer-owned activity' },
];
const audienceLabel = computed(() => AUDIENCES.find((item) => item.key === audience.value)?.label ?? 'Combined');

const GROUPINGS: { key: ReportGrouping; label: string; description: string }[] = [
    { key: 'site', label: 'SiteID', description: 'One row per site' },
    { key: 'vendor', label: 'Vendor', description: 'Vendors split by SiteID' },
    { key: 'customer', label: 'Customer', description: 'Customers split by SiteID' },
];
const groupingLabel = computed(() => GROUPINGS.find((item) => item.key === groupBy.value)?.label ?? 'SiteID');

const REPORT_TEMPLATES: { id: ReportFamily; title: string; description: string; metric: typeof metric.value; icon: string }[] = [
    { id: 'financial', title: 'Financial report', description: 'Revenue, funding, settlements', metric: 'revenueMinor', icon: '01' },
    { id: 'transactions', title: 'Transaction report', description: 'Vends, outcomes, volumes', metric: 'purchaseCount', icon: '02' },
    { id: 'vendors-wallets', title: 'Vendors and wallets', description: 'Channels, balances, inflows', metric: 'fundingMinor', icon: '03' },
    { id: 'audit', title: 'Audit report', description: 'Controls, events, exceptions', metric: 'purchaseCount', icon: '04' },
    { id: 'disputes', title: 'Disputes report', description: 'Cases, refunds, resolutions', metric: 'fundingMinor', icon: '05' },
    { id: 'general', title: 'General report', description: 'Executive operations snapshot', metric: 'revenueMinor', icon: '06' },
];
const selectedTemplate = computed(() => REPORT_TEMPLATES.find((item) => item.id === selectedFamily.value) ?? REPORT_TEMPLATES[0]);

const METRIC_META: Record<string, { label: string; money: boolean; color: string }> = {
    revenueMinor: { label: 'Revenue', money: true, color: '#34d399' },
    purchaseCount: { label: 'Purchases', money: false, color: '#60a5fa' },
    fundingMinor: { label: 'Funding inflow', money: true, color: '#fbbf24' },
    newCustomers: { label: 'New customers', money: false, color: '#a78bfa' },
};

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }

function applyPreset(days: number, key: string) {
    rangeError.value = '';
    activePreset.value = key;
    const now = new Date();
    until.value = isoDay(now);
    since.value = isoDay(new Date(now.getTime() - (days - 1) * 86400_000));
    void load();
}

function applyCustom() {
    rangeError.value = '';
    if (!since.value || !until.value) {
        rangeError.value = 'Choose both dates.';
        return;
    }
    if (since.value > until.value) {
        rangeError.value = 'Start date must precede end date.';
        return;
    }
    activePreset.value = 'custom';
    void load();
}

async function load() {
    const requestId = ++loadSequence;
    loading.value = true; error.value = '';
    try {
        const q = new URLSearchParams();
        if (since.value) q.set('since', since.value);
        if (until.value) q.set('until', until.value);
        q.set('audience', audience.value);
        q.set('family', selectedFamily.value);
        q.set('group_by', groupBy.value);
        if (siteId.value) q.set('site_id', siteId.value);
        const nextReport = await api.get<ReportOverview>(`/api/v1/admin/reports/overview?${q.toString()}`);
        if (requestId === loadSequence) {
            report.value = nextReport;
            breakdownPage.value = 1;
        }
    } catch (e: any) {
        if (requestId === loadSequence) error.value = e?.message ?? 'Failed to load reports.';
    } finally {
        if (requestId === loadSequence) loading.value = false;
    }
}

function selectAudience(next: ReportAudience) {
    if (audience.value === next) return;
    audience.value = next;
    if (next === 'customer' && groupBy.value === 'vendor') groupBy.value = 'customer';
    void load();
}

function selectGrouping(next: ReportGrouping) {
    if (groupBy.value === next) return;
    groupBy.value = next;
    if (next === 'vendor' && audience.value === 'customer') audience.value = 'vendor';
    breakdownSearch.value = '';
    breakdownPage.value = 1;
    void load();
}

function selectSite() {
    breakdownPage.value = 1;
    void load();
}

async function loadStations() {
    try {
        const response = await api.get<{ stations: StationOption[] }>('/api/v1/admin/stations');
        stations.value = (response.stations ?? [])
            .map((station) => ({ stationId: String(station.stationId), name: String(station.name || station.stationId) }))
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        stations.value = [];
    }
}

const k = computed(() => report.value?.kpis);
const daily = computed(() => report.value?.series.daily ?? []);
const entityRows = computed(() => report.value?.breakdowns.entityPerformance ?? []);
const filteredEntityRows = computed(() => {
    const query = breakdownSearch.value.trim().toLowerCase();
    if (!query) return entityRows.value;
    return entityRows.value.filter((row) => [row.siteId, row.entityId, row.entityName]
        .some((value) => String(value).toLowerCase().includes(query)));
});
const breakdownPages = computed(() => Math.max(1, Math.ceil(filteredEntityRows.value.length / BREAKDOWN_PAGE_SIZE)));
const pagedEntityRows = computed(() => {
    const start = (breakdownPage.value - 1) * BREAKDOWN_PAGE_SIZE;
    return filteredEntityRows.value.slice(start, start + BREAKDOWN_PAGE_SIZE);
});

function fmtMoney(minor: number) { return naira(minor); }
function fmtNum(n: number) { return Number(n ?? 0).toLocaleString('en-NG'); }

// Main chart geometry.
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

// Breakdown helpers.
const statusRows = computed(() => {
    const obj = report.value?.breakdowns.purchasesByStatus ?? {};
    const total = Object.values(obj).reduce((s, n) => s + n, 0) || 1;
    const palette: Record<string, string> = { delivered: '#34d399', failed: '#f87171', pending: '#fbbf24', refunded: '#a78bfa' };
    return Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({ key, count, pct: Math.round((count / total) * 100), color: palette[key] ?? '#64748b' }));
});

function countRows(obj: Record<string, number> | undefined): CountRow[] {
    const rows = Object.entries(obj ?? {}).map(([key, count]) => ({ key, count: Number(count) }));
    const total = rows.reduce((s, row) => s + row.count, 0) || 1;
    return rows.sort((a, b) => b.count - a.count).map((row) => ({ ...row, pct: Math.round((row.count / total) * 100) }));
}

function moneyRows(obj: Record<string, number> | undefined): MoneyRow[] {
    const rows = Object.entries(obj ?? {}).map(([key, minor]) => ({ key, minor: Number(minor) }));
    const total = rows.reduce((s, row) => s + row.minor, 0) || 1;
    return rows.sort((a, b) => b.minor - a.minor).map((row) => ({ ...row, pct: Math.round((row.minor / total) * 100) }));
}

const ledgerTypeRows = computed(() => {
    const obj = report.value?.breakdowns.ledgerByEntryType ?? {};
    return Object.entries(obj)
        .map(([key, minor]) => ({ key, minor: Number(minor) }))
        .sort((a, b) => Math.abs(b.minor) - Math.abs(a.minor));
});

const reconciliationStatusRows = computed(() => countRows(report.value?.breakdowns.reconciliationByStatus));

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
    q.set('audience', audience.value);
    q.set('family', selectedFamily.value);
    q.set('group_by', groupBy.value);
    try { await downloadAuthedCsv(`/api/v1/admin/reports/export.csv?${q.toString()}`, 'beverly-report'); }
    catch (e: any) { error.value = e?.message ?? 'CSV export failed.'; }
}

async function exportPowerBi() {
    const q = new URLSearchParams();
    if (since.value) q.set('since', since.value);
    if (until.value) q.set('until', until.value);
    q.set('audience', audience.value);
    q.set('group_by', groupBy.value);
    if (siteId.value) q.set('site_id', siteId.value);
    try { await downloadAuthedCsv(`/api/v1/admin/reports/power-bi.csv?${q.toString()}`, 'beverly-power-bi'); }
    catch (e: any) { error.value = e?.message ?? 'Power BI export failed.'; }
}

function exportPdf() {
    if (!report.value) return;
    const kp = report.value.kpis;
    const auditObj = report.value.breakdowns.auditActionsBreakdown || {};
    const auditTotal = Object.values(auditObj).reduce((s: any, n: any) => s + n, 0) || 1;
    const auditBreakdown = Object.entries(auditObj).map(([action, count]) => ({
        action,
        count: Number(count),
        pct: Math.round((Number(count) / auditTotal) * 100)
    })).sort((a, b) => b.count - a.count);

    const secObj = report.value.breakdowns.securitySeveritiesBreakdown || {};
    const secTotal = Object.values(secObj).reduce((s: any, n: any) => s + n, 0) || 1;
    const securityBreakdown = Object.entries(secObj).map(([severity, count]) => ({
        severity,
        count: Number(count),
        pct: Math.round((Number(count) / secTotal) * 100)
    })).sort((a, b) => b.count - a.count);

    downloadReportPdf({
        family: selectedFamily.value,
        title: `${audienceLabel.value} ${selectedTemplate.value.title}`,
        period: `${report.value.range.since.slice(0, 10)} to ${report.value.range.until.slice(0, 10)} | ${report.value.range.days} days`,
        generatedBy: `Beverly Wallet Admin · ${audienceLabel.value}`,
        kpis: selectedFamily.value === 'audit' ? [
            { label: 'Audit Logs', value: fmtNum(kp.auditLogsCount || 0), note: 'Total events recorded' },
            { label: 'Security Events', value: fmtNum(kp.securityEventsCount || 0), note: 'Auth & abuse events' },
            { label: 'High Alerts', value: fmtNum(kp.securityAlertsHigh || 0), note: 'High & critical severity' },
            { label: 'Success rate', value: `${kp.successRate}%`, note: `${fmtNum(kp.failedCount)} failed vends` },
            { label: 'Funding inflow', value: naira(kp.fundingApprovedMinor), note: `${fmtNum(kp.fundingCount)} top-ups` },
            { label: 'Disputes opened', value: fmtNum(kp.disputesOpened), note: `${fmtNum(kp.refundCount)} refunds` },
        ] : [
            { label: 'Revenue', value: naira(kp.revenueMinor), note: `${fmtNum(kp.deliveredCount)} delivered` },
            { label: 'Energy value', value: naira(kp.energyRevenueMinor), note: 'Token value' },
            { label: 'Funding inflow', value: naira(kp.fundingApprovedMinor), note: `${fmtNum(kp.fundingCount)} top-ups` },
            { label: 'Success rate', value: `${kp.successRate}%`, note: `${fmtNum(kp.failedCount)} failed` },
            { label: 'Settlement net', value: naira(kp.settlementNetMinor), note: `${fmtNum(kp.settlementBatches)} batches` },
            { label: 'Disputes opened', value: fmtNum(kp.disputesOpened), note: `${fmtNum(kp.refundCount)} refunds` },
            { label: 'Ledger net flow', value: naira(kp.ledgerNetMinor ?? 0), note: `${fmtNum(kp.ledgerEntryCount ?? 0)} entries` },
            { label: 'Active holds', value: naira(kp.activeHoldsMinor ?? 0), note: `${fmtNum(kp.activeHoldsCount ?? 0)} open` },
        ],
        series: report.value.series.daily,
        statusRows: statusRows.value,
        actorRows: actorRows.value,
        stations: report.value.breakdowns.topStations,
        entityBreakdowns: report.value.breakdowns.entityPerformance,
        groupBy: groupBy.value,
        insights: reportInsights(kp),
        money: naira,
        auditBreakdown,
        securityBreakdown,
        fundingRows: moneyRows(report.value.breakdowns.fundingByChannel),
        fundingStatusRows: countRows(report.value.breakdowns.fundingRequestsByStatus),
        disputeRows: countRows(report.value.breakdowns.disputesByStatus),
        refundRows: countRows(report.value.breakdowns.refundsByStatus),
        settlementRows: countRows(report.value.breakdowns.settlementByStatus),
        sources: report.value.sources ?? {},
    });
}

function reportInsights(kp: ReportOverview['kpis']): string[] {
    const success = Number(kp.successRate ?? 0).toFixed(1);
    const refundRate = kp.purchaseCount ? ((kp.refundCount / kp.purchaseCount) * 100).toFixed(1) : '0.0';
    const primaryStation = report.value?.breakdowns.topStations[0];
    return [
        `Delivery success reached ${success}% across the selected period.`,
        `Funding inflow totalled ${naira(kp.fundingApprovedMinor)}.`,
        `Refund volume represented ${refundRate}% of purchases.`,
        primaryStation ? `${primaryStation.station_id} generated the highest station revenue.` : 'No station ranking was available.',
    ];
}

function selectTemplate(id: ReportFamily) {
    if (selectedFamily.value === id) return;
    selectedFamily.value = id;
    metric.value = REPORT_TEMPLATES.find((item) => item.id === id)?.metric ?? 'revenueMinor';
    void load();
}

onMounted(() => {
    void loadStations();
    applyPreset(30, '30d');
});
</script>

<template>
  <AppShell title="Reports">
    <section class="rp-intro">
      <div>
        <p class="bw-label">Beverly reporting centre</p>
        <h1>Build decision-ready reports.</h1>
        <p>Select a report, confirm dates, then export.</p>
      </div>
      <div class="rp-download-note">
        <strong>{{ loading ? 'Loading data' : 'Export ready' }}</strong>
        <span>{{ selectedTemplate.title }} selected.</span>
      </div>
    </section>

    <p class="rp-step-label">Step 1 · Select report</p>
    <section class="rp-templates" aria-label="Report templates">
      <button
        v-for="template in REPORT_TEMPLATES"
        :key="template.id"
        :class="['rp-template', selectedFamily === template.id && 'selected']"
        :aria-pressed="selectedFamily === template.id"
        @click="selectTemplate(template.id)"
      >
        <span class="rp-template-index">{{ template.icon }}</span>
        <strong>{{ template.title }}</strong>
        <span>{{ template.description }}</span>
        <em>{{ selectedFamily === template.id ? 'Selected' : 'Select report' }}</em>
      </button>
    </section>
    <p class="rp-step-label">Step 2 · Choose ownership</p>
    <section class="rp-audiences" aria-label="Report ownership">
      <button
        v-for="item in AUDIENCES"
        :key="item.key"
        :class="['rp-audience', audience === item.key && 'selected']"
        :aria-pressed="audience === item.key"
        :disabled="loading"
        @click="selectAudience(item.key)"
      >
        <strong>{{ item.label }}</strong>
        <span>{{ item.description }}</span>
      </button>
    </section>
    <p class="rp-step-label">Step 3 · Group performance</p>
    <section class="rp-segmentation" aria-label="Performance grouping">
      <div class="rp-groupings">
        <button
          v-for="item in GROUPINGS"
          :key="item.key"
          :class="['rp-audience', groupBy === item.key && 'selected']"
          :aria-pressed="groupBy === item.key"
          :disabled="loading"
          @click="selectGrouping(item.key)"
        >
          <strong>{{ item.label }}</strong>
          <span>{{ item.description }}</span>
        </button>
      </div>
      <label class="rp-site-filter">
        <span>SiteID filter</span>
        <select v-model="siteId" class="bw-input" :disabled="loading" @change="selectSite">
          <option value="">All permitted sites</option>
          <option v-for="station in stations" :key="station.stationId" :value="station.stationId">
            {{ station.name }} · {{ station.stationId }}
          </option>
        </select>
      </label>
      <p class="rp-scope-note">Grouping changes the detailed table. Ownership filters sales channels.</p>
    </section>
<!-- Controls -->
    <div class="rp-controls" :aria-busy="loading">
      <p class="rp-step-label">Step 4 · Confirm reporting period</p>
      <div class="rp-presets">
        <button
          v-for="p in PRESETS" :key="p.key"
          :class="['rp-chip', activePreset === p.key && 'on']"
          @click="applyPreset(p.days, p.key)"
        >{{ p.label }}</button>
      </div>
      <div class="rp-range">
        <input v-model="since" type="date" class="bw-input bw-input-sm" aria-label="Report start date" />
        <span class="rp-range-sep">-</span>
        <input v-model="until" type="date" class="bw-input bw-input-sm" aria-label="Report end date" />
        <div class="rp-actions">
          <button class="bw-btn bw-btn-sm bw-btn-ghost" :disabled="loading" @click="applyCustom">Apply dates</button>
          <button class="bw-btn bw-btn-sm" :disabled="!report || loading" @click="exportCsv">Daily CSV</button>
          <button class="bw-btn bw-btn-sm" :disabled="!report || loading || !entityRows.length" @click="exportPowerBi">Power BI CSV</button>
          <button class="bw-btn bw-btn-sm rp-generate" :disabled="!report || loading" @click="exportPdf">Export PDF</button>
        </div>
      </div>
      <p v-if="rangeError" class="rp-range-error" role="alert">{{ rangeError }}</p>
    </div>

    <div v-if="error" class="bw-error-banner rp-error" role="alert">
      <span>{{ error }}</span>
      <button class="bw-btn bw-btn-sm" :disabled="loading" @click="load">Retry</button>
    </div>

    <!-- KPI grid -->
    <div class="rp-kpis bw-mobile-kpi-grid">
      <div class="rp-kpi rp-kpi--hero">
        <span class="rp-kpi-label">{{ audience === 'customer' ? 'Customer purchases' : audience === 'vendor' ? 'Vendor revenue' : 'Total revenue' }}</span>
        <strong :class="['rp-kpi-value', loading && 'rp-skeleton']">{{ loading ? '' : fmtMoney(k?.revenueMinor ?? 0) }}</strong>
        <span class="rp-kpi-sub">{{ fmtNum(k?.deliveredCount ?? 0) }} delivered &middot; avg {{ fmtMoney(k?.avgOrderValueMinor ?? 0) }}</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">VAT collected</span>
        <strong :class="['rp-kpi-value', loading && 'rp-skeleton']">{{ loading ? '' : fmtMoney(k?.vatMinor ?? 0) }}</strong>
        <span class="rp-kpi-sub">energy {{ fmtMoney(k?.energyRevenueMinor ?? 0) }}</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">Success rate</span>
        <strong :class="['rp-kpi-value', loading && 'rp-skeleton']">{{ loading ? '' : (k?.successRate ?? 0) + '%' }}</strong>
        <span class="rp-kpi-sub">{{ fmtNum(k?.failedCount ?? 0) }} failed</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">{{ audience === 'vendor' ? 'Vendor funding' : audience === 'customer' ? 'Customer funding' : 'Funding inflow' }}</span>
        <strong :class="['rp-kpi-value', loading && 'rp-skeleton']">{{ loading ? '' : fmtMoney(k?.fundingApprovedMinor ?? 0) }}</strong>
        <span class="rp-kpi-sub">{{ fmtNum(k?.fundingCount ?? 0) }} top-ups</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">{{ audience === 'customer' ? 'Average purchase' : 'Settlement (net)' }}</span>
        <strong :class="['rp-kpi-value', loading && 'rp-skeleton']">{{ loading ? '' : fmtMoney(audience === 'customer' ? (k?.avgOrderValueMinor ?? 0) : (k?.settlementNetMinor ?? 0)) }}</strong>
        <span class="rp-kpi-sub">{{ audience === 'customer' ? fmtNum(k?.deliveredCount ?? 0) + ' delivered' : fmtNum(k?.settlementBatches ?? 0) + ' batches' }}</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">Refunds approved</span>
        <strong :class="['rp-kpi-value', loading && 'rp-skeleton']">{{ loading ? '' : fmtMoney(k?.refundApprovedMinor ?? 0) }}</strong>
        <span class="rp-kpi-sub">{{ fmtNum(k?.refundCount ?? 0) }} requests</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">Disputes</span>
        <strong :class="['rp-kpi-value', loading && 'rp-skeleton']">{{ loading ? '' : fmtNum(k?.disputesOpened ?? 0) }}</strong>
        <span class="rp-kpi-sub">opened in range</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">{{ audience === 'vendor' ? 'New vendors' : audience === 'customer' ? 'New customers' : 'New accounts' }}</span>
        <strong :class="['rp-kpi-value', loading && 'rp-skeleton']">{{ loading ? '' : fmtNum(audience === 'vendor' ? (k?.newVendors ?? 0) : audience === 'customer' ? (k?.newCustomers ?? 0) : (k?.newCustomers ?? 0) + (k?.newVendors ?? 0)) }}</strong>
        <span class="rp-kpi-sub">in range</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">Ledger net flow</span>
        <strong :class="['rp-kpi-value', loading && 'rp-skeleton']">{{ loading ? '' : fmtMoney(k?.ledgerNetMinor ?? 0) }}</strong>
        <span class="rp-kpi-sub">{{ fmtNum(k?.ledgerEntryCount ?? 0) }} ledger entries</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">Active holds</span>
        <strong :class="['rp-kpi-value', loading && 'rp-skeleton']">{{ loading ? '' : fmtMoney(k?.activeHoldsMinor ?? 0) }}</strong>
        <span class="rp-kpi-sub">{{ fmtNum(k?.activeHoldsCount ?? 0) }} open</span>
      </div>
      <div class="rp-kpi">
        <span class="rp-kpi-label">Reconciliation</span>
        <strong :class="['rp-kpi-value', loading && 'rp-skeleton']">{{ loading ? '' : fmtNum(k?.reconciliationMismatches ?? 0) }}</strong>
        <span class="rp-kpi-sub">mismatched of {{ fmtNum(k?.reconciliationRunCount ?? 0) }} runs</span>
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

      <div v-if="loading" class="rp-chart-skeleton" aria-label="Loading report"></div>
      <div v-else-if="!daily.length" class="bw-empty rp-empty">
        <span>No report data.</span>
        <button class="bw-btn bw-btn-sm" @click="applyPreset(30, '30d')">Use 30 days</button>
      </div>
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

    <section class="bw-card rp-entity-card" aria-labelledby="entity-performance-heading">
      <div class="rp-entity-head">
        <div>
          <p class="bw-label" style="color: var(--brand)">Performance breakdown</p>
          <h2 id="entity-performance-heading" class="bw-h2">{{ groupingLabel }} performance by SiteID</h2>
          <p>{{ fmtNum(filteredEntityRows.length) }} grouped rows. Monetary values use NGN minor units internally.</p>
        </div>
        <label class="rp-breakdown-search">
          <span>Search breakdown</span>
          <input v-model="breakdownSearch" class="bw-input" type="search" placeholder="SiteID, name, or identifier" @input="breakdownPage = 1" />
        </label>
      </div>
      <div v-if="loading" class="rp-table-skeleton" aria-label="Loading performance breakdown"></div>
      <div v-else-if="!filteredEntityRows.length" class="bw-empty">
        <span>No matching performance rows.</span>
        <button v-if="breakdownSearch" class="bw-btn bw-btn-sm" @click="breakdownSearch = ''">Clear search</button>
      </div>
      <div v-else class="rp-table-wrap">
        <table class="bw-table rp-entity-table">
          <caption class="sr-only">{{ groupingLabel }} purchase performance grouped within each SiteID.</caption>
          <thead>
            <tr>
              <th>SiteID</th>
              <th>{{ groupingLabel }}</th>
              <th v-if="groupBy !== 'site'">Identifier</th>
              <th>Purchases</th>
              <th>Delivered</th>
              <th>Success</th>
              <th v-if="groupBy === 'vendor'">Customers</th>
              <th v-if="groupBy === 'customer'">Direct</th>
              <th v-if="groupBy === 'customer'">Vendor-assisted</th>
              <th>Revenue</th>
              <th>Average</th>
              <th>Units</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in pagedEntityRows" :key="`${row.siteId}:${row.groupType}:${row.entityId}`">
              <td class="bw-mono bw-text-sm">{{ row.siteId }}</td>
              <td>{{ row.entityName }}</td>
              <td v-if="groupBy !== 'site'" class="bw-mono bw-text-sm">{{ row.entityId }}</td>
              <td>{{ fmtNum(row.purchaseCount) }}</td>
              <td>{{ fmtNum(row.deliveredCount) }}</td>
              <td>{{ row.successRate.toFixed(2) }}%</td>
              <td v-if="groupBy === 'vendor'">{{ fmtNum(row.customerCount) }}</td>
              <td v-if="groupBy === 'customer'">{{ fmtNum(row.directPurchaseCount) }}</td>
              <td v-if="groupBy === 'customer'">{{ fmtNum(row.vendorPurchaseCount) }}</td>
              <td>{{ fmtMoney(row.revenueMinor) }}</td>
              <td>{{ fmtMoney(row.averagePurchaseMinor) }}</td>
              <td>{{ row.unitsKwh.toLocaleString('en-NG', { maximumFractionDigits: 2 }) }} kWh</td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav v-if="breakdownPages > 1" class="rp-pagination" aria-label="Performance breakdown pages">
        <button class="bw-btn bw-btn-sm bw-btn-ghost" :disabled="breakdownPage === 1" @click="breakdownPage--">Previous</button>
        <span>Page {{ breakdownPage }} of {{ breakdownPages }}</span>
        <button class="bw-btn bw-btn-sm bw-btn-ghost" :disabled="breakdownPage === breakdownPages" @click="breakdownPage++">Next</button>
      </nav>
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
          <span class="rp-bar-val">{{ fmtNum(r.count) }} &middot; {{ r.pct }}%</span>
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
        <p class="bw-label" style="color: var(--brand)">Ledger</p>
        <h2 class="bw-h2">Movement by entry type</h2>
        <div v-if="!ledgerTypeRows.length" class="bw-empty">No ledger activity.</div>
        <table v-else class="bw-table rp-station-table">
          <thead><tr><th>Entry type</th><th>Net amount</th></tr></thead>
          <tbody>
            <tr v-for="r in ledgerTypeRows" :key="r.key">
              <td class="bw-text-sm">{{ r.key }}</td>
              <td :style="{ color: r.minor < 0 ? 'var(--danger)' : 'var(--brand)' }">{{ fmtMoney(r.minor) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="bw-card">
        <p class="bw-label" style="color: var(--brand)">Integrity</p>
        <h2 class="bw-h2">Reconciliation runs</h2>
        <div v-if="!reconciliationStatusRows.length" class="bw-empty">No reconciliation runs in range.</div>
        <div v-for="r in reconciliationStatusRows" :key="r.key" class="rp-bar-row">
          <span class="rp-bar-key">{{ r.key }}</span>
          <div class="rp-bar-track"><div class="rp-bar-fill" :style="{ width: r.pct + '%' }" /></div>
          <span class="rp-bar-val">{{ fmtNum(r.count) }} &middot; {{ r.pct }}%</span>
        </div>
        <p v-if="k?.reconciliationMismatchMinor" class="rp-kpi-sub" style="margin-top:8px">Total mismatch: {{ fmtMoney(k.reconciliationMismatchMinor) }}</p>
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
.rp-intro { display:flex; justify-content:space-between; gap:var(--s-4); align-items:flex-end; padding:var(--s-5); margin-bottom:var(--s-4); border:1px solid oklch(from var(--brand) l c h / .28); border-radius:var(--r-lg, 14px); background:linear-gradient(118deg, oklch(from var(--brand) l c h / .16), var(--surface, #0d1117) 56%); }
.rp-step-label { margin: 0; color: var(--text-muted); font-size: var(--t-xs); font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.rp-audiences { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:var(--s-3); margin:var(--s-2) 0 var(--s-4); }
.rp-segmentation { display:grid; grid-template-columns:minmax(0, 2fr) minmax(220px, 1fr); gap:var(--s-3); margin:var(--s-2) 0 var(--s-4); padding:var(--s-3); border:1px solid var(--border); border-radius:var(--r-lg); background:var(--surface); }
.rp-groupings { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:var(--s-3); }
.rp-site-filter, .rp-breakdown-search { display:grid; gap:6px; color:var(--text-muted); font-size:var(--t-xs); font-weight:700; }
.rp-scope-note { grid-column:1 / -1; margin:0; color:var(--text-muted); font-size:var(--t-xs); }
.rp-audience { display:grid; gap:3px; padding:var(--s-3) var(--s-4); text-align:left; color:var(--text); font:inherit; cursor:pointer; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); }
.rp-audience span { color:var(--text-muted); font-size:var(--t-xs); }
.rp-audience.selected { border-color:var(--brand); background:oklch(from var(--brand) l c h / .12); box-shadow:0 0 0 1px oklch(from var(--brand) l c h / .18); }
.rp-audience:disabled { cursor:wait; opacity:.72; }
.rp-skeleton, .rp-chart-skeleton { color: transparent; border-radius: var(--r-sm); background: linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2)); background-size: 200% 100%; animation: rp-shimmer 1.4s ease-in-out infinite; }
.rp-skeleton { display: block; width: 72%; min-height: 28px; }
.rp-chart-skeleton { min-height: 280px; }
.rp-empty { display: grid; justify-items: center; gap: var(--s-3); }
@keyframes rp-shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .rp-skeleton, .rp-chart-skeleton { animation: none; } }
.rp-intro h1 { margin:4px 0 7px; font-size:clamp(24px, 3vw, 34px); letter-spacing:-.045em; color:var(--text, #e2e8f0); }
.rp-intro p { margin:0; color:var(--text-muted, #94a3b8); font-size:var(--t-sm); }
.rp-download-note { display:grid; gap:3px; min-width:180px; padding:var(--s-3) var(--s-4); border-left:2px solid var(--brand); background:oklch(from var(--brand) l c h / .08); }
.rp-download-note strong { color:var(--brand); font-size:var(--t-sm); text-transform:uppercase; letter-spacing:.08em; }
.rp-download-note span { color:var(--text-muted, #94a3b8); font-size:var(--t-xs); }
.rp-templates { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:var(--s-3); margin-bottom:var(--s-4); }
.rp-template { position:relative; isolation:isolate; display:grid; grid-template-rows:auto auto 1fr auto; gap:8px; min-height:158px; padding:16px; text-align:left; color:var(--text, #e2e8f0); font:inherit; cursor:pointer; border:1px solid var(--border, #1e293b); border-radius:var(--r-lg, 14px); background:linear-gradient(145deg, var(--surface-2, #111821), var(--surface, #0d1117)); box-shadow:0 10px 24px rgb(0 0 0 / .12); transition:transform .16s ease, border-color .16s ease, box-shadow .16s ease; overflow:hidden; }
.rp-template::after { content:''; position:absolute; z-index:-1; width:96px; height:96px; border-radius:50%; right:-50px; bottom:-50px; background:oklch(from var(--brand) l c h / .13); }
.rp-template:focus-visible { outline:3px solid oklch(from var(--brand) l c h / .42); outline-offset:3px; }
.rp-template.selected { border-color:var(--brand); background:linear-gradient(145deg, oklch(from var(--brand) l c h / .16), var(--surface, #0d1117)); box-shadow:0 0 0 1px oklch(from var(--brand) l c h / .2), 0 14px 30px oklch(from var(--brand) l c h / .08); }
.rp-template-index { display:inline-grid; place-items:center; width:30px; height:30px; border:1px solid oklch(from var(--brand) l c h / .22); border-radius:9px; color:var(--brand); background:oklch(from var(--brand) l c h / .09); font:800 11px var(--font-mono, monospace); letter-spacing:.06em; }
.rp-template strong { position:relative; z-index:1; font-size:var(--t-md); line-height:1.2; letter-spacing:-.02em; }
.rp-template span:not(.rp-template-index) { position:relative; z-index:1; display:-webkit-box; overflow:hidden; color:var(--text-muted, #94a3b8); font-size:var(--t-xs); line-height:1.35; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
.rp-template em { position:relative; z-index:1; justify-self:start; margin-top:auto; padding:4px 8px; border-radius:999px; color:var(--brand); background:oklch(from var(--brand) l c h / .1); font-size:10px; line-height:1.2; font-style:normal; font-weight:800; }
.rp-template.selected em { color:var(--brand-contrast, #fff); background:var(--brand); }
@media (hover:hover) { .rp-template:hover { transform:translateY(-2px); border-color:oklch(from var(--brand) l c h / .55); box-shadow:0 14px 30px rgb(0 0 0 / .18); } }
.rp-generate { background:var(--brand); color:var(--brand-contrast, #fff); }
.rp-controls {
  display: grid;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
  padding: var(--s-4);
  background: var(--surface, #0d1117);
  border: 1px solid var(--border, #1e293b);
  border-radius: var(--r-lg, 14px);
}

.rp-presets,
.rp-metric-toggle,
.rp-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.rp-range {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.rp-range .bw-input {
  min-width: 0;
  width: 100%;
}

.rp-actions {
  justify-content: flex-end;
}

.rp-range-sep { color: var(--text-muted, #94a3b8); }
.rp-range-error { margin: 0; color: var(--danger); font-size: var(--t-sm); }
.rp-error { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); }
.rp-chip { padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border, #1e293b); background: transparent; color: var(--text-muted, #94a3b8); font-size: var(--t-sm); font-weight: 600; cursor: pointer; transition: all .15s; }
.rp-chip.sm { padding: 4px 10px; font-size: var(--t-xs); }
.rp-chip:hover { color: var(--text, #e2e8f0); border-color: var(--border-strong, #334155); }
.rp-chip.on { background: oklch(from var(--brand) l c h / .14); border-color: oklch(from var(--brand) l c h / .4); color: var(--brand); }

.rp-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); gap: var(--s-3); margin-bottom: var(--s-4); }
.rp-kpi { background: var(--surface, #0d1117); border: 1px solid var(--border, #1e293b); border-radius: var(--r-lg, 14px); padding: var(--s-4); display: flex; flex-direction: column; gap: 4px; }
.rp-kpi--hero { grid-column: span 2; background: linear-gradient(135deg, oklch(from var(--brand) l c h / .12), var(--surface, #0d1117)); border-color: oklch(from var(--brand) l c h / .3); }
.rp-kpi-label { font-size: var(--t-xs); text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint, #64748b); font-weight: 700; }
.rp-kpi-value { font-size: var(--t-2xl); font-weight: 800; letter-spacing: 0; font-family: var(--font-mono, monospace); }
.rp-kpi-sub { font-size: var(--t-xs); color: var(--text-muted, #94a3b8); }

.rp-chart-card { margin-bottom: var(--s-4); }
.rp-chart-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s-3); flex-wrap: wrap; margin-bottom: var(--s-4); }
.rp-chart { width: 100%; height: auto; overflow: visible; }
.rp-grid { stroke: var(--border, #1e293b); stroke-width: 1; stroke-dasharray: 3 4; }
.rp-grid-label { fill: var(--text-faint, #64748b); font-size: 10px; font-family: var(--font-mono, monospace); }
.rp-axis-label { fill: var(--text-muted, #94a3b8); font-size: 10px; }

.rp-entity-card { margin-bottom:var(--s-4); }
.rp-entity-head { display:flex; align-items:end; justify-content:space-between; gap:var(--s-4); margin-bottom:var(--s-4); }
.rp-entity-head p { margin:4px 0 0; color:var(--text-muted); font-size:var(--t-xs); }
.rp-breakdown-search { min-width:min(320px, 100%); }
.rp-table-wrap { overflow:auto; border:1px solid var(--border); border-radius:var(--r-md); }
.rp-entity-table { min-width:1040px; }
.rp-entity-table th { white-space:nowrap; }
.rp-table-skeleton { min-height:240px; border-radius:var(--r-md); background:linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2)); background-size:200% 100%; animation:rp-shimmer 1.4s ease-in-out infinite; }
.rp-pagination { display:flex; align-items:center; justify-content:flex-end; gap:var(--s-3); margin-top:var(--s-3); color:var(--text-muted); font-size:var(--t-sm); }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }

.rp-breakdowns { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: var(--s-4); }
.rp-bar-row { display: grid; grid-template-columns: 90px 1fr auto; align-items: center; gap: 10px; margin: 10px 0; }
.rp-bar-key { font-size: var(--t-sm); text-transform: capitalize; color: var(--text-dim, #cbd5e1); }
.rp-bar-track { height: 8px; background: var(--surface-2, #161b22); border-radius: 999px; overflow: hidden; }
.rp-bar-fill { height: 100%; border-radius: 999px; background: var(--brand); transition: width .5s cubic-bezier(.4,0,.2,1); }
.rp-bar-val { font-size: var(--t-xs); font-family: var(--font-mono, monospace); color: var(--text-muted, #94a3b8); white-space: nowrap; }
.rp-station-table td, .rp-station-table th { text-align: left; }

@media (max-width: 640px) {
  .rp-intro { display:grid; padding:var(--s-4); }
  .rp-templates { grid-template-columns:repeat(2, minmax(0, 1fr)); }
  .rp-template { min-height:150px; padding:13px; }
  .rp-kpis > .rp-kpi {
    min-height:79px;
    padding:10px !important;
    gap:5px !important;
  }
  .rp-kpi--hero { grid-column: span 1; }
  .rp-controls { padding: var(--s-3); }
  .rp-segmentation { grid-template-columns:1fr; }
  .rp-presets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .rp-chip { padding-inline: 8px; }
  .rp-range {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  }
  .rp-actions {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .rp-actions .bw-btn {
    justify-content: center;
  }
  .rp-entity-head { display:grid; align-items:stretch; }
  .rp-breakdown-search { min-width:0; }
}

@media (max-width: 440px) {
  .rp-audiences { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .rp-groupings { grid-template-columns:1fr; }
  .rp-audience { justify-items:center; padding-inline:var(--s-2); text-align:center; }
  .rp-audience span { display:none; }
  .rp-templates { grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px; }
  .rp-template { min-height:148px; padding:12px; }
  .rp-template strong { font-size:13px; }
  .rp-template-index { width:28px; height:28px; }
  .rp-actions { grid-template-columns: 1fr; }
  .rp-actions .bw-btn { width: 100%; }
  .rp-bar-row { grid-template-columns: minmax(0, 1fr) auto; }
  .rp-bar-track { grid-column: 1 / -1; }
}
</style>


