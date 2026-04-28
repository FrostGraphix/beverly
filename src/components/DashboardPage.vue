<template>
  <div>
    <section class="panel-group" aria-label="Dashboard summary">
      <article v-for="panel in panels" :key="panel.label" class="card-panel">
        <div :class="['card-panel-icon-wrapper', panel.color]">
          <span class="svg-icon card-panel-icon">{{ panel.icon }}</span>
        </div>
        <div class="card-panel-description">
          <div class="card-panel-text">{{ panel.label }}</div>
          <div class="card-panel-num">{{ Number(panel.value).toLocaleString() }}</div>
        </div>
      </article>
    </section>
    <section class="chart-grid">
      <div class="chart-wrapper wide">
        <div class="chart-tabs">
          <button :class="{ active: activeChart === 3 }" type="button" @click="setChart(3)">Daily</button>
          <button :class="{ active: activeChart === 5 }" type="button" @click="setChart(5)">Monthly</button>
        </div>
        <h2 class="chart-title">{{ chart.title }}</h2>
        <div class="chart-shell chart-shell-rich" role="img" aria-label="Purchase money chart">
          <span v-for="(label, index) in purchaseAxis" :key="label" class="y-label" :style="{ top: `${index * 20}%` }">{{ label }}</span>
          <span v-for="top in [0,20,40,60,80]" :key="top" class="gridline" :style="{ top: `${top}%` }"></span>
          <div class="plot rich-plot">
            <span
              v-for="(point, index) in purchaseSeries"
              :key="`purchase-${index}`"
              class="bar rich-bar"
              :style="barStyle(point, purchaseMax, purchaseSeries.length, index)"
            ></span>
            <span
              v-for="(label, index) in purchaseLabels"
              :key="`purchase-label-${index}`"
              class="x-label"
              :style="labelStyle(purchaseSeries.length, index)"
            >{{ label }}</span>
          </div>
        </div>
      </div>
      <div class="chart-wrapper secondary">
        <h2 class="chart-title">Hourly Success Rate</h2>
        <div class="line-chart rich-line-chart">
          <svg viewBox="0 0 520 260">
            <path d="M40 220 L40 24" class="axis-path"></path>
            <path d="M40 220 L500 220" class="axis-path"></path>
            <path v-for="grid in [40,90,140,190]" :key="`grid-${grid}`" :d="`M40 ${grid} L500 ${grid}`" class="grid-path"></path>
            <polyline :points="successPolyline" class="line-path"></polyline>
            <circle v-for="(point, index) in successPoints" :key="`point-${index}`" :cx="point.x" :cy="point.y" r="2.4" class="line-point"></circle>
            <text v-for="point in successPointLabels" :key="point.key" :x="point.x - 12" y="244" class="axis-label">{{ point.label }}</text>
            <text x="14" y="28" class="axis-label">100</text>
            <text x="20" y="82" class="axis-label">80</text>
            <text x="20" y="132" class="axis-label">60</text>
            <text x="20" y="182" class="axis-label">40</text>
            <text x="20" y="224" class="axis-label">20</text>
          </svg>
        </div>
      </div>
      <div class="chart-wrapper secondary pie-chart rich-pie-chart">
        <h2 class="chart-title">Abnormal Alarm</h2>
        <svg viewBox="0 0 520 260">
          <g transform="translate(250 122)">
            <path v-for="segment in alarmPaths" :key="segment.label" :d="segment.path" :fill="segment.color"></path>
            <circle r="18" fill="#fff"></circle>
          </g>
          <g v-for="label in alarmCallouts" :key="label.text">
            <path :d="label.path" :stroke="label.color" fill="none"></path>
            <text :x="label.textX" :y="label.textY" :fill="label.color" class="pie-label">{{ label.text }}</text>
          </g>
        </svg>
        <div class="pie-legend">
          <span v-for="item in alarmLegend" :key="item.label" class="legend-item"><i :style="{ background: item.color }"></i>{{ item.label }}</span>
        </div>
      </div>
      <div class="chart-wrapper secondary wide">
        <div class="chart-header-inline">
          <button class="inline-chip active" type="button">Daily</button>
          <a class="more-link" href="#/dashboard">more &gt;</a>
        </div>
        <h2 class="chart-title">Daily Consumption</h2>
        <div class="chart-shell chart-shell-rich" role="img" aria-label="Daily consumption chart">
          <span v-for="(label, index) in consumptionAxis" :key="`daily-${label}`" class="y-label" :style="{ top: `${index * 20}%` }">{{ label }}</span>
          <span v-for="top in [0,20,40,60,80]" :key="`daily-grid-${top}`" class="gridline" :style="{ top: `${top}%` }"></span>
          <div class="plot rich-plot">
            <span
              v-for="(point, index) in consumptionSeries"
              :key="`consumption-${index}`"
              class="bar rich-bar"
              :style="barStyle(point, consumptionMax, consumptionSeries.length, index)"
            ></span>
            <span
              v-for="(label, index) in consumptionLabels"
              :key="`consumption-label-${index}`"
              class="x-label"
              :style="labelStyle(consumptionSeries.length, index)"
            >{{ label }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { getApi, postApi } from "../services/api";
import { axisLabels, buildAlarmLegendFromReadings, buildConsumptionRowsFromReadings, buildHourlySuccessSeries, buildPurchaseRowsFromPayments } from "../services/live-report-adapters.mjs";
import { normalizeChartPayload, normalizeCollection, normalizeDashboardMetrics } from "../services/response-normalizers.mjs";

function polarX(radius, angle) {
  return Math.cos(angle) * radius;
}

function polarY(radius, angle) {
  return Math.sin(angle) * radius;
}

export default {
  name: "DashboardPage",
  data() {
    return {
      activeChart: 3,
      panel: {
        totalAccountCount: 0,
        totalPurchaseTimes: 0,
        totalPurchaseUnit: 0,
        totalPurchaseMoney: 0
      },
      chart: { title: "Purchase Money" },
      purchaseSeries: [],
      consumptionSeries: [],
      purchaseLabels: [],
      consumptionLabels: [],
      purchaseAxis: axisLabels(1),
      consumptionAxis: axisLabels(1),
      successValues: [],
      successLabels: [],
      alarmLegend: []
    };
  },
  computed: {
    panels() {
      return [
        { label: "Account Count", value: this.panel.totalAccountCount, icon: "◉", color: "icon-people" },
        { label: "Purchase Times", value: this.panel.totalPurchaseTimes, icon: "⌛", color: "icon-message" },
        { label: "Purchase Unit", value: this.panel.totalPurchaseUnit, icon: "▰", color: "icon-money" },
        { label: "Purchase Money", value: this.panel.totalPurchaseMoney, icon: "◎", color: "icon-shopping" }
      ];
    },
    purchaseMax() {
      return Math.max(1, ...this.purchaseSeries);
    },
    consumptionMax() {
      return Math.max(1, ...this.consumptionSeries);
    },
    successPoints() {
      if (this.successValues.length < 2) return [];
      return this.successValues.map((value, index) => ({
        x: 40 + index * (460 / (this.successValues.length - 1)),
        y: 220 - (value / 100) * 180
      }));
    },
    successPolyline() {
      return this.successPoints.map((point) => `${point.x},${point.y}`).join(" ");
    },
    successPointLabels() {
      return this.successPoints.map((point, index) => ({
        ...point,
        key: `success-label-${index}`,
        label: this.successLabels[index] || ""
      }));
    },
    alarmPaths() {
      let angle = -Math.PI / 2;
      const total = this.alarmLegend.reduce((sum, item) => sum + item.value, 0);
      if (!total) return [];
      return this.alarmLegend.map((item) => {
        const sweep = (item.value / total) * Math.PI * 2;
        const startX = polarX(92, angle);
        const startY = polarY(92, angle);
        const nextAngle = angle + sweep;
        const endX = polarX(92, nextAngle);
        const endY = polarY(92, nextAngle);
        const large = sweep > Math.PI ? 1 : 0;
        const path = `M0 0 L${startX} ${startY} A92 92 0 ${large} 1 ${endX} ${endY} Z`;
        angle = nextAngle;
        return { label: item.label, color: item.color, path, startAngle: angle - sweep, endAngle: nextAngle };
      });
    },
    alarmCallouts() {
      return this.alarmPaths.map((segment, index) => {
        const mid = (segment.startAngle + segment.endAngle) / 2;
        const startX = 250 + polarX(92, mid);
        const startY = 122 + polarY(92, mid);
        const breakX = 250 + polarX(112, mid);
        const breakY = 122 + polarY(112, mid);
        const rightSide = Math.cos(mid) >= 0;
        const textX = rightSide ? breakX + 16 : breakX - 104;
        const textY = breakY + (index % 2 === 0 ? -2 : 8);
        return {
          text: segment.label,
          color: segment.color,
          path: `M${startX} ${startY} L${breakX} ${breakY} L${rightSide ? breakX + 12 : breakX - 12} ${breakY}`,
          textX,
          textY
        };
      });
    }
  },
  async created() {
    await this.load();
  },
  methods: {
    barStyle(value, max, count, index) {
      const width = Math.max(8, Math.floor(420 / count));
      const left = `${(index / count) * 100 + 1.5}%`;
      return {
        left,
        width: `${width}px`,
        height: `${Math.max(4, (value / max) * 100)}%`
      };
    },
    labelStyle(count, index) {
      return {
        left: `${(index / count) * 100 + 1.5}%`
      };
    },
    async load() {
      const panel = await postApi("/api/dashboard/readPanelGroup");
      const chart = await postApi("/api/dashboard/readLineChart", { type: this.activeChart });
      const hourly = await getApi("/api/DailyDataMeter/readHourly", {
        offset: 0,
        pageLimit: 100,
        FROM: "2026-01-10T00:00:00.000Z",
        TO: "2026-01-17T00:00:00.000Z",
        SITE_ID: "KYAKALE"
      });
      const payments = await getApi("/api/token/creditTokenRecord/readMore", {
        FROM: "2026-01-01T00:00:00.000Z",
        TO: "2026-01-17T00:00:00.000Z",
        SITE_ID: "KYAKALE"
      });
      const chartPayload = normalizeChartPayload(chart, this.chart.title);
      const readings = normalizeCollection(hourly).rows;
      const purchaseRows = buildPurchaseRowsFromPayments(normalizeCollection(payments).rows);
      const consumptionRows = buildConsumptionRowsFromReadings(readings);
      const successRows = buildHourlySuccessSeries(readings);
      this.panel = normalizeDashboardMetrics(panel);
      this.chart = chartPayload.yData.length ? chartPayload : { title: chartPayload.title, xData: purchaseRows.map((row) => row.collectionDate), yData: purchaseRows.map((row) => row.amount) };
      this.purchaseSeries = this.chart.yData;
      this.purchaseLabels = this.chart.xData;
      this.purchaseAxis = axisLabels(this.purchaseMax);
      this.consumptionSeries = consumptionRows.map((row) => row.consumption);
      this.consumptionLabels = consumptionRows.map((row) => row.collectionDate);
      this.consumptionAxis = axisLabels(this.consumptionMax);
      this.successValues = successRows.map((row) => row.value);
      this.successLabels = successRows.map((row) => row.label);
      this.alarmLegend = buildAlarmLegendFromReadings(readings);
    },
    async setChart(type) {
      this.activeChart = type;
      await this.load();
    }
  }
};
</script>
