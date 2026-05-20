<template>
  <section class="csp">
    <!-- View Tabs -->
    <div class="csp-view-tabs">
      <button :class="['csp-vtab', activeView === 'all' ? 'active' : '']" @click="switchView('all')">All Sites</button>
      <button :class="['csp-vtab', activeView === 'station' ? 'active' : '']" @click="switchView('station')">By Station</button>
      <button :class="['csp-vtab', activeView === 'customer' ? 'active' : '']" @click="switchView('customer')">By Customer</button>
      <span class="csp-vtab-spacer" />
      <button class="csp-export-btn" :disabled="!canExport" @click="exportCsv">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 20h14v-2H5v2zm7-18l-5.5 5.5 1.42 1.42L11 5.84V16h2V5.84l3.08 3.08 1.42-1.42L12 2z"/></svg>
        Export
      </button>
    </div>

    <!-- Period Pills -->
    <div class="csp-period-bar">
      <div class="csp-period-pills">
        <button v-for="p in PERIODS" :key="p.key" :class="['csp-pill', activePeriod === p.key ? 'active' : '']" @click="pickPeriod(p.key)">{{ p.label }}</button>
      </div>
      <div v-if="activePeriod === 'custom'" class="csp-custom-range">
        <input v-model="customFrom" type="date" class="csp-date-input" @change="loadActive" />
        <span class="csp-range-sep">→</span>
        <input v-model="customTo" type="date" class="csp-date-input" @change="loadActive" />
      </div>
      <span class="csp-period-info">{{ periodRange.from }} – {{ periodRange.to }} · {{ granularityLabel }}</span>
    </div>

    <!-- KPI Cards -->
    <div class="csp-kpi-grid">
      <article v-for="card in kpiCards" :key="card.label" class="csp-kpi">
        <span class="csp-kpi-label">{{ card.label }}</span>
        <strong class="csp-kpi-value">{{ card.value }}</strong>
        <small v-if="card.sub" class="csp-kpi-sub">{{ card.sub }}</small>
        <div v-if="card.loading" class="csp-shimmer" />
      </article>
    </div>

    <!-- ── ALL SITES VIEW ── -->
    <template v-if="activeView === 'all'">
      <div class="csp-card">
        <div class="csp-card-head">
          <strong>All Sites Consumption</strong>
          <span>{{ granularityLabel }} · {{ allAggRows.length }} periods</span>
        </div>
        <div v-if="loadingStations" class="csp-load-bar">
          <div class="csp-load-fill" :style="{ width: loadPercent + '%' }" />
        </div>
        <div v-if="stationError" class="csp-error">{{ stationError }}</div>
        <div class="csp-chart-wrap">
          <EChartPanel :option="allChartOption" />
        </div>
      </div>

      <div class="csp-card csp-table-card">
        <div class="csp-card-head">
          <strong>Consumption Ledger</strong>
          <span>{{ allDecoratedRows.length }} rows</span>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Consumption (kWh)</th>
                <th>Change (kWh)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loadingStations && !allAggRows.length">
                <td colspan="4" class="csp-empty">Loading…</td>
              </tr>
              <tr v-else-if="!allDecoratedRows.length">
                <td colspan="4" class="csp-empty">No data for this period</td>
              </tr>
              <tr v-for="row in allVisibleRows" :key="row.id">
                <td>{{ row.collectionDate }}</td>
                <td class="csp-num">{{ fmt(row.consumption) }}</td>
                <td :class="['csp-num', changeClass(row.change)]">{{ fmtChange(row.change) }}</td>
                <td><span :class="['csp-badge', row.status === 'Recorded' ? 'ok' : 'zero']">{{ row.status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="csp-pagination">
          <span>{{ allDecoratedRows.length }} total</span>
          <select v-model="allPageSize" class="csp-page-size" @change="allPage = 1">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
          <button class="csp-page-btn" :disabled="allPage <= 1" @click="allPage--">&lsaquo;</button>
          <span class="csp-page-count">{{ allPage }} / {{ allPageCount || 1 }}</span>
          <button class="csp-page-btn" :disabled="allPage >= allPageCount" @click="allPage++">&rsaquo;</button>
        </div>
      </div>
    </template>

    <!-- ── BY STATION VIEW ── -->
    <template v-if="activeView === 'station'">
      <div class="csp-card">
        <div class="csp-card-head">
          <strong>Station Comparison</strong>
          <span>{{ granularityLabel }} totals</span>
        </div>
        <div v-if="loadingStations" class="csp-load-bar">
          <div class="csp-load-fill" :style="{ width: loadPercent + '%' }" />
        </div>
        <div class="csp-chart-wrap">
          <EChartPanel :option="stationBarOption" />
        </div>
      </div>

      <div class="csp-station-grid">
        <div v-for="st in stationSummary" :key="st.id" :class="['csp-station-card', activeStation === st.id ? 'active' : '']" @click="toggleStation(st.id)">
          <span class="csp-station-dot" :style="{ background: st.color }" />
          <div class="csp-station-body">
            <strong>{{ st.label }}</strong>
            <span>{{ fmt(st.total) }} kWh</span>
          </div>
          <span v-if="st.loading" class="csp-station-spin" />
        </div>
      </div>

      <div v-if="activeStation" class="csp-card">
        <div class="csp-card-head">
          <strong>{{ activeStationLabel }} — {{ granularityLabel }}</strong>
          <button class="csp-close-btn" @click="activeStation = ''">✕</button>
        </div>
        <div class="csp-chart-wrap">
          <EChartPanel :option="drillChartOption" />
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Consumption (kWh)</th>
                <th>Change (kWh)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!drillRows.length">
                <td colspan="4" class="csp-empty">No data</td>
              </tr>
              <tr v-for="row in drillVisibleRows" :key="row.id">
                <td>{{ row.collectionDate }}</td>
                <td class="csp-num">{{ fmt(row.consumption) }}</td>
                <td :class="['csp-num', changeClass(row.change)]">{{ fmtChange(row.change) }}</td>
                <td><span :class="['csp-badge', row.status === 'Recorded' ? 'ok' : 'zero']">{{ row.status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="csp-pagination">
          <span>{{ drillRows.length }} total</span>
          <select v-model="drillPageSize" class="csp-page-size" @change="drillPage = 1">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
          <button class="csp-page-btn" :disabled="drillPage <= 1" @click="drillPage--">&lsaquo;</button>
          <span class="csp-page-count">{{ drillPage }} / {{ drillPageCount || 1 }}</span>
          <button class="csp-page-btn" :disabled="drillPage >= drillPageCount" @click="drillPage++">&rsaquo;</button>
        </div>
      </div>
    </template>

    <!-- ── BY CUSTOMER VIEW ── -->
    <template v-if="activeView === 'customer'">
      <div class="csp-card csp-cust-pick-card">
        <div class="csp-cust-pick-row">
          <div class="csp-pick-field">
            <label class="csp-pick-label">Customer</label>
            <div class="csp-pick-input-row">
              <input v-model="custFilters.customerId" class="csp-pick-input" placeholder="Customer ID" readonly />
              <button class="csp-pick-btn" @click="activePicker = 'customer'">Browse</button>
              <button v-if="custFilters.customerId" class="csp-pick-clear" @click="clearCustomer">✕</button>
            </div>
            <span v-if="custFilters.customerName" class="csp-pick-name">{{ custFilters.customerName }}</span>
          </div>
          <div class="csp-pick-field">
            <label class="csp-pick-label">Meter</label>
            <div class="csp-pick-input-row">
              <input v-model="custFilters.meterId" class="csp-pick-input" placeholder="Meter ID (optional)" readonly />
              <button class="csp-pick-btn" @click="activePicker = 'meter'">Browse</button>
              <button v-if="custFilters.meterId" class="csp-pick-clear" @click="custFilters.meterId = ''">✕</button>
            </div>
          </div>
          <div class="csp-pick-field">
            <label class="csp-pick-label">Station</label>
            <div class="csp-pick-input-row">
              <input :value="custFilters.stationId || 'Auto'" class="csp-pick-input" readonly />
            </div>
          </div>
          <button class="csp-search-btn" :disabled="!custFilters.customerId || custLoading" @click="loadCustomer">
            {{ custLoading ? "Loading…" : "Search" }}
          </button>
        </div>
      </div>

      <div v-if="custError" class="csp-error">{{ custError }}</div>

      <template v-if="custLoaded">
        <div class="csp-card">
          <div class="csp-card-head">
            <strong>{{ custFilters.customerName || custFilters.customerId }} — {{ granularityLabel }}</strong>
            <span>{{ custAggRows.length }} periods</span>
          </div>
          <div class="csp-chart-wrap">
            <EChartPanel :option="custChartOption" />
          </div>
        </div>

        <div class="csp-card csp-table-card">
          <div class="csp-card-head">
            <strong>Customer Consumption Ledger</strong>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Consumption (kWh)</th>
                  <th>Change (kWh)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!custDecoratedRows.length">
                  <td colspan="4" class="csp-empty">No data for this customer</td>
                </tr>
                <tr v-for="row in custVisibleRows" :key="row.id">
                  <td>{{ row.collectionDate }}</td>
                  <td class="csp-num">{{ fmt(row.consumption) }}</td>
                  <td :class="['csp-num', changeClass(row.change)]">{{ fmtChange(row.change) }}</td>
                  <td><span :class="['csp-badge', row.status === 'Recorded' ? 'ok' : 'zero']">{{ row.status }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="csp-pagination">
            <span>{{ custDecoratedRows.length }} total</span>
            <select v-model="custPageSize" class="csp-page-size" @change="custPage = 1">
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
            </select>
            <button class="csp-page-btn" :disabled="custPage <= 1" @click="custPage--">&lsaquo;</button>
            <span class="csp-page-count">{{ custPage }} / {{ custPageCount || 1 }}</span>
            <button class="csp-page-btn" :disabled="custPage >= custPageCount" @click="custPage++">&rsaquo;</button>
          </div>
        </div>
      </template>

      <div v-else-if="!custLoading" class="csp-cust-empty">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
        <span>Select a customer to view consumption</span>
      </div>
    </template>

    <!-- Pickers -->
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
  </section>
</template>

<script>
import EChartPanel from "./EChartPanel.vue";
import PickerModal from "./PickerModal.vue";
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
  { key: "daily",    label: "Daily"    },
  { key: "custom",   label: "Custom"   }
];

const GRANULARITY_LABELS = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly"
};

export default {
  name: "ConsumptionStatisticsPage",
  components: { EChartPanel, PickerModal },

  data() {
    return {
      PERIODS,
      STATION_LIST,
      activeView: "all",
      activePeriod: "monthly",
      customFrom: "",
      customTo: "",
      stationDataMap: Object.fromEntries(STATION_LIST.map((s) => [s.id, { rows: [], loading: false, error: "" }])),
      stationsLoaded: false,
      stationError: "",
      activeStation: "",
      custFilters: { customerId: "", customerName: "", meterId: "", stationId: "" },
      custRawRows: [],
      custLoaded: false,
      custLoading: false,
      custError: "",
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
      if (this.activePeriod === "custom") {
        const from = this.customFrom || "2020-01-01";
        const to = this.customTo || new Date().toISOString().slice(0, 10);
        return { from, to, granularity: "daily" };
      }
      return buildConsumptionPeriodRange(this.activePeriod);
    },
    granularity() { return this.periodRange.granularity; },
    granularityLabel() { return GRANULARITY_LABELS[this.granularity] || this.granularity; },
    loadingStations() {
      return STATION_LIST.some((s) => this.stationDataMap[s.id].loading);
    },
    loadedCount() {
      return STATION_LIST.filter((s) => !this.stationDataMap[s.id].loading && (this.stationDataMap[s.id].rows.length > 0 || this.stationsLoaded)).length;
    },
    loadPercent() {
      return Math.round((this.loadedCount / STATION_LIST.length) * 100);
    },

    // ── ALL SITES ──
    allRawRows() {
      return STATION_LIST.flatMap((s) => this.stationDataMap[s.id].rows);
    },
    allAggRows() {
      return aggregateConsumptionRows(this.allRawRows, this.granularity);
    },
    allDecoratedRows() {
      return decorateConsumptionRows(this.allAggRows);
    },
    allSummary() {
      return summarizeConsumptionRows(this.allAggRows, { dateFrom: this.periodRange.from, dateTo: this.periodRange.to, granularity: this.granularity });
    },
    allChartOption() {
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
        return { ...s, rows: agg, total: Number(total.toFixed(3)), loading: entry.loading };
      });
    },
    stationBarOption() {
      return buildStationBarChartOption(this.stationSummary, this.chartTheme || {});
    },
    activeStationLabel() {
      return STATION_LIST.find((s) => s.id === this.activeStation)?.label || this.activeStation;
    },
    drillRows() {
      if (!this.activeStation) return [];
      const entry = this.stationDataMap[this.activeStation];
      return decorateConsumptionRows(aggregateConsumptionRows(entry.rows, this.granularity));
    },
    drillChartOption() {
      if (!this.activeStation) return {};
      const st = STATION_LIST.find((s) => s.id === this.activeStation);
      const theme = { ...this.chartTheme, primary: st?.color || "#059669" };
      return buildBarChartOption(
        aggregateConsumptionRows(this.stationDataMap[this.activeStation].rows, this.granularity),
        this.granularity,
        theme,
        this.activeStationLabel
      );
    },
    drillPageCount() { return Math.max(1, Math.ceil(this.drillRows.length / this.drillPageSize)); },
    drillVisibleRows() {
      const s = (this.drillPage - 1) * this.drillPageSize;
      return this.drillRows.slice(s, s + this.drillPageSize);
    },

    // ── BY CUSTOMER ──
    custAggRows() {
      return aggregateConsumptionRows(this.custRawRows, this.granularity);
    },
    custDecoratedRows() {
      return decorateConsumptionRows(this.custAggRows);
    },
    custSummary() {
      return summarizeConsumptionRows(this.custAggRows, { dateFrom: this.periodRange.from, dateTo: this.periodRange.to, granularity: this.granularity });
    },
    custChartOption() {
      return buildBarChartOption(this.custAggRows, this.granularity, this.chartTheme || {}, this.custFilters.customerName || this.custFilters.customerId || "Customer");
    },
    custPageCount() { return Math.max(1, Math.ceil(this.custDecoratedRows.length / this.custPageSize)); },
    custVisibleRows() {
      const s = (this.custPage - 1) * this.custPageSize;
      return this.custDecoratedRows.slice(s, s + this.custPageSize);
    },

    // ── KPI CARDS ──
    kpiCards() {
      let summary;
      if (this.activeView === "customer") summary = this.custSummary;
      else if (this.activeView === "station" && this.activeStation) {
        const st = this.stationSummary.find((s) => s.id === this.activeStation);
        summary = st ? summarizeConsumptionRows(st.rows, { dateFrom: this.periodRange.from, dateTo: this.periodRange.to, granularity: this.granularity }) : this.allSummary;
      } else {
        summary = this.allSummary;
      }
      const loading = this.loadingStations && !summary.total;
      return [
        { label: "Total Consumption", value: `${this.fmt(summary.total)} kWh`, loading },
        { label: "Average / Period", value: `${this.fmt(summary.average)} kWh`, loading },
        { label: "Peak Period", value: summary.peakDate || "—", sub: summary.peakDate ? `${this.fmt(summary.peakValue)} kWh` : "", loading },
        { label: "Coverage", value: `${summary.reportingDays} / ${summary.expectedDays || summary.reportingDays}`, sub: `${summary.missingDays} missing`, loading }
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
    this._fetchAllStations();
  },

  beforeUnmount() {
    if (this.themeObserver) this.themeObserver.disconnect();
  },

  methods: {
    switchView(view) {
      this.activeView = view;
      if ((view === "all" || view === "station") && !this.stationsLoaded && !this.loadingStations) {
        this._fetchAllStations();
      }
    },

    pickPeriod(key) {
      this.activePeriod = key;
      if (key !== "custom") this.loadActive();
    },

    loadActive() {
      if (this.activeView === "customer") {
        if (this.custFilters.customerId) this.loadCustomer();
      } else {
        this._fetchAllStations();
      }
    },

    async _fetchAllStations() {
      this.stationsLoaded = false;
      this.stationError = "";
      const { from, to, granularity } = this.periodRange;

      const fetchOne = async (station) => {
        this.stationDataMap[station.id].loading = true;
        this.stationDataMap[station.id].error = "";
        try {
          const result = await fetchConsumptionStatistics(
            { stationId: station.id, dateFrom: from, dateTo: to, granularity },
            { pageSize: 5000 }
          );
          this.stationDataMap[station.id].rows = result.rows;
        } catch (err) {
          this.stationDataMap[station.id].error = err?.message || "Failed";
          this.stationDataMap[station.id].rows = [];
        } finally {
          this.stationDataMap[station.id].loading = false;
        }
      };

      await Promise.all(STATION_LIST.map((s) => fetchOne(s)));
      this.stationsLoaded = true;
    },

    async loadCustomer() {
      if (!this.custFilters.customerId) return;
      this.custLoading = true;
      this.custLoaded = false;
      this.custError = "";
      this.custRawRows = [];
      const { from, to, granularity } = this.periodRange;
      try {
        const filters = {
          customerId: this.custFilters.customerId,
          dateFrom: from,
          dateTo: to,
          granularity
        };
        if (this.custFilters.meterId) filters.meterId = this.custFilters.meterId;
        if (this.custFilters.stationId) filters.stationId = this.custFilters.stationId;
        const result = await fetchConsumptionStatistics(filters, { pageSize: 5000 });
        this.custRawRows = result.rows;
        this.custLoaded = true;
        this.custPage = 1;
      } catch (err) {
        this.custError = err?.message || "Failed to load customer data";
      } finally {
        this.custLoading = false;
      }
    },

    toggleStation(id) {
      this.activeStation = this.activeStation === id ? "" : id;
      this.drillPage = 1;
    },

    async onCustomerPick(row) {
      this.custFilters.customerId = String(row.customerId || row.id || "");
      this.custFilters.customerName = String(row.customerName || row.name || "");
      this.custFilters.stationId = String(row.stationId || "");
      if (row.meterId) this.custFilters.meterId = String(row.meterId);
      else if (!this.custFilters.meterId) {
        const linked = await this._linkedAccount({ customerId: this.custFilters.customerId });
        if (linked?.meterId) this.custFilters.meterId = String(linked.meterId);
        if (linked?.stationId && !this.custFilters.stationId) this.custFilters.stationId = String(linked.stationId);
      }
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

    async _linkedAccount(criteria = {}) {
      try {
        const payload = { lang: "en", pageNumber: 1, pageSize: 50, ...criteria };
        const res = await postApi("/api/account/read", payload);
        const result = res?.result || res?.data?.result || res?.data || {};
        const rows = Array.isArray(result.data) ? result.data : Array.isArray(result.rows) ? result.rows : Array.isArray(result) ? result : [];
        return rows[0] || null;
      } catch {
        return null;
      }
    },

    exportCsv() {
      const view = this.activeView;
      const rows = view === "customer" ? this.custDecoratedRows : this.allDecoratedRows;
      const meta = [
        ["View", view],
        ["Period", this.activePeriod],
        ["From", this.periodRange.from],
        ["To", this.periodRange.to],
        ["Granularity", this.granularity],
        []
      ];
      const columns = [
        { label: "Period", key: "collectionDate" },
        { label: "Consumption (kWh)", key: "consumption" },
        { label: "Change (kWh)", key: "change" },
        { label: "Status", key: "status" }
      ];
      const title = "Beverly Consumption Statistics";
      const base = `Beverly_consumption_${view}_${this.activePeriod}`;
      downloadTextFile(`${base}.csv`, exportReportCsvText(title, columns, rows, meta), "text/csv;charset=utf-8");
      downloadTextFile(`${base}.xls`, exportReportExcelXml(title, columns, rows, meta), "application/vnd.ms-excel");
    },

    fmt(v) { return Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }); },
    fmtChange(v) {
      if (v === null || v === undefined) return "—";
      return (v > 0 ? "+" : "") + this.fmt(v);
    },
    changeClass(v) { return v > 0 ? "csp-up" : v < 0 ? "csp-down" : ""; },

    syncTheme() {
      if (typeof window === "undefined" || !document?.documentElement) return;
      const s = window.getComputedStyle(document.documentElement);
      const r = (n, fb) => s.getPropertyValue(n).trim() || fb;
      this.chartTheme = {
        primary: r("--primary", "#059669"),
        primaryLight: r("--primary-light", "rgba(5,150,105,0.12)"),
        textStrong: r("--text-strong", "#0f172a"),
        textMuted: r("--text-muted", "#64748b"),
        border: r("--border-color", "#d1fae5"),
        grid: r("--border-color", "#d1fae5")
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
.csp {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── View Tabs ── */
.csp-view-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 6px;
  box-shadow: var(--shadow-md);
}

.csp-vtab {
  padding: 8px 18px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.csp-vtab.active {
  background: var(--primary);
  color: var(--text-inverse);
  box-shadow: var(--shadow-glow-sm);
}

.csp-vtab:hover:not(.active) {
  background: var(--primary-light);
  color: var(--primary);
}

.csp-vtab-spacer { flex: 1; }

.csp-export-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
}

.csp-export-btn svg { width: 16px; height: 16px; }

.csp-export-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.csp-export-btn:not(:disabled):hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-light);
}

/* ── Period Bar ── */
.csp-period-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.csp-period-pills {
  display: flex;
  gap: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 4px;
  box-shadow: var(--shadow-sm);
}

.csp-pill {
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.csp-pill.active {
  background: var(--primary);
  color: var(--text-inverse);
  box-shadow: var(--shadow-glow-sm);
}

.csp-pill:hover:not(.active) {
  background: var(--primary-light);
  color: var(--primary);
}

.csp-custom-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.csp-date-input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-strong);
  font-size: 13px;
  outline: 0;
}

.csp-date-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }

.csp-range-sep { color: var(--text-muted); font-size: 16px; }

.csp-period-info {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

/* ── KPI Cards ── */
.csp-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.csp-kpi {
  position: relative;
  min-height: 90px;
  padding: 16px;
  background:
    linear-gradient(135deg, var(--primary-light), transparent 42%),
    var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.csp-kpi-label {
  display: block;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.csp-kpi-value {
  display: block;
  margin-top: 8px;
  color: var(--text-strong);
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
}

.csp-kpi-sub {
  display: block;
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 12px;
}

.csp-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, var(--primary-light) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ── Cards ── */
.csp-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.csp-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(90deg, var(--primary-light), var(--bg-card));
}

.csp-card-head strong {
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 800;
}

.csp-card-head span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
}

.csp-close-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.csp-close-btn:hover { background: var(--danger-bg); color: var(--danger); }

/* ── Progress bar ── */
.csp-load-bar {
  height: 3px;
  background: var(--border-color);
}

.csp-load-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.4s ease;
}

/* ── Chart ── */
.csp-chart-wrap {
  min-height: 360px;
  padding: 12px;
  background: radial-gradient(circle at 10% 0%, var(--primary-light), transparent 34%), var(--bg-card);
}

/* ── Error ── */
.csp-error {
  margin: 0 16px 12px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--danger) 34%, transparent);
  border-radius: var(--radius-md);
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 13px;
  font-weight: 600;
}

