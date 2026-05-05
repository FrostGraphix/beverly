<template>
  <div class="eih-page">
    <div class="eih-header">
      <div class="eih-title">
        <svg class="eih-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66l4.07-7.27A.5.5 0 0 1 11.62 6H16l-1 7h3.5c.49 0 .56.33.47.51L13 21z"/>
          <circle cx="19" cy="5" r="2" fill="currentColor" stroke="none"/>
        </svg>
        <div>
          <h1 class="eih-h1">Site Performance</h1>
          <p class="eih-sub">Sales collected, energy consumed, and likely losses.</p>
        </div>
      </div>
      <div class="eih-controls">
        <div class="period-pills">
          <button
            v-for="preset in periodPresets"
            :key="preset.key"
            :class="['period-pill', activePeriod === preset.key ? 'period-pill--active' : '']"
            type="button"
            @click="setPeriod(preset.key)"
          >{{ preset.label }}</button>
        </div>
        <div class="custom-range">
          <div class="eih-date-group">
            <label class="ctrl-label">From</label>
            <input v-model="filters.from" class="ctrl-input" type="date" @change="onCustomDateChange" />
          </div>
          <div class="eih-date-group">
            <label class="ctrl-label">To</label>
            <input v-model="filters.to" class="ctrl-input" type="date" @change="onCustomDateChange" />
          </div>
        </div>
        <button class="eih-btn eih-btn--primary" :disabled="loadingSales || loadingConsumption" @click="reload">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ spinning: loadingSales || loadingConsumption }"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Refresh
        </button>
      </div>
    </div>

    <div class="eih-body">
      <SiteSidebar
        :activeStation="filters.stationId"
        :accountCounts="accountCounts"
        class="eih-sidebar"
        @change="setStation"
      />

      <div class="eih-main">
        <div class="view-pills" role="tablist" aria-label="Site performance views">
          <button
            v-for="view in views"
            :key="view.key"
            :class="['view-pill', activeView === view.key ? 'view-pill--active' : '']"
            type="button"
            @click="setView(view.key)"
          >{{ view.label }}</button>
        </div>

        <SiteConsumptionOverviewView
          v-if="activeView === 'overview'"
          :activeStation="filters.stationId"
          :accountCounts="accountCounts"
          :chartData="chartData"
          :dateRangeLabel="dateRangeLabel"
          :granularity="filters.granularity"
          :insightText="insightText"
          :kpiData="kpiData"
          :loadingConsumption="loadingConsumption"
          :loadingSales="loadingSales"
          :periodLabel="activePeriodLabel"
          :showConsumptionEmpty="showConsumptionEmpty"
          :showSalesEmpty="showSalesEmpty"
          :suspectLedger="suspectLedger"
          @select-station="openStationView"
        />

        <SiteConsumptionConsumptionView
          v-else-if="activeView === 'consumption'"
          :activeStation="filters.stationId"
          :accountCounts="accountCounts"
          :chartData="chartData"
          :dateRangeLabel="dateRangeLabel"
          :granularity="filters.granularity"
          :kpiData="kpiData"
          :loadingConsumption="loadingConsumption"
          :periodLabel="activePeriodLabel"
          :showConsumptionEmpty="showConsumptionEmpty"
          :suspectLedger="suspectLedger"
          @select-station="openStationView"
        />

        <SiteConsumptionFraudView
          v-else
          :activeStation="filters.stationId"
          :accountCounts="accountCounts"
          :chartData="chartData"
          :dateRangeLabel="dateRangeLabel"
          :kpiData="kpiData"
          :ledgerProgress="ledgerProgress"
          :loadingLedger="loadingLedger"
          :suspectLedger="suspectLedger"
          @select="openDrawer"
          @select-station="openStationView"
        />
      </div>
    </div>

    <CustomerDrawer
      :customer="selectedCustomer"
      @close="selectedCustomer = null"
      @relay-control="handleRelayControl"
    />

    <div v-if="errorMsg" class="eih-error-toast">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      {{ errorMsg }}
      <button class="toast-close" @click="errorMsg = null">x</button>
    </div>
  </div>
</template>

<script>
import {
  LEDGER_STEPS_PER_STATION,
  LIVE_STATIONS,
  currentMonthRange,
  loadConsumptionData,
} from "../services/consumption-service.mjs";
import CustomerDrawer from "./consumption/CustomerDrawer.vue";
import SiteConsumptionConsumptionView from "./consumption/SiteConsumptionConsumptionView.vue";
import SiteConsumptionFraudView from "./consumption/SiteConsumptionFraudView.vue";
import SiteConsumptionOverviewView from "./consumption/SiteConsumptionOverviewView.vue";
import SiteSidebar from "./consumption/SiteSidebar.vue";

