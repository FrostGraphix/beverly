<template>
  <div class="chart-card">
    <div class="chart-card-header">
      <div class="chart-card-title-group">
        <span class="chart-card-title">{{ mode === 'sales' ? `Sales Trend - ${periodLabel}` : `Consumption Trend - ${periodLabel}` }}</span>
        <span v-if="dateRange" class="chart-date-range">{{ dateRange }}</span>
      </div>
      <div class="chart-legend">
        <span class="legend-dot" :style="{ background: mode === 'sales' && metric === 'revenue' ? '#34bfa3' : '#36a3f7' }"></span>
        <span>{{ legendText }}</span>
      </div>
    </div>

    <div v-if="mode === 'sales'" class="chart-metric-toggle">
      <button :class="['metric-btn', metric === 'kwh' ? 'metric-btn--active' : '']" @click="metric = 'kwh'">Units</button>
      <button :class="['metric-btn', metric === 'revenue' ? 'metric-btn--active' : '']" @click="metric = 'revenue'">Revenue</button>
      <button :class="['metric-btn', metric === 'both' ? 'metric-btn--active' : '']" @click="metric = 'both'">Both</button>
    </div>

    <div v-if="loading" class="chart-loading">
      <div class="chart-spinner"></div>
      <span>{{ mode === 'sales' ? 'Loading sales trend...' : 'Loading consumption trend...' }}</span>
    </div>
    <div v-else-if="!series.labels.length" class="chart-empty">{{ mode === 'sales' ? 'No sales data for this period' : 'No consumption data for this period' }}</div>
    <div v-else ref="chart" class="chart-body"></div>
  </div>
</template>

<script>
import { loadECharts } from "../../services/echarts-loader.mjs";

