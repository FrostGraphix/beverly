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
          <BaseButton
            v-for="preset in periodPresets"
            :key="preset.key"
            :class="['period-pill', activePeriod === preset.key ? 'period-pill--active' : '']"
            @click="setPeriod(preset.key)"
          >{{ preset.label }}</BaseButton>
        </div>
        <div class="custom-range">
          <div class="eih-date-group">
            <label class="ctrl-label">From</label>
            <BaseInput v-model="filters.from" class="ctrl-input" type="date" @change="onCustomDateChange" />
          </div>
          <div class="eih-date-group">
            <label class="ctrl-label">To</label>
            <BaseInput v-model="filters.to" class="ctrl-input" type="date" @change="onCustomDateChange" />
          </div>
        </div>
        <BaseButton class="eih-btn eih-btn--primary" variant="primary" :disabled="loadingSales || loadingConsumption" @click="reload">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ spinning: loadingSales || loadingConsumption }"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Refresh
        </BaseButton>
        <BaseButton
          v-if="storeAudit"
          class="eih-btn eih-btn--ghost"
          data-testid="site-consumption-audit-export"
          @click="exportAuditReport"
        >
          Export Audit
        </BaseButton>
      </div>
    </div>

    <section v-if="syncAlerts.length" class="sync-alert-banner" data-testid="site-consumption-sync-banner">
      <div class="sync-alert-icon">!</div>
      <div>
        <strong>Sync attention required</strong>
        <p>{{ syncAlertSummary }}</p>
      </div>
    </section>

    <div v-if="auditBadges.length" class="eih-badge-row">
      <article
        v-for="badge in auditBadges"
        :key="badge.label"
        :class="['eih-badge-card', `eih-badge-card--${badge.tone}`]"
      >
        <span class="eih-badge-label">{{ badge.label }}</span>
        <strong class="eih-badge-value">{{ badge.value }}</strong>
        <span v-if="badge.note" class="eih-badge-note">{{ badge.note }}</span>
      </article>
    </div>

    <div v-if="warningDigest.length" class="eih-warning-stack">
      <article v-for="warning in warningDigest" :key="warning.title" class="eih-warning-card">
        <span class="eih-warning-title">{{ warning.title }}</span>
        <span class="eih-warning-copy">{{ warning.copy }}</span>
      </article>
      <div v-if="hiddenWarningCount" class="eih-warning-more">
        {{ hiddenWarningCount }} more audit details are available in Data Integrity.
      </div>
    </div>

    <SiteConsumptionAuditPanel
      v-if="storeAudit"
      :activeStation="filters.stationId"
      :admin="isAdminRole"
      :audit="storeAudit"
      @export-audit="exportAuditReport"
      @select-station="setStation"
    />

    <div class="eih-body">
      <SiteSidebar
        :activeStation="filters.stationId"
        :accountCounts="accountCounts"
        class="eih-sidebar"
        @change="setStation"
      />

      <div class="eih-main">
        <div class="view-pills" role="tablist" aria-label="Site performance views">
          <BaseButton
            v-for="view in views"
            :key="view.key"
            :class="['view-pill', activeView === view.key ? 'view-pill--active' : '']"
            @click="setView(view.key)"
          >{{ view.label }}</BaseButton>
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
      <BaseIconButton class="toast-close" aria-label="Close error" @click="errorMsg = null">x</BaseIconButton>
    </div>
  </div>
</template>

<script>
import {
  LEDGER_STEPS_PER_STATION,
  LIVE_STATIONS,
  fetchConsumptionAudit,
  loadConsumptionData,
  periodRange,
} from "../services/consumption-service.mjs";
import CustomerDrawer from "./consumption/CustomerDrawer.vue";
import BaseButton from "./base/BaseButton.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import SiteConsumptionAuditPanel from "./consumption/SiteConsumptionAuditPanel.vue";
import SiteConsumptionConsumptionView from "./consumption/SiteConsumptionConsumptionView.vue";
import SiteConsumptionFraudView from "./consumption/SiteConsumptionFraudView.vue";
import SiteConsumptionOverviewView from "./consumption/SiteConsumptionOverviewView.vue";
import SiteSidebar from "./consumption/SiteSidebar.vue";
import { downloadTextFile, exportReportCsvText, exportReportExcelXml } from "../services/import-export.mjs";

