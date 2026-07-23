<template>
  <div class="dashboard-live-page">
    <section class="dashboard-card-grid" aria-label="Dashboard summary">
      <template v-if="loading">
        <div v-for="i in 4" :key="'skel-card-'+i" class="dashboard-stat-card dashboard-stat-skeleton" aria-hidden="true">
          <span class="dashboard-skeleton-icon"></span>
          <div class="dashboard-skeleton-copy">
            <span class="dashboard-skeleton-line dashboard-skeleton-line--label"></span>
            <span class="dashboard-skeleton-line dashboard-skeleton-line--value"></span>
          </div>
        </div>
      </template>
      <template v-else>
        <BaseButton
          v-for="card in cards"
          :key="card.key"
          :class="['dashboard-stat-card', 'dashboard-stat-card--' + card.key, activeType === card.type ? 'active' : '']"
          @click="loadTopChart(card.type)"
        >
          <span class="dashboard-stat-icon" :style="{ color: card.color, '--theme-color': card.color }" v-html="card.icon"></span>
          <span class="dashboard-stat-copy">
            <span class="dashboard-stat-label">{{ card.label }}</span>
            <span class="dashboard-stat-value">
              <span v-if="card.key === 'totalPurchaseMoney'" class="dashboard-stat-symbol" aria-label="Naira">₦</span>
              <span>{{ formatStatValue(card, animatedPanel[card.key]) }}</span>
              <span v-if="card.key === 'totalPurchaseUnit'" class="dashboard-stat-unit">kWh</span>
            </span>
          </span>
        </BaseButton>
      </template>
    </section>

    <section class="dashboard-chart-card dashboard-chart-wide" aria-label="Top dashboard chart">
      <div v-if="loading" class="dashboard-chart-skeleton" role="status" aria-label="Loading purchase chart">
        <span class="dashboard-chart-skeleton-title"></span>
        <div class="dashboard-chart-skeleton-plot" aria-hidden="true">
          <span v-for="height in [36, 56, 44, 72, 48, 62, 40, 78, 52, 66, 46, 70]" :key="height" class="dashboard-chart-skeleton-bar" :style="{ height: `${height}%` }"></span>
        </div>
      </div>
      <EChartPanel v-else :option="topChartOption" />
    </section>

    <section class="dashboard-chart-pair">
      <article class="dashboard-chart-card">
        <div v-if="loading" class="dashboard-chart-skeleton dashboard-chart-skeleton--compact" role="status" aria-label="Loading success chart">
          <span class="dashboard-chart-skeleton-title"></span>
          <div class="dashboard-chart-skeleton-plot" aria-hidden="true">
            <span v-for="height in [42, 58, 48, 68, 54, 76, 64, 82]" :key="height" class="dashboard-chart-skeleton-bar" :style="{ height: `${height}%` }"></span>
          </div>
        </div>
        <EChartPanel v-else :option="successChartOption" />
      </article>
      <article class="dashboard-chart-card">
        <div v-if="loading" class="dashboard-chart-skeleton dashboard-chart-skeleton--compact" role="status" aria-label="Loading alarm chart">
          <span class="dashboard-chart-skeleton-title"></span>
          <div class="dashboard-chart-skeleton-plot" aria-hidden="true">
            <span v-for="height in [58, 46, 70, 52, 80, 64, 42, 72]" :key="height" class="dashboard-chart-skeleton-bar" :style="{ height: `${height}%` }"></span>
          </div>
        </div>
        <EChartPanel v-else :option="alarmChartOption" @chart-click="openAbnormalAlarmPage" />
      </article>
    </section>

    <section class="dashboard-chart-card dashboard-consumption-card" :aria-label="`${consumptionTitle} chart`">
      <div class="dashboard-consumption-top">
        <BaseButton
          v-for="mode in consumptionModes"
          :key="mode.id"
          :class="['dashboard-period-chip', consumptionMode === mode.id ? 'active' : '']"
          size="sm"
          @click="setConsumptionMode(mode.id)"
        >
          {{ mode.label }}
        </BaseButton>
      </div>
      <div v-if="loading" class="dashboard-chart-skeleton dashboard-chart-skeleton--compact" role="status" aria-label="Loading consumption chart">
        <span class="dashboard-chart-skeleton-title"></span>
        <div class="dashboard-chart-skeleton-plot" aria-hidden="true">
          <span v-for="height in [34, 62, 46, 72, 54, 42, 68, 58]" :key="height" class="dashboard-chart-skeleton-bar" :style="{ height: `${height}%` }"></span>
        </div>
      </div>
      <div v-else-if="!consumption.values.length" class="dashboard-chart-empty">No current consumption data.</div>
      <EChartPanel v-else :option="consumptionChartOption" />
    </section>
  </div>
