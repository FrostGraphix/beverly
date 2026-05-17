<template>
  <div class="chart-card">
    <div class="chart-card-header">
      <div class="chart-card-title-group">
        <span class="chart-card-title">{{ chartTitle }}</span>
        <span v-if="dateRange" class="chart-date-range">{{ dateRange }}</span>
      </div>
      <div class="chart-legend">
        <template v-if="mode === 'sales'">
          <span class="legend-dot" style="background:#10b981"></span><span>Units Sold</span>
          <span class="legend-dot" style="background:#34bfa3"></span><span>Revenue (N)</span>
        </template>
        <template v-else>
          <span class="legend-dot" style="background:#10b981"></span><span>Consumed kWh</span>
        </template>
      </div>
    </div>
    <div v-if="loading" class="chart-loading">
      <div class="chart-spinner"></div>
      <span>{{ mode === 'sales' ? 'Loading sales data...' : 'Loading consumption data...' }}</span>
    </div>
    <div v-else-if="!data.length" class="chart-empty">{{ emptyText }}</div>
    <div v-else ref="chart" class="chart-body"></div>
  </div>
</template>

<script>
import { loadECharts } from "../../services/echarts-loader.mjs";

const BREAKDOWN_COLORS = ["#10b981", "#34bfa3", "#ffb822", "#f4516c", "#7c4dff", "#40c9c6", "#ff6b6b"];