export default {
  name: "SiteConsumptionPage",
  props: {
    hash: { type: String, default: "" },
    route: { type: Object, default: () => ({}) },
    roleId: { type: String, default: "" },
  },
  components: {
    BaseButton,
    BaseIconButton,
    BaseInput,
    CustomerDrawer,
    SiteConsumptionAuditPanel,
    SiteConsumptionConsumptionView,
    SiteConsumptionFraudView,
    SiteConsumptionOverviewView,
    SiteSidebar,
  },
  data() {
    const initialRange = periodRange("all");
    return {
      filters: {
        stationId: null,
        from: initialRange.from,
        to: initialRange.to,
        granularity: initialRange.granularity,
      },
      activePeriod: "all",
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
      qualityWarnings: [],
      storeAudit: null,
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
        { key: "all", label: "All Data" },
        { key: "day", label: "Day" },
        { key: "month", label: "Month" },
        { key: "year", label: "Year" },
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
      const meta = this.chartData.consumption?.meta || {};
      const readingDayCount = Number(meta.readingDayCount) || 0;
      const meterCount = Number(meta.meterCount) || 0;
      return !this.loadingConsumption && readingDayCount === 0 && meterCount === 0;
    },
    activeAuditStation() {
      if (!this.storeAudit?.stations?.length || !this.filters.stationId) return null;
      return this.storeAudit.stations.find((station) => station.station === this.filters.stationId) || null;
    },
    isAdminRole() {
      return ["admin", "administrator", "super-admin", "superadmin"].includes(String(this.roleId || "").toLowerCase());
    },
    syncAlerts() {
      return Array.isArray(this.storeAudit?.alerts) ? this.storeAudit.alerts : [];
    },
    syncAlertSummary() {
      const critical = this.syncAlerts.filter((alert) => alert.severity === "critical").length;
      const warning = this.syncAlerts.length - critical;
      const first = this.syncAlerts[0]?.message || "Review consumption sync logs.";
      return `${first} ${critical ? `${critical} critical` : ""}${critical && warning ? ", " : ""}${warning ? `${warning} warning` : ""}`.trim();
    },
    auditDataStart() {
      return this.activeAuditStation?.earliestReadingDate || this.storeAudit?.overall?.earliestReadingDate || null;
    },
    combinedWarnings() {
      const auditWarnings = this.activeAuditStation?.warnings || this.storeAudit?.warnings || [];
      return Array.from(new Set([...(this.qualityWarnings || []), ...auditWarnings]));
    },
    warningDigest() {
      const warnings = this.combinedWarnings;
      if (!warnings.length) return [];
      const grouped = new Map();
      for (const warning of warnings) {
        const [station, ...rest] = String(warning).split(":");
        const key = rest.length ? station.trim() : "System";
        const copy = rest.length ? rest.join(":").trim() : String(warning);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(copy);
      }
      return Array.from(grouped.entries()).slice(0, 4).map(([title, items]) => ({
        title,
        copy: items.length === 1 ? items[0] : `${items.length} audit warnings need review.`,
      }));
    },
    hiddenWarningCount() {
      return Math.max(0, this.combinedWarnings.length - this.warningDigest.reduce((sum, item) => {
        const stationWarnings = this.combinedWarnings.filter((warning) => String(warning).startsWith(`${item.title}:`));
        return sum + Math.max(1, stationWarnings.length || 1);
      }, 0));
    },
    auditBadges() {
      const station = this.activeAuditStation;
      const overall = this.storeAudit?.overall;
      if (!station && !overall) return [];

      const completenessStatus = station?.completenessStatus || overall?.completenessStatus || "unknown";
      const freshnessStatus = station?.freshness?.status || overall?.freshnessStatus || "unknown";
      const coverageStatus = station?.coverage?.status || overall?.coverageStatus || "unknown";
      const latestReadingDate = station?.latestReadingDate || overall?.latestReadingDate || "n/a";
      const earliestReadingDate = station?.earliestReadingDate || overall?.earliestReadingDate || "n/a";
      const liveDelta = station?.deltaStoreVsLive;
      const configuredFrom = station?.effectiveCoverageStart || this.storeAudit?.overall?.earliestReadingDate || this.storeAudit?.configuredFrom || "n/a";

      return [
        {
          label: "Backfill",
          value: completenessStatus === "complete" ? "Complete" : completenessStatus === "incomplete" ? "Gap Found" : completenessStatus === "unverified" ? "Unverified" : "Unknown",
          note: liveDelta == null ? `Rows ${station?.rows ?? overall?.totalRows ?? 0}` : `${station?.liveMetric === "unique" ? "Unique" : "Raw"} delta ${liveDelta}`,
          tone: completenessStatus === "complete" ? "ok" : completenessStatus === "incomplete" || completenessStatus === "unverified" ? "warn" : "muted",
        },
        {
          label: "Freshness",
          value: freshnessStatus === "fresh" ? "Fresh" : freshnessStatus === "stale" ? "Stale" : freshnessStatus === "aging" ? "Aging" : "Unknown",
          note: `Latest ${latestReadingDate}`,
          tone: freshnessStatus === "fresh" ? "ok" : freshnessStatus === "stale" ? "warn" : "muted",
        },
        {
          label: "Coverage",
          value: coverageStatus === "full" ? "Full" : coverageStatus === "partial" ? "Partial" : "Unknown",
          note: `From ${earliestReadingDate} vs ${configuredFrom}`,
          tone: coverageStatus === "full" ? "ok" : coverageStatus === "partial" ? "warn" : "muted",
        },
      ];
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
    const didReloadFromHash = this.syncFiltersFromHash();
    if (!didReloadFromHash) this.reload();
  },
  beforeUnmount() {
    clearTimeout(this._reloadTimer);
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
      if (this.filters.stationId === nextStation) return false;
      this.filters.stationId = nextStation;
      this.reload();
      return true;
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

      const nextRange = periodRange(key);
      this.filters.from = nextRange.from;
      this.filters.to = nextRange.to;
      this.filters.granularity = nextRange.granularity;

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
    addWarning(message) {
      if (!message) return;
      this.qualityWarnings = Array.from(new Set([...(this.qualityWarnings || []), String(message)]));
    },
    async refreshAudit(generation) {
      try {
        const audit = await fetchConsumptionAudit();
        if (this._reloadGen !== generation) return;
        this.storeAudit = audit;
        if (this.activePeriod === "all") {
          const station = this.filters.stationId
            ? audit?.stations?.find((item) => item.station === this.filters.stationId)
            : null;
          const firstDataDate = station?.earliestReadingDate || audit?.overall?.earliestReadingDate || null;
          if (firstDataDate && firstDataDate > this.filters.from) this.filters.from = firstDataDate;
        }
        return audit;
      } catch (error) {
        if (this._reloadGen !== generation) return;
        this.addWarning(error?.message || "Consumption audit failed.");
        return null;
      }
    },
    async _doReload() {
      const generation = (this._reloadGen = (this._reloadGen || 0) + 1);

      if (this.filters.from > this.filters.to) {
        this.errorMsg = '"From" date must be before or equal to "To" date.';
        return;
      }

      this.errorMsg = null;
      this.qualityWarnings = [];
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
      const auditPromise = this.refreshAudit(generation);
      if (this.activePeriod === "all") await auditPromise;

      try {
        await loadConsumptionData(
          {
            stationId: this.filters.stationId,
            from: this.filters.from,
            to: this.filters.to,
            granularity: this.filters.granularity,
            skipLedger: this.activeView === "consumption",
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
            onRangeReady: ({ from, to }) => {
              if (this._reloadGen !== generation || this.activePeriod !== "all") return;
              this.filters.from = from;
              this.filters.to = to;
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
            onWarning: (message) => {
              if (this._reloadGen !== generation) return;
              this.addWarning(message);
            },
          }
        );
        if (this.activePeriod !== "all") await auditPromise;
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
    exportAuditReport() {
      if (!this.storeAudit) return;
      const columns = [
        { key: "station", label: "Station" },
        { key: "rows", label: "Store Rows" },
        { key: "logicalRawRows", label: "Logical Raw Rows" },
        { key: "liveTotalRows", label: "Live Rows" },
        { key: "liveMetric", label: "Live Metric" },
        { key: "deltaStoreVsLive", label: "Store Vs Live Delta" },
        { key: "deltaStoreVsProgress", label: "Store Vs Progress Delta" },
        { key: "earliestReadingDate", label: "Earliest Reading" },
        { key: "latestReadingDate", label: "Latest Reading" },
        { key: "midnightStatus", label: "Midnight Sync" },
        { key: "expectedMidnightDate", label: "Expected Midnight Date" },
        { key: "backfillStatus", label: "Backfill Drift" },
        { key: "coverageStatus", label: "Coverage" },
        { key: "freshnessStatus", label: "Freshness" },
        { key: "warnings", label: "Warnings" },
      ];
      const rows = (this.storeAudit.stations || []).map((station) => ({
        ...station,
        midnightStatus: station.midnightSync?.status || "unknown",
        expectedMidnightDate: station.midnightSync?.expectedDate || this.storeAudit.expectedMidnightDate || "",
        backfillStatus: station.backfillDrift?.status || "unknown",
        coverageStatus: station.coverage?.status || "unknown",
        freshnessStatus: station.freshness?.status || "unknown",
        warnings: (station.warnings || []).join(" | "),
      }));
      const meta = [
        ["Route", window.location.hash || "#/prepay-report/site-consumption"],
        ["Generated At", this.storeAudit.generatedAt || new Date().toISOString()],
        ["Expected Midnight Date", this.storeAudit.expectedMidnightDate || ""],
        ["Completeness", this.storeAudit.overall?.completenessStatus || ""],
        ["Midnight Sync", this.storeAudit.overall?.midnightSyncStatus || ""],
        ["Backfill Drift", this.storeAudit.overall?.backfillDriftStatus || ""],
      ];
      const baseName = `site-consumption-audit-${new Date().toISOString().slice(0, 10)}`;
      downloadTextFile(`${baseName}.csv`, exportReportCsvText("Site Consumption Audit", columns, rows, meta), "text/csv;charset=utf-8");
      downloadTextFile(`${baseName}.xls`, exportReportExcelXml("Site Consumption Audit", columns, rows, meta), "application/vnd.ms-excel");
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
  background:
    radial-gradient(circle at top left, rgba(var(--primary-rgb, 59, 130, 246), 0.10), transparent 34rem),
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 22rem);
  overflow-x: clip;
}

.eih-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 18px;
  padding: 18px;
  border: 1px solid var(--border-color);
  border-radius: calc(var(--radius-lg) + 4px);
  background: linear-gradient(135deg, var(--bg-card), rgba(var(--primary-rgb, 59, 130, 246), 0.06));
  box-shadow: var(--shadow-md);
}

.eih-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 220px;
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
  justify-content: flex-end;
}

.eih-btn--ghost {
  background: var(--bg-card);
  color: var(--text-strong);
  border: 1px solid var(--border-color);
}

.sync-alert-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(244, 81, 108, 0.32);
  background: rgba(244, 81, 108, 0.08);
  color: var(--text-strong);
}

.sync-alert-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: #f4516c;
  color: #fff;
  font-weight: 900;
  flex-shrink: 0;
}

.sync-alert-banner strong {
  display: block;
  font-size: 13px;
}

.sync-alert-banner p {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.45;
}

.eih-badge-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.eih-badge-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

.eih-badge-card--ok {
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.08);
}

