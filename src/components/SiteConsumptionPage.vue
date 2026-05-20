<template>
  <div class="scp">
    <!-- ── Hero Header ── -->
    <header class="scp-hero">
      <div class="scp-hero-bg" />
      <div class="scp-hero-content">
        <div class="scp-hero-icon-wrap">
          <svg class="scp-hero-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66l4.07-7.27A.5.5 0 0 1 11.62 6H16l-1 7h3.5c.49 0 .56.33.47.51L13 21z"/>
          </svg>
        </div>
        <div class="scp-hero-title">
          <h1>Site Performance</h1>
          <p>Total consumption across sites, stations, and customers.</p>
        </div>
        <div class="scp-hero-actions">
          <button class="scp-btn scp-btn--primary" :disabled="anyLoading" @click="reload">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ 'scp-spin': anyLoading }">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            <span>{{ anyLoading ? 'Loading…' : 'Refresh' }}</span>
          </button>
          <button class="scp-btn scp-btn--ghost" :disabled="!canExport" @click="exportCsv">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>Export</span>
          </button>
        </div>
      </div>
    </header>

    <!-- ── Period + Custom Range ── -->
    <section class="scp-period-row">
      <div class="scp-period-pills">
        <button
          v-for="p in PERIODS"
          :key="p.key"
          :class="['scp-pill', activePeriod === p.key ? 'scp-pill--active' : '']"
          @click="pickPeriod(p.key)"
        >
          <span class="scp-pill-dot" />
          {{ p.label }}
        </button>
      </div>
      <div class="scp-period-meta">
        <div class="scp-date-pair">
          <input v-model="customFrom" type="date" class="scp-date-input" @change="onCustomDate" :title="'From'" />
          <span class="scp-date-arrow">→</span>
          <input v-model="customTo" type="date" class="scp-date-input" @change="onCustomDate" :title="'To'" />
        </div>
        <span class="scp-gran-chip">{{ granularityLabel }}</span>
      </div>
    </section>

    <div v-if="dateError" class="scp-alert scp-alert--warn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      {{ dateError }}
    </div>

    <!-- ── View Tabs ── -->
    <nav class="scp-views" role="tablist">
      <button
        v-for="v in VIEWS"
        :key="v.key"
        :class="['scp-view', activeView === v.key ? 'scp-view--active' : '']"
        @click="setView(v.key)"
      >
        <span class="scp-view-icon" v-html="v.icon" />
        <div class="scp-view-text">
          <strong>{{ v.label }}</strong>
          <small>{{ v.sub }}</small>
        </div>
      </button>
    </nav>

    <!-- ── KPI Cards ── -->
    <div class="scp-kpi-grid">
      <article v-for="(card, i) in kpiCards" :key="card.label" :class="['scp-kpi', `scp-kpi--${i}`]">
        <div class="scp-kpi-icon" v-html="card.icon" />
        <div class="scp-kpi-body">
          <span class="scp-kpi-label">{{ card.label }}</span>
          <strong class="scp-kpi-value">{{ card.value }}</strong>
          <small v-if="card.sub" class="scp-kpi-sub">{{ card.sub }}</small>
        </div>
        <div v-if="card.loading" class="scp-shimmer" />
      </article>
    </div>

    <!-- ── ALL SITES ── -->
    <template v-if="activeView === 'all'">
      <section class="scp-card">
        <header class="scp-card-head">
          <div class="scp-card-head-title">
            <span class="scp-card-bullet" />
            <strong>All Sites Consumption</strong>
          </div>
          <span class="scp-card-meta">{{ granularityLabel }} · {{ allAggRows.length }} periods</span>
        </header>
        <div v-if="loadingStations" class="scp-progress">
          <div class="scp-progress-fill" :style="{ width: loadPercent + '%' }" />
          <div class="scp-progress-label">Loading {{ loadedCount }}/{{ STATION_LIST.length }} stations</div>
        </div>
        <div v-if="stationErrors.length" class="scp-alert scp-alert--warn">
          Failed: {{ stationErrors.join(', ') }}
        </div>
        <div class="scp-chart-wrap">
          <EChartPanel :option="allChartOption" />
        </div>
      </section>

      <section class="scp-card">
        <header class="scp-card-head">
          <div class="scp-card-head-title">
            <span class="scp-card-bullet" />
            <strong>Consumption Ledger</strong>
          </div>
          <span class="scp-card-meta">{{ allDecoratedRows.length }} rows</span>
        </header>
        <div class="scp-table-scroll">
          <table class="scp-table">
            <thead>
              <tr>
                <th>Period</th>
                <th class="scp-num-col">Consumption (kWh)</th>
                <th class="scp-num-col">Change (kWh)</th>
                <th class="scp-status-col">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loadingStations && !allAggRows.length">
                <td colspan="4" class="scp-empty"><div class="scp-loader" /> Loading consumption data…</td>
              </tr>
              <tr v-else-if="!allDecoratedRows.length">
                <td colspan="4" class="scp-empty">No data for this period</td>
              </tr>
              <tr v-for="row in allVisibleRows" :key="row.id">
                <td class="scp-period-cell">{{ row.collectionDate }}</td>
                <td class="scp-num">{{ fmt(row.consumption) }}</td>
                <td :class="['scp-num', changeClass(row.change)]">{{ fmtChange(row.change) }}</td>
                <td><span :class="['scp-badge', row.status === 'Recorded' ? 'scp-badge--ok' : 'scp-badge--zero']">{{ row.status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer class="scp-pagination">
          <span class="scp-page-total">{{ allDecoratedRows.length }} total</span>
          <select v-model="allPageSize" class="scp-page-size" @change="allPage = 1">
            <option :value="10">10</option><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option>
          </select>
          <div class="scp-page-nav">
            <button class="scp-page-btn" :disabled="allPage <= 1" @click="allPage--">‹</button>
            <span class="scp-page-count">{{ allPage }} / {{ allPageCount || 1 }}</span>
            <button class="scp-page-btn" :disabled="allPage >= allPageCount" @click="allPage++">›</button>
          </div>
        </footer>
      </section>
    </template>

    <!-- ── BY STATION ── -->
    <template v-if="activeView === 'station'">
      <section class="scp-card">
        <header class="scp-card-head">
          <div class="scp-card-head-title">
            <span class="scp-card-bullet" />
            <strong>Station Comparison</strong>
          </div>
          <span class="scp-card-meta">{{ granularityLabel }} totals</span>
        </header>
        <div v-if="loadingStations" class="scp-progress">
          <div class="scp-progress-fill" :style="{ width: loadPercent + '%' }" />
        </div>
        <div class="scp-chart-wrap">
          <EChartPanel :option="stationBarOption" />
        </div>
      </section>

      <div class="scp-station-grid">
        <button
          v-for="st in stationSummary"
          :key="st.id"
          :class="['scp-station', activeStation === st.id ? 'scp-station--active' : '']"
          :style="{ '--station-color': st.color }"
          @click="toggleStation(st.id)"
        >
          <span class="scp-station-bar" />
          <div class="scp-station-info">
            <strong>{{ st.label }}</strong>
            <span v-if="st.loading" class="scp-station-status">Loading…</span>
            <span v-else-if="st.error" class="scp-station-err">{{ st.error }}</span>
            <span v-else class="scp-station-total">{{ fmt(st.total) }} <em>kWh</em></span>
          </div>
          <span v-if="st.loading" class="scp-spin-sm" />
          <svg v-else class="scp-station-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <section v-if="activeStation" class="scp-card scp-card--drill">
        <header class="scp-card-head">
          <div class="scp-card-head-title">
            <span class="scp-card-bullet" :style="{ background: stationColor(activeStation) }" />
            <strong>{{ activeStationLabel }}</strong>
            <span class="scp-card-meta">{{ granularityLabel }}</span>
          </div>
          <button class="scp-icon-btn" title="Close" @click="activeStation = ''">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <div class="scp-chart-wrap">
          <EChartPanel :option="drillChartOption" />
        </div>
        <div class="scp-table-scroll">
          <table class="scp-table">
            <thead>
              <tr>
                <th>Period</th>
                <th class="scp-num-col">Consumption (kWh)</th>
                <th class="scp-num-col">Change (kWh)</th>
                <th class="scp-status-col">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!drillRows.length">
                <td colspan="4" class="scp-empty">No data</td>
              </tr>
              <tr v-for="row in drillVisibleRows" :key="row.id">
                <td class="scp-period-cell">{{ row.collectionDate }}</td>
                <td class="scp-num">{{ fmt(row.consumption) }}</td>
                <td :class="['scp-num', changeClass(row.change)]">{{ fmtChange(row.change) }}</td>
                <td><span :class="['scp-badge', row.status === 'Recorded' ? 'scp-badge--ok' : 'scp-badge--zero']">{{ row.status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer class="scp-pagination">
          <span class="scp-page-total">{{ drillRows.length }} total</span>
          <select v-model="drillPageSize" class="scp-page-size" @change="drillPage = 1">
            <option :value="10">10</option><option :value="20">20</option><option :value="50">50</option>
          </select>
          <div class="scp-page-nav">
            <button class="scp-page-btn" :disabled="drillPage <= 1" @click="drillPage--">‹</button>
            <span class="scp-page-count">{{ drillPage }} / {{ drillPageCount || 1 }}</span>
            <button class="scp-page-btn" :disabled="drillPage >= drillPageCount" @click="drillPage++">›</button>
          </div>
        </footer>
      </section>
    </template>

    <!-- ── BY CUSTOMER ── -->
    <template v-if="activeView === 'customer'">
      <section class="scp-card scp-card--picker">
        <header class="scp-card-head">
          <div class="scp-card-head-title">
            <span class="scp-card-bullet" />
            <strong>Customer Lookup</strong>
          </div>
          <span class="scp-card-meta">Auto-resolves meter &amp; station</span>
        </header>
        <div class="scp-picker-grid">
          <div class="scp-picker-field">
            <label class="scp-picker-label">Customer</label>
            <div class="scp-picker-row">
              <input :value="custFilters.customerId" class="scp-picker-input" placeholder="Customer ID" readonly />
              <button class="scp-picker-btn" @click="activePicker = 'customer'">Browse</button>
              <button v-if="custFilters.customerId" class="scp-picker-clear" title="Clear" @click="clearCustomer">✕</button>
            </div>
            <span v-if="custFilters.customerName" class="scp-picker-resolved">{{ custFilters.customerName }}</span>
          </div>
          <div class="scp-picker-field">
            <label class="scp-picker-label">Meter <span class="scp-hint">resolved</span></label>
            <div class="scp-picker-row">
              <input :value="custFilters.meterId" class="scp-picker-input" placeholder="Auto" readonly />
              <button class="scp-picker-btn" @click="activePicker = 'meter'">Browse</button>
              <button v-if="custFilters.meterId" class="scp-picker-clear" title="Clear" @click="custFilters.meterId = ''">✕</button>
            </div>
          </div>
          <div class="scp-picker-field">
            <label class="scp-picker-label">Station <span class="scp-hint">resolved</span></label>
            <input :value="custFilters.stationId" class="scp-picker-input" placeholder="Auto" readonly />
          </div>
          <button
            class="scp-btn scp-btn--primary scp-picker-search"
            :disabled="!custFilters.customerId || custLoading"
            @click="loadCustomer"
          >
            <svg v-if="!custLoading" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span class="scp-spin-sm" v-else />
            <span>{{ custLoading ? custLoadingMsg : 'Search' }}</span>
          </button>
        </div>
      </section>

      <div v-if="custError" class="scp-alert scp-alert--danger">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {{ custError }}
      </div>

      <template v-if="custLoaded">
        <section class="scp-card">
          <header class="scp-card-head">
            <div class="scp-card-head-title">
              <span class="scp-card-bullet" />
              <strong>{{ custFilters.customerName || custFilters.customerId }}</strong>
              <span class="scp-card-meta">{{ granularityLabel }}</span>
            </div>
            <span class="scp-card-meta">
              {{ custAggRows.length }} periods · Meter {{ custFilters.meterId || '—' }} · {{ custFilters.stationId || '—' }}
            </span>
          </header>
          <div class="scp-chart-wrap">
            <EChartPanel :option="custChartOption" />
          </div>
        </section>

        <section class="scp-card">
          <header class="scp-card-head">
            <div class="scp-card-head-title">
              <span class="scp-card-bullet" />
              <strong>Customer Ledger</strong>
            </div>
          </header>
          <div class="scp-table-scroll">
            <table class="scp-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th class="scp-num-col">Consumption (kWh)</th>
                  <th class="scp-num-col">Change (kWh)</th>
                  <th class="scp-status-col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!custDecoratedRows.length">
                  <td colspan="4" class="scp-empty">No data for this customer in the selected period</td>
                </tr>
                <tr v-for="row in custVisibleRows" :key="row.id">
                  <td class="scp-period-cell">{{ row.collectionDate }}</td>
                  <td class="scp-num">{{ fmt(row.consumption) }}</td>
                  <td :class="['scp-num', changeClass(row.change)]">{{ fmtChange(row.change) }}</td>
                  <td><span :class="['scp-badge', row.status === 'Recorded' ? 'scp-badge--ok' : 'scp-badge--zero']">{{ row.status }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <footer class="scp-pagination">
            <span class="scp-page-total">{{ custDecoratedRows.length }} total</span>
            <select v-model="custPageSize" class="scp-page-size" @change="custPage = 1">
              <option :value="10">10</option><option :value="20">20</option><option :value="50">50</option>
            </select>
            <div class="scp-page-nav">
              <button class="scp-page-btn" :disabled="custPage <= 1" @click="custPage--">‹</button>
              <span class="scp-page-count">{{ custPage }} / {{ custPageCount || 1 }}</span>
              <button class="scp-page-btn" :disabled="custPage >= custPageCount" @click="custPage++">›</button>
            </div>
          </footer>
        </section>
      </template>

      <div v-else-if="!custLoading" class="scp-cust-empty">
        <div class="scp-cust-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <strong>No customer selected</strong>
        <span>Click <em>Browse</em> above to pick a customer, then hit Search.</span>
      </div>
    </template>

    <!-- ── Pickers ── -->
    <PickerModal
      v-if="activePicker === 'customer'"
      api="/api/customer/read"
      :columns="['customerId', 'customerName', 'stationId']"
      :column-labels="['ID', 'Name', 'Station']"
      label="Customer"
      :auto-confirm="true"
      @close="activePicker = ''"
      @select="onCustomerPick"
    />
    <PickerModal
      v-if="activePicker === 'meter'"
      api="/api/meter/read"
      :columns="['meterId', 'meterType', 'stationId']"
      :column-labels="['ID', 'Type', 'Station']"
      label="Meter"
      :auto-confirm="true"
      @close="activePicker = ''"
      @select="onMeterPick"
    />
  </div>
</template>

<script>
import EChartPanel from "./EChartPanel.vue";
import PickerModal from "./PickerModal.vue";
import BaseButton from "./base/BaseButton.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import { postApi } from "../services/api.js";
import { downloadTextFile, exportReportCsvText, exportReportExcelXml } from "../services/import-export.mjs";
import {
  aggregateConsumptionRows,
  buildBarChartOption,
  buildConsumptionPeriodRange,
  buildStationBarChartOption,
  decorateConsumptionRows,
  fetchConsumptionStatistics,
  summarizeConsumptionRows
} from "../services/consumption-statistics-service.mjs";

const STATION_LIST = [
  { id: "TUNGA",   label: "Tunga",   color: "#40c9c6" },
  { id: "UMAISHA", label: "Umaisha", color: "#10b981" },
  { id: "OGUFA",   label: "Ogufa",   color: "#f4516c" },
  { id: "KYAKALE", label: "Kyakale", color: "#34bfa3" },
  { id: "MUSHA",   label: "Musha",   color: "#ffb822" }
];

const PERIODS = [
  { key: "all",      label: "All Time" },
  { key: "annually", label: "Annual"   },
  { key: "monthly",  label: "Monthly"  },
  { key: "weekly",   label: "Weekly"   },
  { key: "daily",    label: "Daily"    }
];

const VIEWS = [
  {
    key: "all", label: "All Sites", sub: "Combined totals",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>'
  },
  {
    key: "station", label: "By Station", sub: "Per-site breakdown",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>'
  },
  {
    key: "customer", label: "By Customer", sub: "Individual usage",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
  }
];

const KPI_ICONS = {
  total:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  avg:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  peak:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  coverage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
};

const GRAN_LABELS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

function initStationMap() {
  return Object.fromEntries(STATION_LIST.map((s) => [s.id, { rows: [], loading: false, error: "" }]));
}

export default {
  name: "SiteConsumptionPage",
  props: {
    hash:  { type: String, default: "" },
    route: { type: Object, default: () => ({}) }
  },
  components: { BaseButton, BaseIconButton, BaseInput, EChartPanel, PickerModal },

  data() {
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 11);
      d.setDate(1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    })();
    return {
      PERIODS,
      VIEWS,
      STATION_LIST,
      activeView: "all",
      activePeriod: "monthly",
      customFrom: monthAgo,
      customTo: today,
      stationDataMap: initStationMap(),
      stationsLoaded: false,
      _stationGen: 0,
      activeStation: "",
      custFilters: { customerId: "", customerName: "", meterId: "", stationId: "" },
      custRawRows: [],
      custLoaded: false,
      custLoading: false,
      custLoadingMsg: "",
      custError: "",
      _custGen: 0,
      activePicker: "",
      allPage: 1,
      allPageSize: 20,
      drillPage: 1,
      drillPageSize: 20,
      custPage: 1,
      custPageSize: 20,
      chartTheme: null,
      themeObserver: null
    };
  },

  computed: {
    periodRange() {
      if (["all", "annually", "monthly", "weekly", "daily"].includes(this.activePeriod)) {
        return buildConsumptionPeriodRange(this.activePeriod);
      }
      return {
        from: this.customFrom || "2020-01-01",
        to:   this.customTo   || new Date().toISOString().slice(0, 10),
        granularity: this._customGranularity()
      };
    },
    granularity() { return this.periodRange.granularity; },
    granularityLabel() { return GRAN_LABELS[this.granularity] || this.granularity; },

    dateError() {
      if (this.periodRange.from > this.periodRange.to) {
        return '"From" date must be on or before "To" date.';
      }
      return "";
    },

    anyLoading() { return this.loadingStations || this.custLoading; },
    loadingStations() { return STATION_LIST.some((s) => this.stationDataMap[s.id].loading); },
    loadedCount() { return STATION_LIST.filter((s) => !this.stationDataMap[s.id].loading).length; },
    loadPercent() { return Math.round((this.loadedCount / STATION_LIST.length) * 100); },

    stationErrors() {
      return STATION_LIST
        .filter((s) => this.stationDataMap[s.id].error)
        .map((s) => `${s.label}: ${this.stationDataMap[s.id].error}`);
    },

    // ── ALL SITES ──
    allRawRows() { return STATION_LIST.flatMap((s) => this.stationDataMap[s.id].rows); },
    allAggRows() { return aggregateConsumptionRows(this.allRawRows, this.granularity); },
    allDecoratedRows() { return decorateConsumptionRows(this.allAggRows); },
    allSummary() {
      return summarizeConsumptionRows(this.allAggRows, {
        dateFrom: this.periodRange.from, dateTo: this.periodRange.to, granularity: this.granularity
      });
    },
    allChartOption() {
      if (!this.allAggRows.length) return this._emptyChartOption("All Sites Consumption");
      return buildBarChartOption(this.allAggRows, this.granularity, this.chartTheme || {}, "All Sites");
    },
    allPageCount() { return Math.max(1, Math.ceil(this.allDecoratedRows.length / this.allPageSize)); },
    allVisibleRows() {
      const s = (this.allPage - 1) * this.allPageSize;
      return this.allDecoratedRows.slice(s, s + this.allPageSize);
    },

    // ── BY STATION ──
    stationSummary() {
      return STATION_LIST.map((s) => {
        const entry = this.stationDataMap[s.id];
        const agg = aggregateConsumptionRows(entry.rows, this.granularity);
        const total = agg.reduce((sum, r) => sum + r.consumption, 0);
        return {
          id: s.id, label: s.label, color: s.color,
          rows: agg, total: Number(total.toFixed(3)),
          loading: entry.loading, error: entry.error
        };
      });
    },
    stationBarOption() {
      const hasData = this.stationSummary.some((s) => s.total > 0);
      if (!hasData) return this._emptyChartOption("Station Comparison");
      return buildStationBarChartOption(this.stationSummary, this.chartTheme || {});
    },
    activeStationLabel() {
      return STATION_LIST.find((s) => s.id === this.activeStation)?.label || this.activeStation;
    },
    drillRows() {
      if (!this.activeStation) return [];
      const rows = this.stationDataMap[this.activeStation].rows;
      return decorateConsumptionRows(aggregateConsumptionRows(rows, this.granularity));
    },
    drillChartOption() {
      if (!this.activeStation || !this.drillRows.length) {
        return this._emptyChartOption(this.activeStationLabel);
      }
      const st = STATION_LIST.find((s) => s.id === this.activeStation);
      const agg = aggregateConsumptionRows(this.stationDataMap[this.activeStation].rows, this.granularity);
      return buildBarChartOption(agg, this.granularity, { ...this.chartTheme, primary: st?.color || "#059669" }, this.activeStationLabel);
    },
    drillPageCount() { return Math.max(1, Math.ceil(this.drillRows.length / this.drillPageSize)); },
    drillVisibleRows() {
      const s = (this.drillPage - 1) * this.drillPageSize;
      return this.drillRows.slice(s, s + this.drillPageSize);
    },

    // ── BY CUSTOMER ──
    custAggRows() { return aggregateConsumptionRows(this.custRawRows, this.granularity); },
    custDecoratedRows() { return decorateConsumptionRows(this.custAggRows); },
    custSummary() {
      return summarizeConsumptionRows(this.custAggRows, {
        dateFrom: this.periodRange.from, dateTo: this.periodRange.to, granularity: this.granularity
      });
    },
    custChartOption() {
      if (!this.custAggRows.length) return this._emptyChartOption("Customer Consumption");
      return buildBarChartOption(
        this.custAggRows, this.granularity, this.chartTheme || {},
        this.custFilters.customerName || this.custFilters.customerId || "Customer"
      );
    },
    custPageCount() { return Math.max(1, Math.ceil(this.custDecoratedRows.length / this.custPageSize)); },
    custVisibleRows() {
      const s = (this.custPage - 1) * this.custPageSize;
      return this.custDecoratedRows.slice(s, s + this.custPageSize);
    },

    // ── KPI CARDS ──
    kpiCards() {
      let summary;
      const opts = { dateFrom: this.periodRange.from, dateTo: this.periodRange.to, granularity: this.granularity };
      if (this.activeView === "customer") {
        summary = this.custSummary;
      } else if (this.activeView === "station" && this.activeStation) {
        const st = this.stationSummary.find((s) => s.id === this.activeStation);
        summary = st ? summarizeConsumptionRows(st.rows, opts) : this.allSummary;
      } else {
        summary = this.allSummary;
      }
      const loading = this.loadingStations && !summary.total;
      return [
        { label: "Total Consumption", value: `${this.fmt(summary.total)} kWh`, icon: KPI_ICONS.total, loading },
        { label: "Average / Period",  value: `${this.fmt(summary.average)} kWh`, icon: KPI_ICONS.avg, loading },
        { label: "Peak Period", value: summary.peakDate || "—", sub: summary.peakDate ? `${this.fmt(summary.peakValue)} kWh` : "", icon: KPI_ICONS.peak, loading },
        { label: "Coverage", value: `${summary.reportingDays} / ${summary.expectedDays || summary.reportingDays}`, sub: `${summary.missingDays} missing`, icon: KPI_ICONS.coverage, loading }
      ];
    },

    canExport() {
      if (this.activeView === "customer") return this.custDecoratedRows.length > 0;
      return this.allDecoratedRows.length > 0;
    }
  },

  mounted() {
    this.syncTheme();
    this.watchTheme();
    this._doFetchStations();
  },

  beforeUnmount() {
    if (this.themeObserver) this.themeObserver.disconnect();
  },

  methods: {
    pickPeriod(key) { this.activePeriod = key; this.reload(); },
    onCustomDate()  { this.activePeriod = "custom"; this.reload(); },
    setView(view)   { this.activeView = view; },

    reload() {
      if (this.dateError) return;
      this._doFetchStations();
      if (this.custFilters.customerId && this.custLoaded) this.loadCustomer();
    },

    async _doFetchStations() {
      if (this.dateError) return;
      const gen = ++this._stationGen;
      STATION_LIST.forEach((s) => {
        this.stationDataMap[s.id].rows = [];
        this.stationDataMap[s.id].loading = true;
        this.stationDataMap[s.id].error = "";
      });
      this.stationsLoaded = false;
      const { from, to, granularity } = this.periodRange;
      await Promise.all(STATION_LIST.map(async (station) => {
        try {
          const result = await fetchConsumptionStatistics(
            { stationId: station.id, dateFrom: from, dateTo: to, granularity },
            { pageSize: 5000 }
          );
          if (gen !== this._stationGen) return;
          this.stationDataMap[station.id].rows = result.rows;
        } catch (err) {
          if (gen !== this._stationGen) return;
          this.stationDataMap[station.id].error = err?.message || "Failed";
          this.stationDataMap[station.id].rows = [];
        } finally {
          if (gen === this._stationGen) this.stationDataMap[station.id].loading = false;
        }
      }));
      if (gen === this._stationGen) this.stationsLoaded = true;
    },

    toggleStation(id) {
      this.activeStation = this.activeStation === id ? "" : id;
      this.drillPage = 1;
    },

    stationColor(id) {
      return STATION_LIST.find((s) => s.id === id)?.color || "#059669";
    },

    async loadCustomer() {
      if (!this.custFilters.customerId || this.dateError) return;
      const gen = ++this._custGen;
      this.custLoading = true;
      this.custLoaded = false;
      this.custError = "";
      this.custRawRows = [];
      this.custPage = 1;
      const { from, to, granularity } = this.periodRange;

      try {
        if (!this.custFilters.meterId || !this.custFilters.stationId) {
          this.custLoadingMsg = "Resolving account…";
          const account = await this._fetchAccount({ customerId: this.custFilters.customerId });
          if (gen !== this._custGen) return;
          if (account) {
            if (!this.custFilters.meterId && account.meterId)   this.custFilters.meterId   = String(account.meterId);
            if (!this.custFilters.stationId && account.stationId) this.custFilters.stationId = String(account.stationId);
          }
        }
        if (!this.custFilters.meterId) {
          throw new Error("No meter linked to this customer. Use the Meter browser to pick one.");
        }

        this.custLoadingMsg = "Fetching consumption…";
        if (this.custFilters.stationId) {
          const result = await fetchConsumptionStatistics(
            { stationId: this.custFilters.stationId, meterId: this.custFilters.meterId, dateFrom: from, dateTo: to, granularity },
            { pageSize: 5000 }
          );
          if (gen !== this._custGen) return;
          this.custRawRows = result.rows;
        } else {
          this.custLoadingMsg = "Searching stations…";
          const results = await Promise.all(STATION_LIST.map((s) =>
            fetchConsumptionStatistics(
              { stationId: s.id, meterId: this.custFilters.meterId, dateFrom: from, dateTo: to, granularity },
              { pageSize: 1000 }
            ).catch(() => ({ rows: [] }))
          ));
          if (gen !== this._custGen) return;
          for (let i = 0; i < results.length; i++) {
            if (results[i].rows.length > 0) { this.custFilters.stationId = STATION_LIST[i].id; break; }
          }
          this.custRawRows = results.flatMap((r) => r.rows);
        }
        if (gen !== this._custGen) return;
        this.custLoaded = true;
      } catch (err) {
        if (gen !== this._custGen) return;
        this.custError = err?.message || "Failed to load customer data";
      } finally {
        if (gen === this._custGen) { this.custLoading = false; this.custLoadingMsg = ""; }
      }
    },

    async onCustomerPick(row) {
      this.custFilters.customerId   = String(row.customerId || row.id || "");
      this.custFilters.customerName = String(row.customerName || row.name || "");
      this.custFilters.stationId    = String(row.stationId || "");
      this.custFilters.meterId      = String(row.meterId || "");
      this.custLoaded = false;
      this.custRawRows = [];
      this.custError = "";
      this.activePicker = "";
    },

    async onMeterPick(row) {
      this.custFilters.meterId = String(row.meterId || row.id || "");
      if (row.stationId) this.custFilters.stationId = String(row.stationId);
      if (row.customerId) {
        this.custFilters.customerId = String(row.customerId);
        this.custFilters.customerName = String(row.customerName || "");
      }
      this.activePicker = "";
    },

    clearCustomer() {
      this.custFilters = { customerId: "", customerName: "", meterId: "", stationId: "" };
      this.custRawRows = [];
      this.custLoaded = false;
      this.custError = "";
    },

    async _fetchAccount(criteria = {}) {
      try {
        const payload = { lang: "en", pageNumber: 1, pageSize: 20, ...criteria };
        const res = await postApi("/api/account/read", payload);
        const result = res?.result || res?.data?.result || res?.data || {};
        const rows = Array.isArray(result.data) ? result.data : Array.isArray(result.rows) ? result.rows : Array.isArray(result) ? result : [];
        const cid = String(criteria.customerId || "");
        return rows.find((r) => String(r.customerId || "") === cid) || rows[0] || null;
      } catch { return null; }
    },

    exportCsv() {
      const isCustomer = this.activeView === "customer";
      const rows = isCustomer ? this.custDecoratedRows : this.allDecoratedRows;
      const meta = [
        ["View", this.activeView], ["Period", this.activePeriod],
        ["From", this.periodRange.from], ["To", this.periodRange.to],
        ["Granularity", this.granularity],
        ...(isCustomer ? [
          ["Customer ID", this.custFilters.customerId],
          ["Customer Name", this.custFilters.customerName],
          ["Meter ID", this.custFilters.meterId],
          ["Station ID", this.custFilters.stationId]
        ] : []),
        []
      ];
      const columns = [
        { label: "Period",           key: "collectionDate" },
        { label: "Consumption (kWh)", key: "consumption" },
        { label: "Change (kWh)",     key: "change" },
        { label: "Status",           key: "status" }
      ];
      const base = `Beverly_site_consumption_${this.activeView}_${this.activePeriod}`;
      downloadTextFile(`${base}.csv`, exportReportCsvText("Site Consumption", columns, rows, meta), "text/csv;charset=utf-8");
      downloadTextFile(`${base}.xls`, exportReportExcelXml("Site Consumption", columns, rows, meta), "application/vnd.ms-excel");
    },

    _customGranularity() {
      const diff = Math.ceil((new Date(this.customTo).getTime() - new Date(this.customFrom).getTime()) / 86400000);
      if (diff <= 31)  return "daily";
      if (diff <= 180) return "weekly";
      if (diff <= 730) return "monthly";
      return "yearly";
    },

    _emptyChartOption(title) {
      const textMuted = this.chartTheme?.textMuted || "#64748b";
      return {
        title: {
          text: title, subtext: "No data for this period",
          left: "center", top: "40%",
          textStyle: { color: textMuted, fontSize: 14, fontWeight: 600 },
          subtextStyle: { color: textMuted, fontSize: 12 }
        }
      };
    },

    fmt(v) { return Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }); },
    fmtChange(v) {
      if (v === null || v === undefined) return "—";
      return (v > 0 ? "+" : "") + this.fmt(v);
    },
    changeClass(v) { return v > 0 ? "scp-up" : v < 0 ? "scp-down" : ""; },

    syncTheme() {
      if (typeof window === "undefined" || !document?.documentElement) return;
      const s = window.getComputedStyle(document.documentElement);
      const r = (n, fb) => s.getPropertyValue(n).trim() || fb;
      this.chartTheme = {
        primary:      r("--primary",      "#10b981"),
        primaryLight: r("--primary-light","rgba(16,185,129,0.12)"),
        textStrong:   r("--text-strong",  "#0f172a"),
        textMuted:    r("--text-muted",   "#64748b"),
        border:       r("--border-color", "#d1fae5"),
        grid:         r("--border-color", "#d1fae5")
      };
    },

    watchTheme() {
      if (typeof MutationObserver === "undefined" || !document?.documentElement) return;
      this.themeObserver = new MutationObserver(() => this.syncTheme());
      this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }
  }
};
</script>

<style scoped>
.scp {
  --scp-radius: 14px;
  --scp-radius-sm: 8px;
  --scp-radius-lg: 18px;
  --scp-border: var(--border-color, rgba(255,255,255,0.08));
  --scp-card-bg: var(--bg-card, #0f172a);
  --scp-text: var(--text-strong, #f8fafc);
  --scp-text-muted: var(--text-muted, #94a3b8);
  --scp-primary: var(--primary, #10b981);
  --scp-primary-soft: rgba(16, 185, 129, 0.12);
  --scp-primary-glow: rgba(16, 185, 129, 0.32);

  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
  min-height: 100%;
  box-sizing: border-box;
  font-family: var(--font-family);
  color: var(--scp-text);
}

/* ── Hero Header ── */
.scp-hero {
  position: relative;
  border-radius: var(--scp-radius-lg);
  overflow: hidden;
  border: 1px solid var(--scp-border);
  background: var(--scp-card-bg);
  box-shadow: 0 4px 24px rgba(0,0,0,0.18);
}

.scp-hero-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 8% 30%, var(--scp-primary-soft), transparent 50%),
    radial-gradient(circle at 90% 80%, rgba(64, 201, 198, 0.08), transparent 55%),
    linear-gradient(135deg, var(--scp-primary-soft), transparent 60%);
  pointer-events: none;
}

.scp-hero-content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 22px 24px;
  flex-wrap: wrap;
}

.scp-hero-icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--scp-primary), #34d399);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 6px 18px var(--scp-primary-glow);
}