export default {
  name: "StationBarChart",
  props: {
    data: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    dateRange: { type: String, default: "" },
    mode: { type: String, default: "sales" },
  },
  computed: {
    isSingleSalesStation() {
      return this.mode === "sales" && this.data.length === 1 && this.data[0]?.tariffBreakdown?.length > 0;
    },
    isSingleConsumptionStation() {
      return this.mode === "consumption" && this.data.length === 1 && this.data[0]?.meterBreakdown?.length > 0;
    },
    chartTitle() {
      if (this.isSingleSalesStation) return `${this.data[0].station} - Sales by Tariff`;
      if (this.isSingleConsumptionStation) return `${this.data[0].station} - Consumption by Meter`;
      return this.mode === "sales" ? "Station Sales" : "Station Consumption";
    },
    emptyText() {
      return this.mode === "sales"
        ? "No station sales for this period"
        : "No station consumption for this period";
    },
  },
  watch: {
    data: { handler: "renderChart", deep: true },
    mode() { this.renderChart(); },
    loading(value) {
      if (!value && this.data.length) this.$nextTick(this.renderChart);
    },
  },
  mounted() {
    this._resizeHandler = () => {
      if (this._echartInstance) this._echartInstance.resize();
    };
    window.addEventListener("resize", this._resizeHandler);
    this.renderChart();
  },
  beforeUnmount() {
    if (this._resizeHandler) window.removeEventListener("resize", this._resizeHandler);
    if (this._echartInstance) {
      this._echartInstance.dispose();
      this._echartInstance = null;
    }
  },
  methods: {
    async renderChart() {
      await this.$nextTick();
      if (!this.data.length || !this.$refs.chart) return;

      let echarts;
      try {
        echarts = await loadECharts();
      } catch (error) {
        console.error("[StationBarChart]", error);
        return;
      }

      if (this._echartInstance) {
        this._echartInstance.dispose();
        this._echartInstance = null;
      }
      if (!this.$refs.chart) return;

      if (this.isSingleSalesStation) {
        this.renderSalesTariffBreakdown(echarts, this.data[0]);
        return;
      }

      if (this.isSingleConsumptionStation) {
        this.renderConsumptionMeterBreakdown(echarts, this.data[0]);
        return;
      }

      if (this.mode === "sales") this.renderSalesComparison(echarts);
      else this.renderConsumptionComparison(echarts);
    },
    renderSalesTariffBreakdown(echarts, stationData) {
      const breakdown = stationData.tariffBreakdown || [];
      const tariffs = breakdown.map((item) => item.tariff);
      const soldSeries = breakdown.map((item) => parseFloat((item.totalKwh || 0).toFixed(1)));
      const revenueSeries = breakdown.map((item) => parseFloat(((item.totalRevenue || 0) / 1000).toFixed(1)));

      this._echartInstance = echarts.init(this.$refs.chart);
      this._echartInstance.setOption({
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params) => {
            const tariff = params[0].axisValue;
            const sold = params.find((item) => item.seriesName === "Units Sold")?.value ?? 0;
            const revenue = params.find((item) => item.seriesName === "Revenue")?.value ?? 0;
            return `<b>${tariff}</b><br/>Units Sold: ${sold.toLocaleString()} kWh<br/>Revenue: N${(revenue * 1000).toLocaleString()}`;
          },
        },
        legend: { show: false },
        grid: { left: 60, right: 16, top: 12, bottom: 32 },
        xAxis: {
          type: "category",
          data: tariffs,
          axisLabel: { fontSize: 11, color: "#9ca3af" },
          axisLine: { lineStyle: { color: "#e5e7eb" } },
        },
        yAxis: [
          { type: "value", name: "kWh", nameTextStyle: { color: "#9ca3af", fontSize: 10 }, axisLabel: { fontSize: 10, color: "#9ca3af" }, splitLine: { lineStyle: { color: "#f3f4f6" } } },
          { type: "value", name: "NK", nameTextStyle: { color: "#9ca3af", fontSize: 10 }, axisLabel: { fontSize: 10, color: "#9ca3af" }, splitLine: { show: false } },
        ],
        series: [
          {
            name: "Units Sold",
            type: "bar",
            yAxisIndex: 0,
            data: soldSeries,
            barMaxWidth: 40,
            itemStyle: {
              color: (params) => {
                const color = BREAKDOWN_COLORS[params.dataIndex % BREAKDOWN_COLORS.length];
                return {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [{ offset: 0, color }, { offset: 1, color: `${color}20` }],
                };
              },
              borderRadius: [4, 4, 0, 0],
            },
          },
          {
            name: "Revenue",
            type: "bar",
            yAxisIndex: 1,
            data: revenueSeries,
            barMaxWidth: 40,
            itemStyle: {
              color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#34bfa380" }, { offset: 1, color: "#34bfa310" }] },
              borderRadius: [4, 4, 0, 0],
            },
          },
        ],
      });
    },
    renderSalesComparison(echarts) {
      const stations = this.data.map((item) => item.station);
      const soldSeries = this.data.map((item) => parseFloat((item.totalKwh || 0).toFixed(1)));
      const revenueSeries = this.data.map((item) => parseFloat(((item.totalRevenue || 0) / 1000).toFixed(1)));

      this._echartInstance = echarts.init(this.$refs.chart);
      this._echartInstance.setOption({
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params) => {
            const station = params[0].axisValue;
            const sold = params.find((item) => item.seriesName === "Units Sold")?.value ?? 0;
            const revenue = params.find((item) => item.seriesName === "Revenue")?.value ?? 0;
            return `<b>${station}</b><br/>Units Sold: ${sold.toLocaleString()} kWh<br/>Revenue: N${(revenue * 1000).toLocaleString()}`;
          },
        },
        legend: { show: false },
        grid: { left: 60, right: 16, top: 12, bottom: 32 },
        xAxis: {
          type: "category",
          data: stations,
          axisLabel: { fontSize: 11, color: "#9ca3af" },
          axisLine: { lineStyle: { color: "#e5e7eb" } },
        },
        yAxis: [
          { type: "value", name: "kWh", nameTextStyle: { color: "#9ca3af", fontSize: 10 }, axisLabel: { fontSize: 10, color: "#9ca3af" }, splitLine: { lineStyle: { color: "#f3f4f6" } } },
          { type: "value", name: "NK", nameTextStyle: { color: "#9ca3af", fontSize: 10 }, axisLabel: { fontSize: 10, color: "#9ca3af" }, splitLine: { show: false } },
        ],
        series: [
          {
            name: "Units Sold",
            type: "bar",
            yAxisIndex: 0,
            data: soldSeries,
            barMaxWidth: 36,
            itemStyle: {
              color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#10b981" }, { offset: 1, color: "rgba(16, 185, 129, 0.13)" }] },
              borderRadius: [4, 4, 0, 0],
            },
          },
          {
            name: "Revenue",
            type: "bar",
            yAxisIndex: 1,
            data: revenueSeries,
            barMaxWidth: 36,
            itemStyle: {
              color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#34bfa3" }, { offset: 1, color: "#34bfa320" }] },
              borderRadius: [4, 4, 0, 0],
            },
          },
        ],
      });
    },
    renderConsumptionComparison(echarts) {
      const stations = this.data.map((item) => item.station);
      const consumedSeries = this.data.map((item) => parseFloat((item.totalKwh || 0).toFixed(1)));

      this._echartInstance = echarts.init(this.$refs.chart);
      this._echartInstance.setOption({
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params) => {
            const station = params[0].axisValue;
            const consumed = params[0]?.value ?? 0;
            return `<b>${station}</b><br/>Consumed: ${consumed.toLocaleString()} kWh`;
          },
        },
        grid: { left: 60, right: 16, top: 12, bottom: 32 },
        xAxis: {
          type: "category",
          data: stations,
          axisLabel: { fontSize: 11, color: "#9ca3af" },
          axisLine: { lineStyle: { color: "#e5e7eb" } },
        },
        yAxis: [
          { type: "value", name: "kWh", nameTextStyle: { color: "#9ca3af", fontSize: 10 }, axisLabel: { fontSize: 10, color: "#9ca3af" }, splitLine: { lineStyle: { color: "#f3f4f6" } } },
        ],
        series: [
          {
            name: "Consumed",
            type: "bar",
            data: consumedSeries,
            barMaxWidth: 38,
            itemStyle: {
              color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#10b981" }, { offset: 1, color: "rgba(16, 185, 129, 0.13)" }] },
              borderRadius: [4, 4, 0, 0],
            },
          },
        ],
      });
    },
    renderConsumptionMeterBreakdown(echarts, stationData) {
      const breakdown = (stationData.meterBreakdown || []).slice(0, 12);
      const meterIds = breakdown.map((item) => item.meterId);
      const totals = breakdown.map((item) => parseFloat((item.totalKwh || 0).toFixed(1)));

      this._echartInstance = echarts.init(this.$refs.chart);
      this._echartInstance.setOption({
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params) => {
            const meterId = params[0].axisValue;
            const consumed = params[0]?.value ?? 0;
            return `<b>${meterId}</b><br/>Consumed: ${consumed.toLocaleString()} kWh`;
          },
        },
        grid: { left: 60, right: 16, top: 12, bottom: 48 },
        xAxis: {
          type: "category",
          data: meterIds,
          axisLabel: { fontSize: 10, color: "#9ca3af", rotate: 25 },
          axisLine: { lineStyle: { color: "#e5e7eb" } },
        },
        yAxis: [
          { type: "value", name: "kWh", nameTextStyle: { color: "#9ca3af", fontSize: 10 }, axisLabel: { fontSize: 10, color: "#9ca3af" }, splitLine: { lineStyle: { color: "#f3f4f6" } } },
        ],
        series: [
          {
            name: "Consumed",
            type: "bar",
            data: totals,
            barMaxWidth: 34,
            itemStyle: {
              color: (params) => {
                const color = BREAKDOWN_COLORS[params.dataIndex % BREAKDOWN_COLORS.length];
                return {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [{ offset: 0, color }, { offset: 1, color: `${color}20` }],
                };
              },
              borderRadius: [4, 4, 0, 0],
            },
          },
        ],
      });
    },
  },
};
</script>

<style scoped>
.chart-card { background: var(--bg-card); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.chart-card-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.chart-card-title-group { display: flex; flex-direction: column; gap: 2px; }
.chart-card-title { font-size: 13px; font-weight: 700; color: var(--text-strong); }
.chart-date-range { font-size: 10px; color: var(--text-muted); font-weight: 400; }
.chart-legend { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--text-muted); }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.chart-body { height: 260px; }
.chart-loading, .chart-empty { height: 260px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-muted); font-size: 12px; }
.chart-spinner { width: 28px; height: 28px; border: 3px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