.eih-badge-card--warn {
  border-color: rgba(244, 81, 108, 0.35);
  background: rgba(244, 81, 108, 0.08);
}

.eih-badge-label {
  font-size: 10px;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.eih-badge-value {
  font-size: 18px;
  color: var(--text-strong);
}

.eih-badge-note {
  font-size: 12px;
  color: var(--text-muted);
}

.eih-warning-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.eih-warning-card {
  display: grid;
  grid-template-columns: minmax(84px, 140px) 1fr;
  gap: 12px;
  padding: 13px 16px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(244, 81, 108, 0.34);
  background: linear-gradient(135deg, rgba(244, 81, 108, 0.11), rgba(15, 23, 42, 0.02));
  color: var(--text-main);
  font-size: 12px;
  line-height: 1.4;
}

.eih-warning-title {
  color: #f97388;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0;
}

.eih-warning-copy {
  color: var(--text-strong);
  font-weight: 600;
}

.eih-warning-more {
  padding: 9px 12px;
  border-radius: var(--radius-md);
  background: rgba(255, 184, 34, 0.10);
  border: 1px dashed rgba(255, 184, 34, 0.32);
  color: var(--text-main);
  font-size: 12px;
  font-weight: 700;
}

.period-pills {
  display: flex;
  gap: 4px;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  padding: 3px;
  min-height: 38px;
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
  height: 38px;
  padding: 0 8px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  font-size: 12px;
  font-family: var(--font-family);
  background: var(--bg-card);
  color: var(--text-main);
}

.eih-btn {
  min-height: 38px;
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
  min-width: 0;
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
  .eih-badge-row {
    grid-template-columns: 1fr;
  }

  .eih-sidebar {
    width: 120px;
  }
}

@media (max-width: 700px) {
  .eih-page {
    padding: 12px;
    gap: 14px;
  }

  .eih-header {
    padding: 14px;
    gap: 14px;
    border-radius: var(--radius-lg);
  }

  .eih-title {
    min-width: 0;
    width: 100%;
  }

  .eih-icon {
    width: 32px;
    height: 32px;
  }

  .eih-h1 {
    font-size: 17px;
  }

  .eih-sub {
    font-size: 12px;
    line-height: 1.4;
  }

  .eih-controls {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .period-pills {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    border-radius: 18px;
  }

  .period-pill {
    min-width: 0;
    padding: 8px 6px;
    font-size: 12px;
  }

  .custom-range {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    gap: 10px;
  }

  .ctrl-input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    font-size: 16px;
  }

  .eih-btn {
    width: 100%;
    min-height: 46px;
    justify-content: center;
    font-size: 14px;
  }

  .sync-alert-banner {
    align-items: flex-start;
    padding: 14px;
  }

  .eih-warning-card {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .eih-badge-card {
    padding: 13px 14px;
  }

  .eih-body {
    flex-direction: column;
    gap: 14px;
  }

  .eih-sidebar {
    width: 100%;
    position: static;
  }

  .view-pills {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    box-sizing: border-box;
  }

  .view-pill {
    min-width: 0;
    height: 42px;
    padding: 0 8px;
    font-size: 13px;
  }
}

@media (max-width: 420px) {
  .period-pill {
    font-size: 11px;
  }

  .custom-range {
    grid-template-columns: 1fr;
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
  background: var(--primary-light);
  border: 1px dashed var(--border-mid);
  color: var(--primary);
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