export default {
  name: "SiteConsumptionPage",
  props: {
    hash: { type: String, default: "" },
    route: { type: Object, default: () => ({}) },
  },
  components: {
    CustomerDrawer,
    SiteConsumptionConsumptionView,
    SiteConsumptionFraudView,
    SiteConsumptionOverviewView,
    SiteSidebar,
  },
  data() {
    const [from, to] = currentMonthRange();
    return {
      filters: { stationId: null, from, to, granularity: "daily" },
      activePeriod: "month",
      chartMode: "sales",
      kpiData: {},
      chartData: {
        sales: {
          stationBar: [],
          temporal: { labels: [], kwhSeries: [], revenueSeries: [] },
        },
        consumption: {
          stationBar: [],
          temporal: { labels: [], kwhSeries: [] },
          meta: { meterCount: 0, metersWithConsumption: 0, readingDayCount: 0 },
        },
      },
      suspectLedger: [],
      ledgerProgress: { loaded: 0, total: 0, label: "" },
      loadingSales: false,
      loadingConsumption: false,
      loadingLedger: false,
      accountCounts: {},
      selectedCustomer: null,
      errorMsg: null,
    };
  },
  computed: {
    views() {
      return [
        { key: "overview", label: "Overview" },
        { key: "consumption", label: "Consumption" },
        { key: "fraud", label: "Fraud" },
      ];
    },
    periodPresets() {
      return [
        { key: "today", label: "Today" },
        { key: "week", label: "This Week" },
        { key: "month", label: "This Month" },
        { key: "year", label: "This Year" },
        { key: "custom", label: "Custom" },
      ];
    },
    activePeriodLabel() {
      return this.periodPresets.find((preset) => preset.key === this.activePeriod)?.label || "Period";
    },
    activeView() {
      return this.parseViewFromHash(this.hash || window.location.hash);
    },
    activeStationFromHash() {
      return this.parseStationFromHash(this.hash || window.location.hash);
    },
    dateRangeLabel() {
      return `${this.filters.from} to ${this.filters.to}`;
    },
    showSalesEmpty() {
      return !this.loadingSales && (this.kpiData.rechargeCount || 0) === 0;
    },
    showConsumptionEmpty() {
      return !this.loadingConsumption && (this.kpiData.consumedKwh || 0) === 0;
    },
    activeStationChartData() {
      return this.chartMode === "sales"
        ? this.chartData.sales.stationBar
        : this.chartData.consumption.stationBar;
    },
    activeTemporalData() {
      return this.chartMode === "sales"
        ? this.chartData.sales.temporal
        : this.chartData.consumption.temporal;
    },
    insightText() {
      const sold = Number(this.kpiData.purchasedKwh) || 0;
      const consumed = Number(this.kpiData.consumedKwh) || 0;
      const shortfall = Number(this.kpiData.revenueShortfall) || 0;
      const unmatched = Number(this.kpiData.unmatchedMeters) || 0;
      const topStation = this.chartData.consumption.stationBar[0]?.station || this.chartData.sales.stationBar[0]?.station;

      if (!sold && !consumed) return "No commercial activity or meter activity exists in the selected range.";
      if (shortfall > 0 && unmatched > 0) {
        return `Consumption is outrunning collected sales by ${Math.max(0, consumed - sold).toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh, with ${unmatched} unmatched meters and a shortfall of N${shortfall.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`;
      }
      if (shortfall > 0) {
        return `Collected sales are below expected energy value by N${shortfall.toLocaleString(undefined, { maximumFractionDigits: 0 })}. Focus first on ${topStation || "the highest-consumption station"}.`;
      }
      if (consumed > sold) {
        return `Metered consumption exceeds sold units by ${(consumed - sold).toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh. Validate meter coverage before acting on fraud risk.`;
      }
      return `Sales and metered consumption are broadly aligned. Highest current station load is ${topStation || "not yet identified"}.`;
    },
  },
  mounted() {
    this.syncFiltersFromHash();
    this.reload();
  },
  watch: {
    hash() {
      this.syncFiltersFromHash();
    },
  },
  methods: {
    buildHash(view = this.activeView, stationId = this.filters.stationId) {
      const params = new URLSearchParams();
      if (view && view !== "overview") params.set("view", view);
      if (stationId) params.set("station", stationId);
      const query = params.toString();
      return query ? `#/prepay-report/site-consumption?${query}` : "#/prepay-report/site-consumption";
    },
    parseViewFromHash(hash) {
      const value = String(hash || "");
      const queryIndex = value.indexOf("?");
      if (queryIndex === -1) return "overview";
      const params = new URLSearchParams(value.slice(queryIndex + 1));
      const view = params.get("view");
      return this.views.some((item) => item.key === view) ? view : "overview";
    },
    parseStationFromHash(hash) {
      const value = String(hash || "");
      const queryIndex = value.indexOf("?");
      if (queryIndex === -1) return null;
      const params = new URLSearchParams(value.slice(queryIndex + 1));
      const station = params.get("station");
      return LIVE_STATIONS.includes(station) ? station : null;
    },
    syncFiltersFromHash() {
      const nextStation = this.activeStationFromHash;
      if (this.filters.stationId === nextStation) return;
      this.filters.stationId = nextStation;
      this.reload();
    },
    openStationView({ stationId, view }) {
      const nextView = this.views.some((item) => item.key === view) ? view : this.activeView;
      window.location.hash = this.buildHash(nextView, stationId);
    },
    setStation(stationId) {
      const nextHash = this.buildHash(this.activeView, stationId);
      if (window.location.hash === nextHash) return;
      window.location.hash = nextHash;
    },
    setView(view) {
      if (!this.views.some((item) => item.key === view)) return;
      if (window.location.hash === `#/prepay-report/site-consumption?view=${view}`) return;
      window.location.hash = this.buildHash(view, this.filters.stationId);
    },
    setPeriod(key) {
      this.activePeriod = key;
      if (key === "custom") {
        this.$nextTick(() => {
          const input = this.$el?.querySelector("input[type='date']");
          if (input) input.focus();
        });
        return;
      }

      const now = new Date();
      const pad = (value) => String(value).padStart(2, "0");
      const format = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      const today = format(now);

      if (key === "today") {
        this.filters.from = today;
        this.filters.to = today;
        this.filters.granularity = "daily";
      } else if (key === "week") {
        const monday = new Date(now);
        monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        this.filters.from = format(monday);
        this.filters.to = today;
        this.filters.granularity = "daily";
      } else if (key === "month") {
        this.filters.from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
        this.filters.to = today;
        this.filters.granularity = "daily";
      } else if (key === "year") {
        this.filters.from = `${now.getFullYear()}-01-01`;
        this.filters.to = today;
        this.filters.granularity = "monthly";
      }

      this.reload();
    },
    onCustomDateChange() {
      this.activePeriod = "custom";
      const diff = Math.ceil((new Date(this.filters.to).getTime() - new Date(this.filters.from).getTime()) / 86400000);
      if (diff <= 31) this.filters.granularity = "daily";
      else if (diff <= 180) this.filters.granularity = "weekly";
      else if (diff <= 730) this.filters.granularity = "monthly";
      else this.filters.granularity = "yearly";
      this.reload();
    },
    reload() {
      clearTimeout(this._reloadTimer);
      this._reloadTimer = setTimeout(() => this._doReload(), 200);
    },
    async _doReload() {
      const generation = (this._reloadGen = (this._reloadGen || 0) + 1);

      if (this.filters.from > this.filters.to) {
        this.errorMsg = '"From" date must be before or equal to "To" date.';
        return;
      }

      this.errorMsg = null;
      this.loadingSales = true;
      this.loadingConsumption = true;
      this.loadingLedger = true;
      this.suspectLedger = [];
      this.accountCounts = {};
      this.chartData = {
        sales: {
          stationBar: [],
          temporal: { labels: [], kwhSeries: [], revenueSeries: [] },
        },
        consumption: {
          stationBar: [],
          temporal: { labels: [], kwhSeries: [] },
          meta: { meterCount: 0, metersWithConsumption: 0, readingDayCount: 0 },
        },
      };

      const stationCount = this.filters.stationId ? 1 : LIVE_STATIONS.length;
      this.ledgerProgress = { loaded: 0, total: stationCount * LEDGER_STEPS_PER_STATION, label: "" };

      try {
        await loadConsumptionData(
          {
            stationId: this.filters.stationId,
            from: this.filters.from,
            to: this.filters.to,
            granularity: this.filters.granularity,
          },
          {
            onKpiReady: (kpi) => {
              if (this._reloadGen !== generation) return;
              this.kpiData = kpi;
              this.loadingSales = false;
            },
            onConsumptionReady: (consumptionKpi) => {
              if (this._reloadGen !== generation) return;
              this.kpiData = { ...this.kpiData, ...consumptionKpi };
              this.loadingConsumption = false;
            },
            onChartsReady: ({ sales, consumption }) => {
              if (this._reloadGen !== generation) return;
              this.chartData = { sales, consumption };
            },
            onLedgerProgress: (loaded, total, station) => {
              if (this._reloadGen !== generation) return;
              this.ledgerProgress = { loaded, total, label: station || "" };
            },
            onLedgerReady: ({ ledger, kpiUpdate, accountCounts }) => {
              if (this._reloadGen !== generation) return;
              this.suspectLedger = ledger;
              this.kpiData = { ...this.kpiData, ...kpiUpdate };
              this.accountCounts = accountCounts || {};
              this.loadingLedger = false;
            },
            onError: (error) => {
              if (this._reloadGen !== generation) return;
              this.loadingSales = false;
              this.loadingConsumption = false;
              this.loadingLedger = false;
              this.errorMsg = error?.message || "Failed to load site analytics";
              console.error("[SiteConsumptionPage]", error);
            },
          }
        );
      } catch (error) {
        if (this._reloadGen !== generation) return;
        if (error.name !== "AbortError") {
          this.loadingSales = false;
          this.loadingConsumption = false;
          this.loadingLedger = false;
          this.errorMsg = error?.message || "Failed to load site analytics";
        }
      }
    },
    openDrawer(customer) {
      this.selectedCustomer = customer;
    },
    handleRelayControl(customer) {
      window.location.hash = `#/remote-operation/remote-meter-control?meterId=${customer.meterId}`;
    },
  },
};
</script>