.scp-hero-icon { width: 26px; height: 26px; color: #fff; }

.scp-hero-title { flex: 1; min-width: 200px; }
.scp-hero-title h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.01em; color: var(--scp-text); }
.scp-hero-title p { margin: 4px 0 0; font-size: 13px; color: var(--scp-text-muted); }

.scp-hero-actions { display: flex; gap: 10px; }

/* ── Buttons ── */
.scp-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  font-family: var(--font-family);
  cursor: pointer;
  border: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease, background 0.15s ease;
  white-space: nowrap;
}
.scp-btn svg { width: 15px; height: 15px; flex-shrink: 0; }
.scp-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.scp-btn--primary {
  background: linear-gradient(135deg, var(--scp-primary), #34d399);
  color: #fff;
  box-shadow: 0 4px 14px var(--scp-primary-glow);
}
.scp-btn--primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 20px var(--scp-primary-glow); }

.scp-btn--ghost {
  background: rgba(255,255,255,0.03);
  color: var(--scp-text);
  border: 1px solid var(--scp-border);
}
.scp-btn--ghost:hover:not(:disabled) { border-color: var(--scp-primary); color: var(--scp-primary); background: var(--scp-primary-soft); }

.scp-spin { animation: scp-spin 1s linear infinite; }
.scp-spin-sm {
  width: 14px; height: 14px; flex-shrink: 0;
  border: 2px solid rgba(255,255,255,0.25);
  border-top-color: #fff;
  border-radius: 50%;
  animation: scp-spin 0.7s linear infinite;
}
@keyframes scp-spin { to { transform: rotate(360deg); } }

