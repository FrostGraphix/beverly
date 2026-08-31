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
      <BaseButton
        v-for="rt in reportTypes"
        :key="rt.id"
        variant="quiet"
        class="report-type-card"
        :class="{ active: selectedType === rt.id }"
        @click="selectType(rt.id)"
      >
        <span class="report-type-icon" v-html="typeIcon(rt.icon)"></span>
        <span class="report-type-label">{{ rt.label }}</span>
        <span class="report-type-desc">{{ rt.description }}</span>
      </BaseButton>
    </div>

    <!-- Controls Bar -->
    <div class="report-controls">
      <div class="report-controls-primary">
        <div class="report-presets">
          <BaseButton
            v-for="p in presets"
            :key="p.value"
            variant="quiet"
            class="report-preset-btn"
            :class="{ active: activePreset === p.value }"
            @click="applyPreset(p.value)"
          >{{ p.label }}</BaseButton>
        </div>
        <BaseSelect
          v-if="stationFilterEnabled"
          v-model="stationId"
          class="report-station-select"
          aria-label="Filter reports by station"
          @change="applyStationFilter"
        >
          <option v-for="station in stationOptions" :key="station.value || 'all'" :value="station.value">
            {{ station.value ? station.label : 'All Stations' }}
          </option>
        </BaseSelect>
      </div>
      <ExportToolbar
        :rows="rows"
        :columns="reportColumns"
        :title="exportTitle"
        :filename="exportFilename"
        :disabled="loading || !reportData"
        :allowed-formats="['csv', 'excel', 'pdf']"
        :pdfExporter="exportPremiumPdf"
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
          {{ kpi.delta >= 0 ? 'â†‘' : 'â†“' }} {{ Math.abs(kpi.delta) }}%
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
    <div v-else-if="!rows.length && !loading" class="ops-empty">
      <strong>No report data</strong>
      <span>Try another period.</span>
      <BaseButton size="sm" @click="applyPreset('30d')">Use 30 days</BaseButton>
    </div>

    <!-- Data Table -->
    <BaseTableShell v-else class="report-table-shell">
      <div class="ops-table-wrap">
        <table class="ops-table" :aria-label="`${activeReportLabel} table`">
        <thead>
          <tr>
            <th v-for="col in reportColumns" :key="col.key">{{ col.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in pagedRows" :key="ri" @click="selectedRow = row" :class="{ 'row-selected': selectedRow === row }">
            <td v-for="col in reportColumns" :key="col.key">
              <template v-if="typeof col.value === 'function'">{{ col.value(row) }}</template>
              <template v-else>{{ row[col.key] ?? 'â€”' }}</template>
            </td>
          </tr>
        </tbody>
        </table>
      </div>
      <template #footer>
        <div class="pagination">
          <span>Total {{ rows.length }}</span>
          <BaseSelect v-model="pageSize" class="sort-select" aria-label="Page size" @change="changePageSize">
            <option v-for="option in pageSizeOptions" :key="option" :value="option">{{ option }}/page</option>
          </BaseSelect>
          <BaseButton class="page-chip" size="sm" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">&#8249;</BaseButton>
          <BaseButton v-for="page in pages" :key="page" :class="['page-chip', page === currentPage ? 'active' : '']" size="sm" @click="goToPage(page)">{{ page }}</BaseButton>
          <BaseButton class="page-chip" size="sm" :disabled="currentPage === pageCount" @click="goToPage(currentPage + 1)">&#8250;</BaseButton>
          <span>Go to</span>
          <BaseInput v-model="gotoPageInput" class="goto-input" type="number" min="1" :max="pageCount" aria-label="Go to page" @keyup.enter="applyGoto" />
          <BaseButton class="page-chip" size="sm" @click="applyGoto">Go</BaseButton>
        </div>
      </template>
    </BaseTableShell>

    <!-- Detail Drawer -->
    <div v-if="selectedRow" class="ops-drawer-overlay" @click.self="closeDrawer">
    <aside class="ops-drawer" role="dialog" aria-modal="true" aria-label="Row detail">
      <div class="drawer-head">
        <strong>{{ activeReportLabel }} Detail</strong>
        <BaseIconButton class="drawer-close" aria-label="Close row detail" @click="closeDrawer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </BaseIconButton>
      </div>
      <dl class="drawer-fields">
        <template v-for="col in reportColumns" :key="col.key">
          <dt>{{ col.label }}</dt>
          <dd>
            <template v-if="typeof col.value === 'function'">{{ col.value(selectedRow) }}</template>
            <template v-else>{{ selectedRow[col.key] ?? 'â€”' }}</template>
          </dd>
        </template>
      </dl>
    </aside>
    </div>
  </section>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseSelect from "./base/BaseSelect.vue";
import BaseTableShell from "./base/BaseTableShell.vue";
import ExportToolbar from "./base/ExportToolbar.vue";
import EChartPanel from "./EChartPanel.vue";
import { pageNumbers, pageSizeOptions as tablePageSizeOptions, paginateRows, totalPages } from "../services/table-helpers.mjs";
import { loadDynamicStationOptions, tableSiteOptions } from "../services/table-service.js";
import {
  reportTypes,
  fetcherForType,
  dateRangeFromPreset,
  buildKPIs,
  columnsForType,
  buildChartOptions
} from "../services/report-service.mjs";
import { downloadReportPdf } from "../services/report-pdf.js";

export default {
  name: "ReportsPage",
  components: { BaseButton, BaseIconButton, BaseInput, BaseSelect, BaseTableShell, ExportToolbar, EChartPanel },
  data() {
    return {
      reportTypes,
      stationOptions: tableSiteOptions,
      selectedType: "financial",
      stationId: "",
      activePreset: "7d",
      rows: [],
      reportData: null,
      kpis: [],
      chartOptions: null,
      loading: false,
      error: "",
      selectedRow: null,
      themeObserver: null,
      currentPage: 1,
      pageSize: 10,
      pageSizeOptions: tablePageSizeOptions,
      gotoPageInput: "1",
      presets: [
        { label: "1 Day", value: "1d" },
        { label: "7 Days", value: "7d" },
        { label: "30 Days", value: "30d" },
        { label: "1 Year", value: "365d" }
      ]
    };
  },
  computed: {
    reportColumns() { return columnsForType(this.selectedType); },
    pageCount() { return totalPages(this.rows.length, this.pageSize); },
    pages() { return pageNumbers(this.currentPage, this.pageCount); },
    pagedRows() { return paginateRows(this.rows, this.currentPage, this.pageSize); },
    stationFilterEnabled() { return ["financial", "transactions", "general"].includes(this.selectedType); },
    selectedStationLabel() {
      return this.stationOptions.find((station) => station.value === this.stationId)?.label || "All Stations";
    },
    exportTitle() {
      return this.stationFilterEnabled ? `${this.activeReportLabel} - ${this.selectedStationLabel}` : this.activeReportLabel;
    },
    exportFilename() {
      if (!this.stationFilterEnabled) return `beverly-${this.selectedType}-report`;
      const station = this.stationId ? this.stationId.toLowerCase() : "all-stations";
      return `beverly-${this.selectedType}-${station}-report`;
    },
    activeReportLabel() {
      return this.reportTypes.find((t) => t.id === this.selectedType)?.label || "Report";
    }
  },
  mounted() {
    loadDynamicStationOptions().catch(() => null);
    this.themeObserver = new MutationObserver(() => this.rebuildChart());
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    document.addEventListener("keydown", this.handleKeydown);
    this.loadReport();
  },
  beforeUnmount() {
    this.themeObserver?.disconnect();
    document.removeEventListener("keydown", this.handleKeydown);
  },
  methods: {
    selectType(type) {
      this.selectedType = type;
      if (!this.stationFilterEnabled) this.stationId = "";
      this.selectedRow = null;
      this.loadReport();
    },
    applyPreset(preset) {
      this.activePreset = preset;
      this.loadReport();
    },
    applyStationFilter() {
      this.loadReport();
    },
    async loadReport() {
      this.loading = true;
      this.error = "";
      this.selectedRow = null;
      try {
        const dateRange = dateRangeFromPreset(this.activePreset);
        const fetcher = fetcherForType(this.selectedType);
        const filters = this.stationFilterEnabled && this.stationId ? { stationId: this.stationId } : {};
        this.reportData = await fetcher(dateRange, filters);
        this.rows = this.reportData.rows || [];
        this.currentPage = 1;
        this.gotoPageInput = "1";
        this.kpis = buildKPIs(this.selectedType, this.reportData);
        this.chartOptions = buildChartOptions(this.selectedType, this.reportData, this.currentTheme());
      } catch (e) {
        this.error = e?.message || "Failed to load report.";
        this.reportData = null;
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
    },
    goToPage(page) {
      this.currentPage = Math.max(1, Math.min(this.pageCount, Number(page) || 1));
      this.gotoPageInput = String(this.currentPage);
      this.selectedRow = null;
    },
    changePageSize() {
      this.goToPage(1);
    },
    applyGoto() {
      this.goToPage(this.gotoPageInput);
    },
    closeDrawer() {
      this.selectedRow = null;
    },
    handleKeydown(event) {
      if (event.key === "Escape") this.closeDrawer();
    },
    exportPremiumPdf() {
      if (!this.reportData) return;
      const dateRange = dateRangeFromPreset(this.activePreset);
      downloadReportPdf({
        family: this.selectedType,
        title: this.exportTitle,
        filename: `${this.exportFilename}-${new Date().toISOString().slice(0, 10)}.pdf`,
        period: `${dateRange.start.slice(0, 10)} to ${dateRange.end.slice(0, 10)}${this.stationFilterEnabled ? ` | ${this.selectedStationLabel}` : ""}`,
        generatedBy: "Beverly",
        kpis: this.kpis,
        chartData: this.reportData.chartData || [],
        columns: this.reportColumns,
        rows: this.rows,
        insights: this.reportInsights()
      });
    },
    currentTheme() {
      return document.documentElement.dataset.theme || "light";
    },
    rebuildChart() {
      if (!this.reportData) return;
      this.chartOptions = buildChartOptions(this.selectedType, this.reportData, this.currentTheme());
    },
    reportInsights() {
      const sources = Object.entries(this.reportData?.sources || {}).filter(([, value]) => Number(value) > 0);
      return [
        `${this.rows.length.toLocaleString("en-NG")} detail rows matched this report period.`,
        sources.length ? `${sources.length} verified data sources contributed records.` : "No contributing records were returned.",
        "No report request errors occurred."
      ];
    }
  }
};
</script>

<style scoped>
.reports-page {
  --report-accent: var(--primary);
  --report-accent-2: var(--primary-hover);
  --report-good: var(--success);
  --report-border: color-mix(in srgb, var(--border-color, #e2e8f0) 78%, transparent);
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  min-height: 100%;
}

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
  width: 100%;
  height: auto;
  min-height: 112px;
  min-width: 0;
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
  white-space: normal;
  font-family: inherit;
  color: inherit;
}
.report-type-card:hover {
  border-color: var(--report-accent);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--report-accent) 16%, transparent);
}
.report-type-card.active {
  border-color: var(--report-accent);
  background: color-mix(in srgb, var(--primary-light) 76%, var(--glass-surface-strong));
  box-shadow: 0 0 0 3px var(--primary-light);
}

.report-type-icon { width: 20px; height: 20px; color: var(--report-accent); }
.report-type-icon svg { width: 100%; height: 100%; }
.report-type-label,
.report-type-desc {
  display: block;
  width: 100%;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
.report-type-label { font-size: 13px; font-weight: 700; line-height: 1.3; color: var(--text-strong); }
.report-type-desc { font-size: 11px; color: var(--text-muted); line-height: 1.4; }

/* Controls */
.report-controls { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.report-controls-primary { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.report-presets { display: flex; gap: 4px; }
.report-station-select { min-width: 148px; }
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
.report-preset-btn:hover { border-color: var(--report-accent); color: var(--text-main); }
.report-preset-btn.active {
  background: var(--report-accent);
  border-color: var(--report-accent);
  color: #fff;
}

/* KPI Strip */
.kpi-strip { display: flex; gap: 1px; background: var(--border-color, #e2e8f0); border-radius: var(--bev-radius-lg, 12px); overflow: hidden; }
.kpi-cell { flex: 1; background: var(--bg-card); padding: 14px 20px; display: flex; flex-direction: column; gap: 4px; }
.kpi-label { font-size: var(--bev-font-size-xs, 11px); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); }
.kpi-value { font-size: var(--bev-font-size-2xl, 18px); font-weight: 800; color: var(--text-strong); }
.tone-warn .kpi-value { color: var(--bev-color-amber-500, #f59e0b); }
.tone-danger .kpi-value { color: var(--bev-color-red-500, #ef4444); }
.tone-good .kpi-value { color: var(--report-good); }
.tone-info .kpi-value { color: var(--primary); }

.kpi-delta { font-size: 11px; font-weight: 700; }
.delta-up { color: var(--report-good); }
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
.ops-empty { display: grid; justify-items: center; gap: 8px; padding: 48px; text-align: center; color: var(--text-muted); font-size: 14px; }
.ops-empty strong { color: var(--text-strong); font-size: 16px; }

/* Drawer */
.ops-drawer-overlay { position: fixed; inset: 0; z-index: 2100; background: var(--bg-overlay); }
.ops-drawer { position: absolute; top: 0; right: 0; width: min(400px, 100vw); height: 100%; background: var(--bg-card); border-left: 1px solid var(--border-color); box-shadow: var(--bev-shadow-xl); padding: 24px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; }
.drawer-head { display: flex; justify-content: space-between; align-items: center; }
.drawer-close svg { width: 18px; height: 18px; }
.drawer-fields { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px; }
.drawer-fields dt { color: var(--text-muted); font-weight: 700; font-size: 11px; text-transform: uppercase; padding-top: 2px; }
.drawer-fields dd { color: var(--text-main); word-break: break-all; }

/* Vercel-aligned report surface */
.reports-page :deep(.base-button--primary) {
  background: #111;
  border-color: #111;
  box-shadow: none;
}

.reports-page :deep(.base-button--primary:hover) {
  background: #333;
  border-color: #333;
  box-shadow: none;
}

:global([data-theme="light"] .reports-page) { gap: 16px; }
:global([data-theme="light"] .report-type-strip) { gap: 8px; }
:global([data-theme="light"] .report-type-card),
:global([data-theme="light"] .report-chart-container),
:global([data-theme="light"] .ops-table-wrap) {
  border-color: #eaeaea;
  border-radius: 8px;
  box-shadow: none;
}
:global([data-theme="light"] .report-type-card) { border-width: 1px; }
:global([data-theme="light"] .report-type-card:hover) {
  border-color: #a3a3a3;
  transform: none;
  box-shadow: none;
}
:global([data-theme="light"] .report-type-card.active) {
  border-color: #111;
  background: #fff;
  box-shadow: inset 0 0 0 1px #111;
}
:global([data-theme="light"] .report-type-icon) { color: #111; }
:global([data-theme="light"] .report-preset-btn) {
  border-color: #eaeaea;
  border-radius: 6px;
  color: #666;
}
:global([data-theme="light"] .report-preset-btn:hover) {
  border-color: #a3a3a3;
  color: #111;
}
:global([data-theme="light"] .report-preset-btn.active) {
  background: #111;
  border-color: #111;
  color: #fff;
}
:global([data-theme="light"] .kpi-strip) { background: #eaeaea; border-radius: 8px; }
:global([data-theme="light"] .report-chart-container) { padding: 18px; }
:global([data-theme="light"] .ops-table thead th) { background: #fafafa; border-color: #eaeaea; }
:global([data-theme="light"] .ops-table tbody tr) { border-color: #eaeaea; }
:global([data-theme="light"] .ops-table tbody tr:hover),
:global([data-theme="light"] .ops-table tbody tr.row-selected) { background: #fafafa; }

:global([data-theme="executive"] .reports-page),
:global([data-theme="contrast"] .reports-page) { gap: 16px; }
:global([data-theme="executive"] .report-type-strip),
:global([data-theme="contrast"] .report-type-strip) { gap: 8px; }
:global([data-theme="executive"] .report-type-card),
:global([data-theme="contrast"] .report-type-card),
:global([data-theme="executive"] .report-chart-container),
:global([data-theme="contrast"] .report-chart-container),
:global([data-theme="executive"] .ops-table-wrap),
:global([data-theme="contrast"] .ops-table-wrap) {
  border-color: #262626;
  border-radius: 8px;
  box-shadow: none;
}
:global([data-theme="executive"] .report-type-card),
:global([data-theme="contrast"] .report-type-card) { border-width: 1px; }
:global([data-theme="executive"] .report-type-card:hover),
:global([data-theme="contrast"] .report-type-card:hover) {
  border-color: #737373;
  transform: none;
  box-shadow: none;
}
:global([data-theme="executive"] .report-type-card.active),
:global([data-theme="contrast"] .report-type-card.active) {
  border-color: #fff;
  background: #111;
  box-shadow: inset 0 0 0 1px #fff;
}
:global([data-theme="executive"] .report-type-icon),
:global([data-theme="contrast"] .report-type-icon) { color: #fff; }
:global([data-theme="executive"] .report-preset-btn),
:global([data-theme="contrast"] .report-preset-btn) {
  background: #111;
  border-color: #262626;
  border-radius: 6px;
  color: #a3a3a3;
}
:global([data-theme="executive"] .report-preset-btn:hover),
:global([data-theme="contrast"] .report-preset-btn:hover) { border-color: #737373; color: #fff; }
:global([data-theme="executive"] .report-preset-btn.active),
:global([data-theme="contrast"] .report-preset-btn.active) {
  background: #fff;
  border-color: #fff;
  color: #111;
}
:global([data-theme="executive"] .kpi-strip),
:global([data-theme="contrast"] .kpi-strip) { background: #262626; border-radius: 8px; }
:global([data-theme="executive"] .ops-table thead th),
:global([data-theme="contrast"] .ops-table thead th) { background: #111; border-color: #262626; }
:global([data-theme="executive"] .ops-table tbody tr),
:global([data-theme="contrast"] .ops-table tbody tr) { border-color: #262626; }
:global([data-theme="executive"] .ops-table tbody tr:hover),
:global([data-theme="executive"] .ops-table tbody tr.row-selected),
:global([data-theme="contrast"] .ops-table tbody tr:hover),
:global([data-theme="contrast"] .ops-table tbody tr.row-selected) { background: #171717; }
:global([data-theme="executive"] .reports-page .base-button--primary),
:global([data-theme="contrast"] .reports-page .base-button--primary) {
  background: #fff;
  border-color: #fff;
  color: #111;
}
:global([data-theme="executive"] .reports-page .base-button--primary:hover),
:global([data-theme="contrast"] .reports-page .base-button--primary:hover) {
  background: #e5e5e5;
  border-color: #e5e5e5;
}

/* Theme-safe report interactions. */
:global([data-theme="light"] .report-type-card:hover),
:global([data-theme="light"] .report-type-card.active),
:global([data-theme="light"] .report-preset-btn:hover) {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary-light) 70%, var(--glass-surface-strong));
  color: var(--text-strong);
}

:global([data-theme="executive"] .report-type-card:hover),
:global([data-theme="executive"] .report-type-card.active),
:global([data-theme="executive"] .report-preset-btn:hover) {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary-light) 72%, var(--glass-surface-strong));
  color: var(--text-strong);
}

:global([data-theme="contrast"] .report-type-card:hover),
:global([data-theme="contrast"] .report-type-card.active),
:global([data-theme="contrast"] .report-preset-btn:hover) {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary-light) 72%, var(--glass-surface-strong));
  color: var(--text-strong);
}

:global([data-theme] .report-type-icon) {
  color: var(--primary);
}

:global([data-theme] .report-preset-btn.active),
:global([data-theme] .reports-page .base-button--primary) {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--text-inverse);
  box-shadow: none;
}

:global([data-theme] .reports-page .base-button--primary:hover) {
  border-color: var(--primary-hover);
  background: var(--primary-hover);
  color: var(--text-inverse);
}

:global([data-theme] .ops-table tbody tr:hover),
:global([data-theme] .ops-table tbody tr.row-selected) {
  background: var(--primary-light);
}

@media (max-width: 768px) {
  .reports-page { padding: 16px; }
  .report-type-strip { grid-template-columns: repeat(2, 1fr); }
  .report-controls,
  .report-controls-primary { width: 100%; align-items: stretch; }
  .report-controls-primary { display: grid; grid-template-columns: 1fr; }
  .report-presets { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); width: 100%; }
  .report-preset-btn,
  .report-station-select { width: 100%; min-width: 0; }
  .kpi-strip { flex-wrap: wrap; }
  .kpi-cell { flex: 1 1 calc(50% - 1px); }
  .ops-drawer { width: 100vw; }
}

@media (max-width: 480px) {
  .report-presets { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.reports-page .report-type-card.active {
  border-color: var(--report-accent) !important;
  background: color-mix(in srgb, var(--primary-light) 76%, var(--glass-surface-strong)) !important;
  box-shadow: 0 0 0 3px var(--primary-light) !important;
}

.reports-page .report-type-icon {
  color: var(--report-accent) !important;
}

.reports-page .report-preset-btn.active {
  background: var(--report-accent) !important;
  border-color: var(--report-accent) !important;
  color: var(--text-inverse) !important;
}
</style>
