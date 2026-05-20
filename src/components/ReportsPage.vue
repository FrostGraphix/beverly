<template>
  <section class="ops-page reports-page" aria-label="Reports">
    <header class="ops-head">
      <div class="ops-head-text">
        <h1>Reports</h1>
        <p>Generate, view, and export operational reports</p>
      </div>
      <div class="ops-head-actions">
        <BaseButton @click="loadReport">Refresh</BaseButton>
      </div>
    </header>

    <!-- Report Type Selector -->
    <div class="report-type-strip">
      <button
        v-for="rt in reportTypes"
        :key="rt.id"
        class="report-type-card"
        :class="{ active: selectedType === rt.id }"
        @click="selectType(rt.id)"
      >
        <span class="report-type-icon" v-html="typeIcon(rt.icon)"></span>
        <span class="report-type-label">{{ rt.label }}</span>
        <span class="report-type-desc">{{ rt.description }}</span>
      </button>
    </div>

    <!-- Controls Bar -->
    <div class="report-controls">
      <div class="report-presets">
        <button
          v-for="p in presets"
          :key="p.value"
          class="report-preset-btn"
          :class="{ active: activePreset === p.value }"
          @click="applyPreset(p.value)"
        >{{ p.label }}</button>
      </div>
      <ExportToolbar
        :rows="rows"
        :columns="reportColumns"
        :title="activeReportLabel"
        :filename="`beverly-${selectedType}-report`"
        :disabled="!rows.length"
      />
    </div>

    <!-- KPI Strip -->
    <div class="kpi-strip" v-if="kpis.length">
      <div
        v-for="(kpi, i) in kpis"
        :key="i"
        class="kpi-cell"
        :class="kpi.tone ? `tone-${kpi.tone}` : ''"
      >
        <span class="kpi-label">{{ kpi.label }}</span>
        <span class="kpi-value">{{ kpi.value }}</span>
        <span v-if="kpi.delta != null" class="kpi-delta" :class="kpi.delta >= 0 ? 'delta-up' : 'delta-down'">
          {{ kpi.delta >= 0 ? '↑' : '↓' }} {{ Math.abs(kpi.delta) }}%
        </span>
      </div>
    </div>

    <!-- Chart -->
    <div class="report-chart-container" v-if="chartOptions && rows.length">
      <EChartPanel :option="chartOptions" :style="{ height: '280px', width: '100%' }" />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="ops-loading" aria-live="polite">
      <div v-for="n in 6" :key="n" class="skeleton-row-strip"></div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="ops-error" role="alert">
      {{ error }} <BaseButton size="sm" @click="loadReport">Retry</BaseButton>
    </div>

    <!-- Empty -->
    <div v-else-if="!rows.length && !loading" class="ops-empty">No data for this report period.</div>

    <!-- Data Table -->
    <div v-else class="ops-table-wrap">
      <table class="ops-table" :aria-label="`${activeReportLabel} table`">
        <thead>
          <tr>
            <th v-for="col in reportColumns" :key="col.key">{{ col.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in rows" :key="ri" @click="selectedRow = row" :class="{ 'row-selected': selectedRow === row }">
            <td v-for="col in reportColumns" :key="col.key">
              <template v-if="typeof col.value === 'function'">{{ col.value(row) }}</template>
              <template v-else>{{ row[col.key] ?? '—' }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Detail Drawer -->
    <aside v-if="selectedRow" class="ops-drawer" aria-label="Row detail">
      <div class="drawer-head">
        <strong>{{ activeReportLabel }} Detail</strong>
        <BaseButton size="sm" variant="ghost" @click="selectedRow = null">✕</BaseButton>
      </div>
      <dl class="drawer-fields">
        <template v-for="col in reportColumns" :key="col.key">
          <dt>{{ col.label }}</dt>
          <dd>
            <template v-if="typeof col.value === 'function'">{{ col.value(selectedRow) }}</template>
            <template v-else>{{ selectedRow[col.key] ?? '—' }}</template>
          </dd>
        </template>
      </dl>
    </aside>
  </section>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import ExportToolbar from "./base/ExportToolbar.vue";
import EChartPanel from "./EChartPanel.vue";
import {
  reportTypes,
  fetcherForType,
  dateRangeFromPreset,
  buildKPIs,
  columnsForType,
  buildChartOptions
} from "../services/report-service.mjs";

export default {
  name: "ReportsPage",
  components: { BaseButton, ExportToolbar, EChartPanel },
  data() {
    return {
      reportTypes,
      selectedType: "revenue",
      activePreset: "30d",
      rows: [],
      reportData: {},
      kpis: [],
      chartOptions: null,
      loading: false,
      error: "",
      selectedRow: null,
      presets: [
        { label: "Today", value: "today" },
        { label: "7 Days", value: "7d" },
        { label: "30 Days", value: "30d" },
        { label: "90 Days", value: "90d" },
        { label: "1 Year", value: "365d" }
      ]
    };
  },
  computed: {
    reportColumns() { return columnsForType(this.selectedType); },
    activeReportLabel() {
      return this.reportTypes.find((t) => t.id === this.selectedType)?.label || "Report";
    }
  },
  mounted() {
    this.loadReport();
  },
  methods: {
    selectType(type) {
      this.selectedType = type;
      this.selectedRow = null;
      this.loadReport();
    },
    applyPreset(preset) {
      this.activePreset = preset;
      this.loadReport();
    },
    async loadReport() {
      this.loading = true;
      this.error = "";
      this.selectedRow = null;
      try {
        const dateRange = dateRangeFromPreset(this.activePreset);
        const fetcher = fetcherForType(this.selectedType);
        this.reportData = await fetcher(dateRange);
        this.rows = this.reportData.rows || [];
        this.kpis = buildKPIs(this.selectedType, this.reportData);
        this.chartOptions = buildChartOptions(this.selectedType, this.reportData);
      } catch (e) {
        this.error = e?.message || "Failed to load report.";
        this.rows = [];
        this.kpis = [];
        this.chartOptions = null;
      } finally {
        this.loading = false;
      }
    },
    typeIcon(icon) {
      const icons = {
        chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
        wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
        users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 21 3 9 12 3 21 9 21 21"/><line x1="9" y1="21" x2="9" y2="13"/><line x1="15" y1="21" x2="15" y2="13"/></svg>'
      };
      return icons[icon] || icons.chart;
    }
  }
};
</script>

<style scoped>
.reports-page { display: flex; flex-direction: column; gap: 20px; padding: 24px; min-height: 100%; }

/* Header */
.ops-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.ops-head-text h1 { font-size: var(--bev-font-size-2xl, 18px); font-weight: 700; margin: 0 0 4px; color: var(--text-strong); }
.ops-head-text p { font-size: var(--bev-font-size-sm, 12px); color: var(--text-muted); margin: 0; }
.ops-head-actions { display: flex; gap: 8px; }

/* Report Type Cards */
.report-type-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.report-type-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 16px;
  background: var(--bg-card);
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: var(--bev-radius-lg, 12px);
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
  text-align: left;
  font-family: inherit;
  color: inherit;
}
.report-type-card:hover {
  border-color: var(--bev-color-green-300, #86efac);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.08);
}
.report-type-card.active {
  border-color: var(--bev-color-green-600, #059669);
  background: linear-gradient(135deg, rgba(5, 150, 105, 0.06), rgba(5, 150, 105, 0.02));
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.1);
}

.report-type-icon { width: 20px; height: 20px; color: var(--bev-color-green-600, #059669); }
.report-type-icon svg { width: 100%; height: 100%; }
.report-type-label { font-size: 13px; font-weight: 700; color: var(--text-strong); }
.report-type-desc { font-size: 11px; color: var(--text-muted); line-height: 1.4; }

/* Controls */
.report-controls { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.report-presets { display: flex; gap: 4px; }
.report-preset-btn {
  padding: 7px 14px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-muted, #64748b);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.report-preset-btn:hover { border-color: var(--bev-color-green-300, #86efac); color: var(--text-main); }
.report-preset-btn.active {
  background: var(--bev-color-green-600, #059669);
  border-color: var(--bev-color-green-600, #059669);
  color: #fff;
}

/* KPI Strip */
.kpi-strip { display: flex; gap: 1px; background: var(--border-color, #e2e8f0); border-radius: var(--bev-radius-lg, 12px); overflow: hidden; }
.kpi-cell { flex: 1; background: var(--bg-card); padding: 14px 20px; display: flex; flex-direction: column; gap: 4px; }
.kpi-label { font-size: var(--bev-font-size-xs, 11px); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); }
.kpi-value { font-size: var(--bev-font-size-2xl, 18px); font-weight: 800; color: var(--text-strong); }
.tone-warn .kpi-value { color: var(--bev-color-amber-500, #f59e0b); }
.tone-danger .kpi-value { color: var(--bev-color-red-500, #ef4444); }
.tone-good .kpi-value { color: var(--bev-color-green-600, #059669); }
.tone-info .kpi-value { color: var(--bev-color-blue-500, #0ea5e9); }

.kpi-delta { font-size: 11px; font-weight: 700; }
.delta-up { color: var(--bev-color-green-600, #059669); }
.delta-down { color: var(--bev-color-red-500, #ef4444); }

/* Chart */
.report-chart-container {
  background: var(--bg-card);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: var(--bev-radius-lg, 12px);
  padding: 20px;
}

/* Table */
.ops-table-wrap { overflow-x: auto; border-radius: var(--bev-radius-lg, 12px); border: 1px solid var(--border-color); }
.ops-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ops-table thead th { background: var(--bg-page); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); padding: 10px 16px; text-align: left; border-bottom: 1px solid var(--border-color); }
.ops-table tbody tr { border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background .15s; }
.ops-table tbody tr:hover, .ops-table tbody tr.row-selected { background: var(--primary-light, #eff6ff); }
.ops-table td { padding: 11px 16px; color: var(--text-main); vertical-align: middle; }

/* States */
.ops-loading { display: flex; flex-direction: column; gap: 8px; }
.skeleton-row-strip { height: 44px; background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-page) 50%, var(--bg-card) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: var(--bev-radius-sm, 6px); }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.ops-error { background: var(--bev-color-red-50, #fef2f2); border: 1px solid var(--bev-color-red-100, #fee2e2); color: var(--bev-color-red-600, #dc2626); border-radius: var(--bev-radius-md, 8px); padding: 12px 16px; display: flex; align-items: center; gap: 12px; font-size: 13px; }
.ops-empty { padding: 48px; text-align: center; color: var(--text-muted); font-size: 14px; }

/* Drawer */
.ops-drawer { position: fixed; top: 0; right: 0; width: 360px; max-width: 100vw; height: 100vh; background: var(--bg-card); border-left: 1px solid var(--border-color); box-shadow: var(--bev-shadow-xl); padding: 24px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; z-index: 200; }
.drawer-head { display: flex; justify-content: space-between; align-items: center; }
.drawer-fields { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px; }
.drawer-fields dt { color: var(--text-muted); font-weight: 700; font-size: 11px; text-transform: uppercase; padding-top: 2px; }
.drawer-fields dd { color: var(--text-main); word-break: break-all; }

@media (max-width: 768px) {
  .reports-page { padding: 16px; }
  .report-type-strip { grid-template-columns: repeat(2, 1fr); }
  .kpi-strip { flex-wrap: wrap; }
  .kpi-cell { flex: 1 1 calc(50% - 1px); }
  .ops-drawer { width: 100vw; }
  .report-presets { flex-wrap: wrap; }
}

@media (max-width: 480px) {
  .report-type-strip { grid-template-columns: 1fr; }
}
</style>