/* ── Station Grid ── */
.csp-station-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.csp-station-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
}

.csp-station-card:hover,
.csp-station-card.active {
  border-color: var(--primary);
  box-shadow: var(--shadow-glow-sm);
  background: var(--primary-light);
}

.csp-station-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.csp-station-body { flex: 1; min-width: 0; }
.csp-station-body strong { display: block; color: var(--text-strong); font-size: 13px; font-weight: 800; }
.csp-station-body span { display: block; color: var(--text-muted); font-size: 12px; margin-top: 2px; font-variant-numeric: tabular-nums; }

.csp-station-spin {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-color);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Customer Picker ── */
.csp-cust-pick-card { padding: 16px; }

.csp-cust-pick-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}

.csp-pick-field { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 160px; }

.csp-pick-label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.csp-pick-input-row { display: flex; gap: 6px; }

.csp-pick-input {
  flex: 1;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-strong);
  font-size: 13px;
  outline: 0;
  min-width: 0;
}

.csp-pick-btn,
.csp-pick-clear {
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
}

.csp-pick-btn:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
.csp-pick-clear:hover { border-color: var(--danger); color: var(--danger); background: var(--danger-bg); }

.csp-pick-name { color: var(--primary); font-size: 12px; font-weight: 700; margin-top: 2px; }

