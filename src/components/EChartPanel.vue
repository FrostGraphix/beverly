<template>
  <div ref="chart" class="echart-panel"></div>
</template>

<script>
import { use, init } from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer
]);

export default {
  name: "EChartPanel",
  props: {
    option: { type: Object, required: true }
  },
  data() {
    return {
      chart: null,
      resizeObserver: null
    };
  },
  mounted() {
    this.chart = init(this.$refs.chart, "macarons");
    this.renderChart();
    window.addEventListener("resize", this.resizeChart);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.resizeChart);
      this.resizeObserver.observe(this.$refs.chart);
    }
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.resizeChart);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.chart) this.chart.dispose();
  },
  watch: {
    option: {
      deep: true,
      handler() {
        this.renderChart();
      }
    }
  },
  methods: {
    renderChart() {
      if (!this.chart) return;
      this.chart.setOption(this.option, true, true);
    },
    resizeChart() {
      if (this.chart) this.chart.resize();
    }
  }
};
</script>