/* ── Period Row ── */
.scp-period-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding: 12px 16px;
  background: var(--scp-card-bg);
  border: 1px solid var(--scp-border);
  border-radius: var(--scp-radius);
}

.scp-period-pills { display: flex; gap: 4px; flex-wrap: wrap; }

.scp-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--scp-border);
  background: transparent;
  color: var(--scp-text-muted);
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-family);
  cursor: pointer;
  transition: all 0.15s;
}

.scp-pill-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--scp-text-muted);
  transition: background 0.15s;
}

.scp-pill:hover { color: var(--scp-text); border-color: var(--scp-text-muted); }
.scp-pill--active {
  background: linear-gradient(135deg, var(--scp-primary), #34d399);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 3px 10px var(--scp-primary-glow);
}
.scp-pill--active .scp-pill-dot { background: #fff; }

.scp-period-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.scp-date-pair {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--scp-border);
}

.scp-date-input {
  height: 28px;
  padding: 0 8px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-family: var(--font-family);
  color: var(--scp-text);
  outline: 0;
  color-scheme: dark;
}

.scp-date-arrow { color: var(--scp-text-muted); font-size: 11px; }

.scp-gran-chip {
  padding: 5px 11px;
  border-radius: 999px;
  background: var(--scp-primary-soft);
  color: var(--scp-primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* ── Alerts ── */
.scp-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--scp-radius);
  font-size: 13px;
  font-weight: 600;
}
.scp-alert svg { width: 18px; height: 18px; flex-shrink: 0; }

.scp-alert--warn  { border: 1px solid rgba(255,184,34,0.32); background: rgba(255,184,34,0.08); color: #fbbf24; }
.scp-alert--danger { border: 1px solid rgba(244,81,108,0.32); background: rgba(244,81,108,0.08); color: #f4516c; }

/* ── View Tabs ── */
.scp-views {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.scp-view {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--scp-radius);
  border: 1px solid var(--scp-border);
  background: var(--scp-card-bg);
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  text-align: left;
  font-family: var(--font-family);
}

.scp-view:hover { transform: translateY(-1px); border-color: var(--scp-primary); }

.scp-view-icon {
  width: 38px; height: 38px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.04);
  color: var(--scp-text-muted);
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.scp-view-icon :deep(svg) { width: 18px; height: 18px; }

.scp-view-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.scp-view-text strong { font-size: 14px; font-weight: 800; color: var(--scp-text); }
.scp-view-text small { font-size: 11px; color: var(--scp-text-muted); }

.scp-view--active {
  border-color: transparent;
  background:
    linear-gradient(135deg, var(--scp-primary-soft), transparent 70%),
    var(--scp-card-bg);
  box-shadow: 0 0 0 1px var(--scp-primary), 0 8px 22px var(--scp-primary-glow);
}
.scp-view--active .scp-view-icon { background: var(--scp-primary); color: #fff; }
.scp-view--active .scp-view-text strong { color: var(--scp-primary); }

/* ── KPI Cards ── */
.scp-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.scp-kpi {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px;
  background: var(--scp-card-bg);
  border: 1px solid var(--scp-border);
  border-radius: var(--scp-radius);
  overflow: hidden;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.scp-kpi::before {
  content: "";
  position: absolute;
  top: 0; left: 0; bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--scp-primary), #34d399);
}

.scp-kpi:hover {
  transform: translateY(-2px);
  border-color: var(--scp-primary);
  box-shadow: 0 8px 22px rgba(0,0,0,0.18);
}

.scp-kpi-icon {
  width: 42px; height: 42px;
  border-radius: 11px;
  display: flex; align-items: center; justify-content: center;
  background: var(--scp-primary-soft);
  color: var(--scp-primary);
  flex-shrink: 0;
}
.scp-kpi-icon :deep(svg) { width: 20px; height: 20px; }

.scp-kpi-body { min-width: 0; flex: 1; }

.scp-kpi-label {
  display: block;
  color: var(--scp-text-muted);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.scp-kpi-value {
  display: block;
  margin-top: 6px;
  color: var(--scp-text);
  font-size: 22px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.scp-kpi-sub {
  display: block;
  margin-top: 4px;
  color: var(--scp-text-muted);
  font-size: 11px;
  font-weight: 600;
}

.scp-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, var(--scp-primary-soft) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: scp-shimmer 1.4s infinite;
  pointer-events: none;
}
@keyframes scp-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

/* ── Cards ── */
.scp-card {
  background: var(--scp-card-bg);
  border: 1px solid var(--scp-border);
  border-radius: var(--scp-radius);
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
}

.scp-card--drill { border-color: var(--scp-primary); box-shadow: 0 4px 24px var(--scp-primary-glow); }

.scp-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--scp-border);
  background: linear-gradient(90deg, var(--scp-primary-soft), transparent 60%);
}

.scp-card-head-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.scp-card-head-title strong { color: var(--scp-text); font-size: 14px; font-weight: 800; }

.scp-card-bullet {
  width: 6px; height: 18px;
  background: linear-gradient(180deg, var(--scp-primary), #34d399);
  border-radius: 3px;
  flex-shrink: 0;
}

.scp-card-meta { color: var(--scp-text-muted); font-size: 11px; font-weight: 600; }

.scp-icon-btn {
  border: none;
  background: transparent;
  color: var(--scp-text-muted);
  width: 28px; height: 28px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.scp-icon-btn svg { width: 16px; height: 16px; }
.scp-icon-btn:hover { background: rgba(244,81,108,0.12); color: #f4516c; }

/* ── Progress ── */
.scp-progress {
  position: relative;
  height: 28px;
  background: rgba(255,255,255,0.04);
  border-bottom: 1px solid var(--scp-border);
}
.scp-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--scp-primary), #34d399);
  transition: width 0.4s ease;
  box-shadow: 0 0 12px var(--scp-primary-glow);
}
.scp-progress-label {
  position: absolute;
  inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--scp-text);
}

/* ── Chart ── */
.scp-chart-wrap {
  min-height: 360px;
  padding: 14px;
  background:
    radial-gradient(circle at 12% 8%, var(--scp-primary-soft), transparent 36%),
    var(--scp-card-bg);
}

/* ── Station Grid ── */
.scp-station-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.scp-station {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--scp-card-bg);
  border: 1px solid var(--scp-border);
  border-radius: var(--scp-radius);
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  text-align: left;
  font-family: var(--font-family);
  overflow: hidden;
}

.scp-station-bar {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  width: 3px;
  background: var(--station-color);
}

.scp-station:hover {
  transform: translateY(-2px);
  border-color: var(--station-color);
  box-shadow: 0 8px 22px rgba(0,0,0,0.18);
}

.scp-station--active {
  border-color: var(--station-color);
  box-shadow: 0 0 0 1px var(--station-color), 0 8px 22px rgba(0,0,0,0.2);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--station-color) 12%, transparent), transparent 60%),
    var(--scp-card-bg);
}

