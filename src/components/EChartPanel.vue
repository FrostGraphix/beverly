<template>
  <div class="echart-panel dashboard-svg-chart">
    <div ref="chart" class="echart-canvas" role="img" :aria-label="title"></div>
  </div>
</template>

<script>
import { loadECharts } from "../services/echarts-loader.mjs";

export default {
  name: "EChartPanel",
  emits: ["chart-click"],
  props: {
    option: { type: Object, required: true }
  },
  computed: {
    title() {
      return this.option?.title?.text || this.option?.series?.[0]?.name || "Chart";
    }
  },
  watch: {
    option: {
      deep: true,
      handler() {
        this.renderChart();
      }
    }
  },
  mounted() {
    this.renderChart();
    this.resizeHandler = () => {
      if (this.chart) this.chart.resize();
    };
    window.addEventListener("resize", this.resizeHandler, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.resizeHandler);
      this.resizeObserver.observe(this.$refs.chart);
    }
  },
  beforeUnmount() {
    window.removeEventListener("resize", this.resizeHandler);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    if (this.animationTimer) clearTimeout(this.animationTimer);
    if (this.chart) {
      this.chart.dispose();
      this.chart = null;
    }
  },
  methods: {
    renderChart() {
      this.$nextTick(async () => {
        if (!this.$refs.chart) return;
        if (!this.echarts) this.echarts = await loadECharts();
        if (!this.$refs.chart) return;
        if (!this.chart) this.chart = this.echarts.init(this.$refs.chart);
        this.chart.off("click");
        this.chart.on("click", (params) => this.$emit("chart-click", params));
        if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
        if (this.animationTimer) clearTimeout(this.animationTimer);
        const option = this.option || {};
        if (this.shouldReplayChart(option)) {
          const baseline = this.createChartBaseline(option);
          const finalOption = this.createChartRiseOption(option);
          this.chart.setOption(baseline, true);
          this.chart.resize();
          this.animationFrame = requestAnimationFrame(() => {
            this.animationTimer = setTimeout(() => {
              if (!this.chart) return;
              this.chart.setOption(finalOption, false);
              this.animationTimer = null;
            }, 48);
            this.animationFrame = null;
          });
        } else {
          this.chart.setOption(option, true);
        }
        this.chart.resize();
      });
    },
    shouldRiseBars(option) {
      return Array.isArray(option.series) && option.series.some((series) => series?.type === "bar" && Array.isArray(series.data) && series.data.length);
    },
    shouldReplayChart(option) {
      return Array.isArray(option.series) && option.series.some((series) => {
        return ["bar", "line", "pie"].includes(series?.type) && Array.isArray(series.data) && series.data.length;
      });
    },
    createBarBaseline(option) {
      return this.createChartBaseline(option);
    },
    createChartBaseline(option) {
      const maxValue = Math.max(
        0,
        ...option.series.flatMap((series) => Array.isArray(series.data) ? series.data.map((value) => this.datumValue(value)) : [])
      );
      const baseline = {
        ...option,
        animation: false,
        series: option.series.map((series) => {
          if (!["bar", "line", "pie"].includes(series?.type) || !Array.isArray(series.data)) return series;
          return {
            ...series,
            animation: false,
            data: series.data.map((value) => this.zeroDatum(value))
          };
        })
      };
      // Only clamp the yAxis max when the chart actually HAS a cartesian yAxis.
      // Injecting a yAxis into axis-less charts (pie/donut/radar/gauge) makes
      // ECharts try to resolve a coordinate system that doesn't exist → crash.
      if (option.yAxis !== undefined) {
        baseline.yAxis = Array.isArray(option.yAxis)
          ? option.yAxis  // keep dual-axis array as-is; don't clamp max on dual-axis
          : { ...(option.yAxis || {}), max: option.yAxis?.max ?? Math.ceil(maxValue * 1.1) };
      }
      return baseline;
    },
    createBarRiseOption(option) {
      return this.createChartRiseOption(option);
    },
    createChartRiseOption(option) {
      return {
        ...option,
        animation: true,
        animationDuration: option.animationDuration ?? 1200,
        animationDurationUpdate: option.animationDurationUpdate ?? 1200,
        animationEasing: option.animationEasing || "cubicOut",
        animationEasingUpdate: option.animationEasingUpdate || "cubicOut",
        series: option.series.map((series) => {
          if (!["bar", "line", "pie"].includes(series?.type) || !Array.isArray(series.data)) return series;
          return {
            ...series,
            animation: true,
            animationDuration: series.animationDuration ?? 1200,
            animationDurationUpdate: series.animationDurationUpdate ?? 1200,
            animationEasing: series.animationEasing || "cubicOut",
            animationEasingUpdate: series.animationEasingUpdate || "cubicOut"
          };
        })
      };
    },
    datumValue(value) {
      if (Array.isArray(value)) return Number(value[1] ?? value[0]) || 0;
      if (value && typeof value === "object") return Number(value.value) || 0;
      return Number(value) || 0;
    },
    zeroDatum(value) {
      if (Array.isArray(value)) return value.map((entry, index) => (index === value.length - 1 ? 0 : entry));
      if (value && typeof value === "object") return { ...value, value: 0 };
      return 0;
    }
  }
};
</script>