<style scoped>
.eih-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  min-height: 100%;
  box-sizing: border-box;
  font-family: var(--font-family);
}

.eih-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}

.eih-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.eih-icon {
  width: 36px;
  height: 36px;
  padding: 7px;
  background: var(--primary-light);
  color: var(--primary);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.eih-h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--text-strong);
  line-height: 1.2;
}

.eih-sub {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}

.eih-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.period-pills {
  display: flex;
  gap: 4px;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  padding: 3px;
}

.period-pill {
  padding: 5px 14px;
  border-radius: 20px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-family: var(--font-family);
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.period-pill:hover {
  color: var(--text-main);
}

.period-pill--active {
  background: var(--primary);
  color: #fff;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(var(--primary-rgb, 59, 130, 246), 0.35);
}

.custom-range {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.eih-date-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ctrl-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.ctrl-input {
  height: 30px;
  padding: 0 8px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  font-size: 12px;
  font-family: var(--font-family);
  background: var(--bg-card);
  color: var(--text-main);
}

.eih-btn {
  height: 30px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-family: var(--font-family);
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  transition: all 0.15s;
}

.eih-btn svg {
  width: 14px;
  height: 14px;
}

.eih-btn--primary {
  background: var(--primary);
  color: #fff;
}

.eih-btn--primary:hover:not(:disabled) {
  opacity: 0.88;
}

.eih-btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.eih-body {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.eih-sidebar {
  width: 160px;
  flex-shrink: 0;
  position: sticky;
  top: 80px;
}

.eih-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.view-pills {
  display: inline-flex;
  align-self: flex-start;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
}

.view-pill {
  min-width: 112px;
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-family: var(--font-family);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.view-pill:hover {
  color: var(--text-main);
}

.view-pill--active {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 2px 8px rgba(var(--primary-rgb, 59, 130, 246), 0.35);
}

.insight-banner {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(54,163,247,.08), rgba(244,81,108,.05));
  border: 1px solid rgba(54,163,247,.18);
}

.insight-banner-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text-muted);
}

.insight-banner-text {
  font-size: 14px;
  line-height: 1.45;
  color: var(--text-strong);
}

@media (max-width: 1100px) {
  .eih-sidebar {
    width: 120px;
  }
}

@media (max-width: 700px) {
  .eih-body {
    flex-direction: column;
  }

  .eih-sidebar {
    width: 100%;
    position: static;
  }
}

.eih-no-data {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
}

.eih-no-data svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.eih-no-data--amber {
  background: rgba(255, 184, 34, 0.06);
  border: 1px dashed rgba(255, 184, 34, 0.3);
  color: #b8860b;
}

.eih-no-data--blue {
  background: rgba(54, 163, 247, 0.06);
  border: 1px dashed rgba(54, 163, 247, 0.28);
  color: #2563eb;
}

.eih-error-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #f4516c;
  color: #fff;
  border-radius: var(--radius-md);
  padding: 12px 20px;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 8px 32px rgba(244, 81, 108, 0.4);
  z-index: 999;
}

.eih-error-toast svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.toast-close {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  padding-left: 6px;
  opacity: 0.8;
}

.toast-close:hover {
  opacity: 1;
}
</style>
