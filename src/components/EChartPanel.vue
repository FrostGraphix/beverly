<template>
  <div class="echart-panel dashboard-svg-chart">
    <div ref="chart" class="echart-canvas" role="img" :aria-label="title"></div>
  </div>
</template>

<script>
import { loadECharts } from "../services/echarts-loader.mjs";

export default {
  name: "EChartPanel",
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
  },
  beforeUnmount() {
    window.removeEventListener("resize", this.resizeHandler);
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
        this.chart.setOption(this.option || {}, true);
        this.chart.resize();
      });
    }
  }
};
</script>