</template>

<script>
import EChartPanel from "./EChartPanel.vue";
import BaseButton from "./base/BaseButton.vue";
import { fetchDashboardData } from "../services/dashboard-service.mjs";
import { createBarOption, createLineOption, createPieOption, dashboardSeries } from "../services/dashboard-chart-options.mjs";
import { dashboardChartTitles } from "../services/mappers/dashboard-mapper.mjs";
import { useOemStore } from "../stores/oem-store";

const iconMarkup = {
  account: '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512 512c113.1 0 204.8-91.7 204.8-204.8S625.1 102.4 512 102.4 307.2 194.1 307.2 307.2 398.9 512 512 512zm0 102.4c-136.5 0-409.6 68.5-409.6 204.8v102.4h819.2V819.2c0-136.3-273.1-204.8-409.6-204.8z"/></svg>',
  times: '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M170.7 170.7h682.6v85.3H170.7v-85.3zm0 298.6h682.6v85.4H170.7v-85.4zm0 298.7h682.6v85.3H170.7V768zm85.3-426.7 170.7 170.7L256 682.7h128L554.7 512 384 341.3H256z"/></svg>',
  unit: '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512 128c176.7 0 320 57.3 320 128S688.7 384 512 384 192 326.7 192 256s143.3-128 320-128zm320 256v96c0 70.7-143.3 128-320 128s-320-57.3-320-128v-96c68.8 58.7 192 85.3 320 85.3s251.2-26.6 320-85.3zm0 224v96c0 70.7-143.3 128-320 128s-320-57.3-320-128v-96c68.8 58.7 192 85.3 320 85.3s251.2-26.6 320-85.3z"/></svg>',
  money: '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512 128c176.7 0 320 57.3 320 128S688.7 384 512 384 192 326.7 192 256s143.3-128 320-128zm0 341.3c78.5 0 151.5-11.3 213.3-30.7V512c0 117.8 95.5 213.3 213.4 213.3-23.7 61.9-196.3 106.7-426.7 106.7-176.7 0-320-57.3-320-128V384c68.8 58.7 192 85.3 320 85.3zm298.7 85.4 64 64 128-128 42.6 42.6-170.6 170.7-106.7-106.7 42.7-42.6z"/></svg>'
};

const dashboardCards = [
  { type: 0, key: "totalAccountCount", label: "Account Count", icon: iconMarkup.account, colorKey: "primary" },
  { type: 1, key: "totalPurchaseTimes", label: "Purchase Times", icon: iconMarkup.times, colorKey: "success" },
  { type: 2, key: "totalPurchaseUnit", label: "Purchase Unit", icon: iconMarkup.unit, colorKey: "primaryDeep" },
  { type: 3, key: "totalPurchaseMoney", label: "Purchase Money", icon: iconMarkup.money, colorKey: "primary" }
];

const consumptionModes = [
  { id: "daily", label: "Daily", type: 4 },
  { id: "monthly", label: "Monthly", type: 5 }
];