.csp-search-btn {
  height: 34px;
  padding: 0 20px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--primary);
  color: var(--text-inverse);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: var(--shadow-glow-sm);
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
  align-self: flex-end;
}

.csp-search-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.csp-search-btn:not(:disabled):hover { background: var(--primary-hover); box-shadow: var(--shadow-glow); }

.csp-cust-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 200px;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 600;
}

.csp-cust-empty svg { width: 48px; height: 48px; opacity: 0.3; }

/* ── Table ── */
.csp-table-card .table-scroll { border-right: 0; border-left: 0; }
.csp-num { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--text-strong); }
.csp-up { color: var(--success); }
.csp-down { color: var(--danger); }

.csp-empty { text-align: center; padding: 32px; color: var(--text-muted); font-size: 13px; }

.csp-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.csp-badge.ok {
  border: 1px solid color-mix(in srgb, var(--success) 34%, transparent);
  background: var(--success-bg);
  color: var(--success);
}

.csp-badge.zero {
  border: 1px solid color-mix(in srgb, var(--danger) 34%, transparent);
  background: var(--danger-bg);
  color: var(--danger);
}

/* ── Pagination ── */
.csp-pagination {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-muted);
}

.csp-page-size {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-strong);
  font-size: 12px;
  outline: 0;
}

.csp-page-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
}

.csp-page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.csp-page-btn:not(:disabled):hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }

.csp-page-count { font-weight: 700; color: var(--text-strong); }

/* ── Responsive ── */
@media (max-width: 1200px) {
  .csp-station-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 900px) {
  .csp-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .csp-station-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 620px) {
  .csp-kpi-grid { grid-template-columns: 1fr; }
  .csp-station-grid { grid-template-columns: 1fr; }
  .csp-view-tabs { flex-wrap: wrap; }
  .csp-period-bar { flex-direction: column; align-items: flex-start; }
  .csp-period-info { margin-left: 0; }
}
</style>