.scp-station-info { flex: 1; min-width: 0; }
.scp-station-info strong { display: block; font-size: 13px; font-weight: 800; color: var(--scp-text); }
.scp-station-info span { display: block; font-size: 12px; color: var(--scp-text-muted); margin-top: 3px; font-variant-numeric: tabular-nums; }

.scp-station-total em { font-style: normal; font-size: 10px; color: var(--scp-text-muted); margin-left: 2px; }
.scp-station-err { color: #f4516c !important; }
.scp-station-status { color: var(--scp-text-muted); }

.scp-station-chev {
  width: 14px; height: 14px;
  color: var(--scp-text-muted);
  transition: transform 0.15s, color 0.15s;
  flex-shrink: 0;
}
.scp-station:hover .scp-station-chev { color: var(--station-color); transform: translateX(2px); }

/* ── Customer Picker ── */
.scp-card--picker .scp-picker-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr auto;
  gap: 14px;
  padding: 18px;
  align-items: flex-end;
}

.scp-picker-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

.scp-picker-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--scp-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}

.scp-hint {
  font-size: 9px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: var(--scp-primary);
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--scp-primary-soft);
}

.scp-picker-row { display: flex; gap: 6px; }

.scp-picker-input {
  flex: 1;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--scp-border);
  border-radius: var(--scp-radius-sm);
  background: rgba(255,255,255,0.03);
  color: var(--scp-text);
  font-size: 13px;
  font-family: var(--font-family);
  outline: 0;
  min-width: 0;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.scp-picker-input:focus { border-color: var(--scp-primary); box-shadow: 0 0 0 3px var(--scp-primary-soft); }