export default {
  name: "DashboardPage",
  components: { BaseButton, EChartPanel },
  data() {
    return {
      loading: true,
      activeType: 3,
      panel: {
        totalAccountCount: 0,
        totalPurchaseTimes: 0,
        totalPurchaseUnit: 0,
        totalPurchaseMoney: 0
      },
      animatedPanel: {
        totalAccountCount: 0,
        totalPurchaseTimes: 0,
        totalPurchaseUnit: 0,
        totalPurchaseMoney: 0
      },
      top: { title: dashboardChartTitles[3], labels: [], values: [] },
      consumption: { title: dashboardChartTitles[4], labels: [], values: [] },
      dailyConsumption: { title: dashboardChartTitles[4], labels: [], values: [] },
      success: { labels: [], values: [] },
      alarms: [],
      consumptionMode: "daily",
      chartTheme: null,
      themeObserver: null,
      countFrame: null,
      refreshTimer: null,
      visibilityHandler: null,
      dashboardLoadId: 0,
      warmApplied: false
    };
  },
  computed: {
    oemStore() {
      return useOemStore();
    },
    cards() {
      const theme = this.chartTheme || {};
      return dashboardCards.map((card) => ({
        ...card,
        color: theme[card.colorKey] || "var(--primary)"
      }));
    },
    consumptionModes() {
      return consumptionModes;
    },
    consumptionType() {
      return consumptionModes.find((mode) => mode.id === this.consumptionMode)?.type || 4;
    },
    topChartOption() {
      return createBarOption(dashboardSeries(this.top.labels, this.top.values), this.top.title || dashboardChartTitles[this.activeType], this.chartTheme);
    },
    consumptionChartOption() {
      return createBarOption(dashboardSeries(this.consumption.labels, this.consumption.values), this.consumptionTitle, this.chartTheme);
    },
    consumptionTitle() {
      return this.consumption.title || dashboardChartTitles[this.consumptionType] || "Daily Consumption";
    },
    successChartOption() {
      return createLineOption(dashboardSeries(this.success.labels, this.success.values), "Hourly Success Rate", this.chartTheme);
    },
    alarmChartOption() {
      const theme = {
        ...(this.chartTheme || {}),
        alarmColors: this.alarms.map((item) => item.color).filter(Boolean)
      };
      return createPieOption(
        dashboardSeries(
          this.alarms.map((item) => item.label),
          this.alarms.map((item) => item.value)
        ),
        "Abnormal Alarm",
        theme
      );
    }
  },
  created() {
    this.refreshDashboard();
  },
  mounted() {
    this.syncThemePalette();
    this.observeThemeChanges();
    this.refreshTimer = window.setInterval(() => this.loadDataset(this.activeType, false), 300000);
    this.visibilityHandler = () => {
      if (document.visibilityState === "visible") this.loadDataset(this.activeType, false);
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
  },
  beforeUnmount() {
    if (this.themeObserver) this.themeObserver.disconnect();
    if (this.countFrame) cancelAnimationFrame(this.countFrame);
    if (this.refreshTimer) window.clearInterval(this.refreshTimer);
    if (this.visibilityHandler) document.removeEventListener("visibilitychange", this.visibilityHandler);
  },
  methods: {
    async refreshDashboard() {
      await this.loadDataset(this.activeType);
    },
    async loadTopChart(type) {
      this.activeType = type;
      await this.loadDataset(type);
    },
    setConsumptionMode(mode) {
      if (this.consumptionMode === mode) return;
      this.consumptionMode = mode;
      this.consumption = mode === "monthly"
        ? this.toMonthlyConsumption(this.dailyConsumption)
        : this.dailyConsumption;
    },
    applyDataset(dataset) {
      this.panel = dataset.panel;
      this.animatePanel(dataset.panel);
      this.top = dataset.top;
      this.dailyConsumption = dataset.consumption;
      this.consumption = this.consumptionMode === "monthly"
        ? this.toMonthlyConsumption(this.dailyConsumption)
        : this.dailyConsumption;
      this.success = dataset.success;
      this.alarms = dataset.alarms;
    },
    async loadDataset(activeType, showLoading = true) {
      if (!showLoading && this.loading) return;
      const loadId = ++this.dashboardLoadId;
      // Paint the background-warmed dataset instantly (no spinner) if the OEM Hub
      // prefetched this OEM's dashboard, then refresh silently in the background.
      if (showLoading && !this.warmApplied) {
        const warm = this.oemStore.warmCache[this.oemStore.currentOemId];
        if (warm && warm.status === "ready" && warm.dataset) {
          this.applyDataset(warm.dataset);
          this.warmApplied = true;
          this.loading = false;
          this.loadDataset(activeType, false);
          return;
        }
      }
      if (showLoading) this.loading = true;
      try {
        const dataset = await fetchDashboardData({ activeType, consumptionType: 4 });
        if (loadId !== this.dashboardLoadId) return;
        this.applyDataset(dataset);
      } finally {
        if (showLoading && loadId === this.dashboardLoadId) this.loading = false;
      }
    },
    toMonthlyConsumption(daily) {
      const totals = new Map();
      daily.labels.forEach((label, index) => {
        const month = String(label || "").slice(0, 7) || "Unknown";
        totals.set(month, (totals.get(month) || 0) + Number(daily.values[index] || 0));
      });
      const labels = [...totals.keys()];
      const values = labels.map((label) => Number((totals.get(label) || 0).toFixed(2)));
      return {
        title: "Monthly Consumption",
        labels,
        values
      };
    },
    formatStatValue(card, value) {
      const num = Number(value || 0);
      if (card && card.key === "totalPurchaseMoney") {
        return num.toLocaleString("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      }
      if (card && (card.key === "totalAccountCount" || card.key === "totalPurchaseTimes")) {
        return Math.round(num).toLocaleString();
      }
      return num.toLocaleString(undefined, {
        maximumFractionDigits: 1
      });
    },
    formatNumber(value) {
      return Number(value || 0).toLocaleString(undefined, {
        maximumFractionDigits: 1
      });
    },
    animatePanel(targetPanel) {
      if (this.countFrame) cancelAnimationFrame(this.countFrame);
      const startPanel = { ...this.animatedPanel };
      const duration = 1100;
      const startAt = performance.now();
      const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);
      const step = (now) => {
        const progress = Math.min(1, (now - startAt) / duration);
        const eased = easeOutCubic(progress);
        for (const key of Object.keys(this.animatedPanel)) {
          const start = Number(startPanel[key] || 0);
          const end = Number(targetPanel[key] || 0);
          this.animatedPanel[key] = start + (end - start) * eased;
        }
        if (progress < 1) {
          this.countFrame = requestAnimationFrame(step);
          return;
        }
        this.animatedPanel = { ...targetPanel };
        this.countFrame = null;
      };
      this.countFrame = requestAnimationFrame(step);
    },
    syncThemePalette() {
      if (typeof window === "undefined" || typeof document === "undefined" || !document.documentElement) return;
      const styles = window.getComputedStyle(document.documentElement);
      const resolve = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
      this.chartTheme = {
        primary: resolve("--primary", "#059669"),
        primaryDeep: resolve("--primary-deep", "#047857"),
        primaryLight: resolve("--primary-light", "rgba(5, 150, 105, 0.12)"),
        success: resolve("--success", "#10b981"),
        warning: resolve("--warning", "#f59e0b"),
        danger: resolve("--danger", "#ef4444"),
        textMuted: resolve("--text-muted", "#64748b"),
        textFaint: resolve("--text-faint", "#94a3b8"),
        textInverse: resolve("--text-inverse", "#f8fafc"),
        border: resolve("--border-color", "rgba(148, 163, 184, 0.14)"),
        surface: resolve("--bg-card", "#ffffff"),
        tooltip: resolve("--bg-card", "#ffffff"),
        tooltipText: resolve("--text-strong", "#0f172a")
      };
    },
    observeThemeChanges() {
      if (typeof MutationObserver === "undefined" || typeof document === "undefined" || !document.documentElement) return;
      this.themeObserver = new MutationObserver(() => this.syncThemePalette());
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"]
      });
    },
    openAbnormalAlarmPage(params) {
      const label = String(params?.name || "").trim();
      const map = {
        "No Data Report": "noData",
        "Magnetic Interference": "magneticInterference",
        "Battery Low": "batteryLow",
        "Terminal Cover Open": "terminalCoverOpen",
        "Cover Open": "coverOpen",
        "Current Reverse": "currentReverse",
        "Current Unbalance": "currentUnbalance"
      };
      const alarm = map[label] || "";
      window.location.hash = `#/prepay-report/abnormal-alarm${alarm ? `?alarm=${encodeURIComponent(alarm)}` : ""}`;
    }
  }
};
</script>
