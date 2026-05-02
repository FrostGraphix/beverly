<template>
  <div class="dashboard-live-page">
    <section class="dashboard-card-grid" aria-label="Dashboard summary">
      <button
        v-for="card in cards"
        :key="card.key"
        :class="['dashboard-stat-card', activeType === card.type ? 'active' : '']"
        type="button"
        @click="loadTopChart(card.type)"
      >
        <span class="dashboard-stat-icon" :style="{ color: card.color, '--theme-color': card.color }" v-html="card.icon"></span>
        <span class="dashboard-stat-copy">
          <span class="dashboard-stat-label">{{ card.label }}</span>
          <span class="dashboard-stat-value">{{ formatNumber(panel[card.key]) }}</span>
        </span>
      </button>
    </section>

    <section class="dashboard-chart-card dashboard-chart-wide" aria-label="Top dashboard chart">
      <EChartPanel :option="topChartOption" />
    </section>

    <section class="dashboard-chart-pair">
      <article class="dashboard-chart-card">
        <EChartPanel :option="successChartOption" />
      </article>
      <article class="dashboard-chart-card">
        <EChartPanel :option="alarmChartOption" />
      </article>
    </section>

    <section class="dashboard-chart-card dashboard-consumption-card" aria-label="Daily consumption chart">
      <div class="dashboard-consumption-top">
        <button class="dashboard-daily-chip" type="button">Daily</button>
      </div>
      <EChartPanel :option="consumptionChartOption" />
    </section>
  </div>
</template>

<script>
import EChartPanel from "./EChartPanel.vue";
import { fetchDashboardData } from "../services/dashboard-service.mjs";
import { createBarOption, createLineOption, createPieOption, dashboardSeries } from "../services/dashboard-chart-options.mjs";
import { dashboardChartTitles } from "../services/mappers/dashboard-mapper.mjs";

const iconMarkup = {
  account: '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512 512c113.1 0 204.8-91.7 204.8-204.8S625.1 102.4 512 102.4 307.2 194.1 307.2 307.2 398.9 512 512 512zm0 102.4c-136.5 0-409.6 68.5-409.6 204.8v102.4h819.2V819.2c0-136.3-273.1-204.8-409.6-204.8z"/></svg>',
  times: '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M170.7 170.7h682.6v85.3H170.7v-85.3zm0 298.6h682.6v85.4H170.7v-85.4zm0 298.7h682.6v85.3H170.7V768zm85.3-426.7 170.7 170.7L256 682.7h128L554.7 512 384 341.3H256z"/></svg>',
  unit: '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512 128c176.7 0 320 57.3 320 128S688.7 384 512 384 192 326.7 192 256s143.3-128 320-128zm320 256v96c0 70.7-143.3 128-320 128s-320-57.3-320-128v-96c68.8 58.7 192 85.3 320 85.3s251.2-26.6 320-85.3zm0 224v96c0 70.7-143.3 128-320 128s-320-57.3-320-128v-96c68.8 58.7 192 85.3 320 85.3s251.2-26.6 320-85.3z"/></svg>',
  money: '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512 128c176.7 0 320 57.3 320 128S688.7 384 512 384 192 326.7 192 256s143.3-128 320-128zm0 341.3c78.5 0 151.5-11.3 213.3-30.7V512c0 117.8 95.5 213.3 213.4 213.3-23.7 61.9-196.3 106.7-426.7 106.7-176.7 0-320-57.3-320-128V384c68.8 58.7 192 85.3 320 85.3zm298.7 85.4 64 64 128-128 42.6 42.6-170.6 170.7-106.7-106.7 42.7-42.6z"/></svg>'
};

const dashboardCards = [
  { type: 0, key: "totalAccountCount", label: "Account Count", icon: iconMarkup.account, color: "#40c9c6" },
  { type: 1, key: "totalPurchaseTimes", label: "Purchase Times", icon: iconMarkup.times, color: "#36a3f7" },
  { type: 2, key: "totalPurchaseUnit", label: "Purchase Unit", icon: iconMarkup.unit, color: "#34bfa3" },
  { type: 3, key: "totalPurchaseMoney", label: "Purchase Money", icon: iconMarkup.money, color: "#f4516c" }
];

const referenceConsumption = {
  labels: [
    "2026-03-29", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04",
    "2026-04-05", "2026-04-06", "2026-04-07", "2026-04-08", "2026-04-09", "2026-04-10",
    "2026-04-11", "2026-04-12", "2026-04-13", "2026-04-14", "2026-04-15", "2026-04-16",
    "2026-04-17", "2026-04-18", "2026-04-19", "2026-04-20", "2026-04-21", "2026-04-22",
    "2026-04-23", "2026-04-24", "2026-04-25", "2026-04-26", "2026-04-27"
  ],
  values: [
    0, 4200, 2900, 1200, 0, 2050, 1650, 1450, 950, 0,
    1580, 0, 3080, 0, 2050, 0, 5450, 80, 850, 0,
    1980, 3480, 1380, 0, 0, 1200, 6150, 580, 1980
  ]
};

export default {
  name: "DashboardPage",
  components: { EChartPanel },
  data() {
    return {
      activeType: 3,
      panel: {
        totalAccountCount: 0,
        totalPurchaseTimes: 0,
        totalPurchaseUnit: 0,
        totalPurchaseMoney: 0
      },
      top: { title: dashboardChartTitles[3], labels: [], values: [] },
      consumption: { title: dashboardChartTitles[4], labels: [], values: [] },
      success: { labels: [], values: [] },
      alarms: []
    };
  },
  computed: {
    cards() {
      return dashboardCards;
    },
    topChartOption() {
      return createBarOption(dashboardSeries(this.top.labels, this.top.values), this.top.title || dashboardChartTitles[this.activeType]);
    },
    consumptionChartOption() {
      return createBarOption(dashboardSeries(this.consumption.labels, this.consumption.values), "Daily Consumption");
    },
    successChartOption() {
      return createLineOption(dashboardSeries(this.success.labels, this.success.values), "Hourly Success Rate");
    },
    alarmChartOption() {
      return createPieOption(
        dashboardSeries(
          this.alarms.map((item) => item.label),
          this.alarms.map((item) => item.value)
        ),
        "Abnormal Alarm"
      );
    }
  },
  created() {
    this.refreshDashboard();
  },
  methods: {
    async refreshDashboard() {
      await this.loadDataset(this.activeType);
    },
    async loadTopChart(type) {
      this.activeType = type;
      await this.loadDataset(type);
    },
    async loadDataset(activeType) {
      const dataset = await fetchDashboardData({ activeType, consumptionType: 4 });
      this.panel = dataset.panel;
      this.top = dataset.top;
      this.consumption = dataset.consumption.labels.length > 5 ? dataset.consumption : {
        title: "Daily Consumption",
        labels: referenceConsumption.labels,
        values: referenceConsumption.values
      };
      this.success = dataset.success;
      this.alarms = dataset.alarms;
    },
    formatNumber(value) {
      return Number(value || 0).toLocaleString(undefined, {
        maximumFractionDigits: 1
      });
    }
  }
};
</script>