.scp-picker-btn, .scp-picker-clear {
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--scp-border);
  border-radius: var(--scp-radius-sm);
  background: rgba(255,255,255,0.03);
  color: var(--scp-text-muted);
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-family);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.scp-picker-btn:hover { border-color: var(--scp-primary); color: var(--scp-primary); background: var(--scp-primary-soft); }
.scp-picker-clear:hover { border-color: #f4516c; color: #f4516c; background: rgba(244,81,108,0.08); }
.scp-picker-resolved { color: var(--scp-primary); font-size: 12px; font-weight: 700; }

.scp-picker-search { height: 34px; padding: 0 22px; }

.scp-cust-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 220px;
  padding: 32px;
  border-radius: var(--scp-radius);
  border: 1px dashed var(--scp-border);
  background:
    radial-gradient(circle at 50% 50%, var(--scp-primary-soft), transparent 60%),
    var(--scp-card-bg);
  color: var(--scp-text-muted);
  text-align: center;
}

.scp-cust-empty-icon {
  width: 60px; height: 60px;
  border-radius: 50%;
  background: var(--scp-primary-soft);
  display: flex; align-items: center; justify-content: center;
  color: var(--scp-primary);
}
.scp-cust-empty-icon svg { width: 28px; height: 28px; }

.scp-cust-empty strong { color: var(--scp-text); font-size: 14px; font-weight: 800; }
.scp-cust-empty span { font-size: 12px; }
.scp-cust-empty em { color: var(--scp-primary); font-style: normal; font-weight: 700; }