export default {
  name: "TemporalLineChart",
  props: {
    series: { type: Object, default: () => ({ labels: [], kwhSeries: [], revenueSeries: [] }) },
    granularity: { type: String, default: "daily" },
    periodLabel: { type: String, default: "Period" },
    loading: { type: Boolean, default: false },
    dateRange: { type: String, default: "" },
    mode: { type: String, default: "sales" },
  },
  data() {
    return { metric: "kwh" };
  },
  computed: {
    legendText() {
      if (this.mode !== "sales") return "Consumed kWh";
      if (this.metric === "kwh") return "Units Sold";
      if (this.metric === "revenue") return "Revenue (N)";
      return "Units Sold + Revenue";
    },
  },
  watch: {
    series: { handler: "renderChart", deep: true },
    metric() { this.renderChart(); },
    mode() { this.renderChart(); },
    loading(value) {
      if (!value && this.series.labels.length) this.$nextTick(this.renderChart);
    },
  },
  mounted() {
    this._resizeHandler = () => {
      if (this._echartInstance) this._echartInstance.resize();
    };
    window.addEventListener("resize", this._resizeHandler);
    this.renderChart();
  },
  beforeDestroy() {
    if (this._resizeHandler) window.removeEventListener("resize", this._resizeHandler);
    if (this._echartInstance) {
      this._echartInstance.dispose();
      this._echartInstance = null;
    }
  },
  methods: {
    async renderChart() {
      await this.$nextTick();
      if (!this.series.labels.length || !this.$refs.chart) return;

      let echarts;
      try {
        echarts = await loadECharts();
      } catch (error) {
        console.error("[TemporalLineChart]", error);
        return;
      }

      if (this._echartInstance) {
        this._echartInstance.dispose();
        this._echartInstance = null;
      }
      if (!this.$refs.chart) return;

      if (this.mode === "sales") this.renderSalesChart(echarts);
      else this.renderConsumptionChart(echarts);
    },
    renderSalesChart(echarts) {
      const { labels, kwhSeries, revenueSeries } = this.series;
      const showKwh = this.metric === "kwh" || this.metric === "both";
      const showRevenue = this.metric === "revenue" || this.metric === "both";
      const yAxis = this.metric === "both"
        ? [
            { type: "value", name: "kWh", axisLabel: { fontSize: 10, color: "#9ca3af" }, splitLine: { lineStyle: { color: "#f3f4f6" } } },
            { type: "value", name: "N", axisLabel: { fontSize: 10, color: "#9ca3af" }, splitLine: { show: false } },
          ]
        : [{ type: "value", axisLabel: { fontSize: 10, color: "#9ca3af" }, splitLine: { lineStyle: { color: "#f3f4f6" } } }];

      const seriesDef = [];
      if (showKwh) {
        seriesDef.push({
          name: "Units Sold",
          type: "line",
          smooth: true,
          yAxisIndex: 0,
          data: kwhSeries,
          lineStyle: { color: "#36a3f7", width: 2.5 },
          itemStyle: { color: "#36a3f7" },
          areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#36a3f740" }, { offset: 1, color: "#36a3f700" }] } },
          symbol: "circle",
          symbolSize: 5,
        });
      }
      if (showRevenue) {
        seriesDef.push({
          name: "Revenue",
          type: "line",
          smooth: true,
          yAxisIndex: this.metric === "both" ? 1 : 0,
          data: revenueSeries,
          lineStyle: { color: "#34bfa3", width: 2.5, type: "dashed" },
          itemStyle: { color: "#34bfa3" },
          symbol: "circle",
          symbolSize: 5,
        });
      }

      this._echartInstance = echarts.init(this.$refs.chart);
      this._echartInstance.setOption({
        tooltip: {
          trigger: "axis",
          formatter: (params) => {
            let html = `<b>${params[0].axisValue}</b><br/>`;
            params.forEach((item) => {
              const isRevenue = item.seriesName === "Revenue";
              html += `${item.marker}${item.seriesName}: ${isRevenue ? `N${item.value.toLocaleString()}` : `${item.value.toLocaleString()} kWh`}<br/>`;
            });
            return html;
          },
        },
        legend: { show: this.metric === "both", bottom: 0, textStyle: { fontSize: 11 } },
        grid: { left: 50, right: this.metric === "both" ? 50 : 16, top: 12, bottom: this.metric === "both" ? 30 : 20 },
        xAxis: {
          type: "category",
          data: labels,
          boundaryGap: false,
          axisLabel: { fontSize: 10, color: "#9ca3af", rotate: labels.length > 12 ? 30 : 0 },
          axisLine: { lineStyle: { color: "#e5e7eb" } },
        },
        yAxis,
        series: seriesDef,
      });
    },
    renderConsumptionChart(echarts) {
      const { labels, kwhSeries } = this.series;
      this._echartInstance = echarts.init(this.$refs.chart);
      this._echartInstance.setOption({
        tooltip: {
          trigger: "axis",
          formatter: (params) => `<b>${params[0].axisValue}</b><br/>Consumed: ${params[0].value.toLocaleString()} kWh`,
        },
        grid: { left: 50, right: 16, top: 12, bottom: 20 },
        xAxis: {
          type: "category",
          data: labels,
          boundaryGap: false,
          axisLabel: { fontSize: 10, color: "#9ca3af", rotate: labels.length > 12 ? 30 : 0 },
          axisLine: { lineStyle: { color: "#e5e7eb" } },
        },
        yAxis: [{ type: "value", axisLabel: { fontSize: 10, color: "#9ca3af" }, splitLine: { lineStyle: { color: "#f3f4f6" } } }],
        series: [
          {
            name: "Consumed",
            type: "line",
            smooth: true,
            data: kwhSeries,
            lineStyle: { color: "#36a3f7", width: 2.5 },
            itemStyle: { color: "#36a3f7" },
            areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#36a3f740" }, { offset: 1, color: "#36a3f700" }] } },
            symbol: "circle",
            symbolSize: 5,
          },
        ],
      });
    },
  },
};
</script>

<style scoped>
.chart-card { background: var(--bg-card); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.chart-card-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.chart-card-title-group { display: flex; flex-direction: column; gap: 2px; }
.chart-card-title { font-size: 13px; font-weight: 700; color: var(--text-strong); }
.chart-date-range { font-size: 10px; color: var(--text-muted); font-weight: 400; }
.chart-metric-toggle { display: flex; gap: 4px; }
.chart-legend { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.metric-btn { padding: 3px 10px; border-radius: 4px; border: 1px solid var(--border-color); background: transparent; font-size: 11px; cursor: pointer; color: var(--text-muted); font-family: var(--font-family); transition: all 0.15s; }
.metric-btn--active { background: var(--primary-light); border-color: var(--primary); color: var(--primary); font-weight: 600; }
.chart-body { height: 240px; }
.chart-loading, .chart-empty { height: 240px; display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--text-muted); font-size: 12px; flex-direction: column; }
.chart-spinner { width: 24px; height: 24px; border: 3px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