/* ── Table ── */
.scp-table-scroll { overflow-x: auto; }
.scp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.scp-table thead {
  background: rgba(255,255,255,0.02);
  position: sticky; top: 0;
}

.scp-table th {
  text-align: left;
  padding: 12px 16px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--scp-text-muted);
  border-bottom: 1px solid var(--scp-border);
}

.scp-table td {
  padding: 11px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  color: var(--scp-text);
}

.scp-table tbody tr { transition: background 0.1s; }
.scp-table tbody tr:hover { background: var(--scp-primary-soft); }

.scp-period-cell { font-weight: 600; font-variant-numeric: tabular-nums; }
.scp-num-col { text-align: right; }
.scp-status-col { width: 110px; }
.scp-num { font-variant-numeric: tabular-nums; font-weight: 700; text-align: right; }
.scp-up { color: #10b981; }
.scp-down { color: #f4516c; }

.scp-empty {
  text-align: center;
  padding: 48px 16px !important;
  color: var(--scp-text-muted);
  font-size: 13px;
  font-weight: 600;
}

.scp-empty .scp-loader {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid var(--scp-border);
  border-top-color: var(--scp-primary);
  border-radius: 50%;
  animation: scp-spin 0.7s linear infinite;
  vertical-align: middle;
  margin-right: 8px;
}

.scp-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.scp-badge--ok   { border: 1px solid rgba(16,185,129,0.34); background: rgba(16,185,129,0.10); color: #10b981; }
.scp-badge--zero { border: 1px solid rgba(244,81,108,0.34); background: rgba(244,81,108,0.10); color: #f4516c; }

/* ── Pagination ── */
.scp-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--scp-border);
  font-size: 12px;
  color: var(--scp-text-muted);
}

.scp-page-total { margin-right: auto; font-weight: 600; }

.scp-page-size {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--scp-border);
  border-radius: var(--scp-radius-sm);
  background: rgba(255,255,255,0.03);
  color: var(--scp-text);
  font-size: 12px;
  font-family: var(--font-family);
  outline: 0;
}

.scp-page-nav { display: flex; align-items: center; gap: 4px; }

.scp-page-btn {
  width: 30px; height: 30px;
  border: 1px solid var(--scp-border);
  border-radius: var(--scp-radius-sm);
  background: rgba(255,255,255,0.03);
  color: var(--scp-text-muted);
  font-size: 16px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
  font-family: var(--font-family);
}
.scp-page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.scp-page-btn:not(:disabled):hover { border-color: var(--scp-primary); color: var(--scp-primary); background: var(--scp-primary-soft); }
.scp-page-count { font-weight: 700; color: var(--scp-text); padding: 0 6px; }

/* ── Responsive ── */
@media (max-width: 1200px) {
  .scp-views { grid-template-columns: 1fr; }
  .scp-station-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .scp-card--picker .scp-picker-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 900px) {
  .scp-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .scp-station-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .scp { padding: 14px; }
  .scp-hero-content { padding: 18px; }
  .scp-hero-title h1 { font-size: 18px; }
  .scp-kpi-grid { grid-template-columns: 1fr; }
  .scp-station-grid { grid-template-columns: 1fr; }
  .scp-card--picker .scp-picker-grid { grid-template-columns: 1fr; }
  .scp-period-row { flex-direction: column; align-items: stretch; }
  .scp-period-meta { justify-content: space-between; }
}
</style>
