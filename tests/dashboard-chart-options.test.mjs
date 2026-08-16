import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBarOption, createLineOption, createPieOption, dashboardSeries } from "../src/services/dashboard-chart-options.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const echartPanel = fs.readFileSync(path.join(root, "src/components/EChartPanel.vue"), "utf8");

const series = dashboardSeries(["2026-01-01", "2026-01-02"], [10, 20]);
const bar = createBarOption(series, "Purchase Money");
const line = createLineOption(series, "Communication Success Rate");
const pie = createPieOption(series, "Abnormal Alarm");
const themed = createBarOption(series, "Themed", {
  primary: "#047857",
  success: "#22c55e",
  primaryDeep: "#166534",
  textMuted: "#052e16",
  textFaint: "#166534",
  border: "#bbf7d0",
  tooltip: "#ffffff",
  tooltipText: "#052e16"
});
const alarm = createPieOption(series, "Alarm", {
  alarmColors: ["#ef4444", "#f59e0b"]
});

assert.strictEqual(series.xData.length, 2);
assert.strictEqual(bar.series[0].type, "bar");
assert.strictEqual(bar.series[0].coordinateSystem, "cartesian2d");
assert.strictEqual(bar.xAxis.type, "category");
assert.strictEqual(bar.yAxis.type, "value");
assert.strictEqual(bar.animation, true);
assert.strictEqual(bar.series[0].animationDuration, 1200);
assert.strictEqual(bar.series[0].animationEasing, "elasticOut");
assert.strictEqual(bar.series[0].universalTransition, undefined);
assert.strictEqual(bar.series[0].itemStyle.color, "#059669");
assert.strictEqual(typeof bar.series[0].itemStyle.color, "string");
assert.strictEqual(themed.series[0].itemStyle.color, "#047857");
assert.strictEqual(themed.tooltip.backgroundColor, "#ffffff");
assert.strictEqual(themed.tooltip.textStyle.color, "#052e16");
assert.strictEqual(line.series[0].type, "line");
assert.strictEqual(line.series[0].coordinateSystem, "cartesian2d");
assert.strictEqual(line.xAxis.type, "category");
assert.strictEqual(line.yAxis.type, "value");
assert.strictEqual(line.animation, true);
assert.match(line.tooltip.formatter, /#10b981/);
assert.match(line.tooltip.formatter, /\{c\}%/);
assert.strictEqual(pie.series[0].type, "pie");
assert.strictEqual(pie.series[0].roseType, "radius");
assert.strictEqual(pie.animation, true);
assert.strictEqual(pie.title.left, 10);
assert.strictEqual(pie.legend.type, "scroll");
assert.deepStrictEqual(pie.series[0].radius, ["18%", "58%"]);
assert.deepStrictEqual(pie.series[0].center, ["50%", "45%"]);
assert.strictEqual(pie.series[0].minAngle, 4);
assert.strictEqual(pie.series[0].avoidLabelOverlap, true);
assert.strictEqual(pie.series[0].label.formatter, "{b}");
assert.strictEqual(alarm.series[0].itemStyle.borderWidth, 0);
assert.strictEqual(alarm.series[0].label.textBorderWidth, 0);
assert.strictEqual(alarm.series[0].data[0].itemStyle.color, "#ef4444");
assert.strictEqual(alarm.series[0].data[0].labelLine.lineStyle.color, "#ef4444");
assert(echartPanel.includes("dashboard-svg-chart"));
assert(echartPanel.includes("echart-canvas"));
assert(echartPanel.includes("loadECharts"));
assert(echartPanel.includes("setOption"));
assert(echartPanel.includes("resize"));
assert(echartPanel.includes("ResizeObserver"));
assert(echartPanel.includes("resizeObserver.observe(this.$refs.chart)"));
assert(echartPanel.includes("resizeObserver.disconnect()"));
assert(echartPanel.includes("createBarBaseline"));
assert(echartPanel.includes("createBarRiseOption"));
assert(echartPanel.includes("shouldReplayChart"));
assert(echartPanel.includes("createChartBaseline"));
assert(echartPanel.includes("createChartRiseOption"));
assert(echartPanel.includes('"bar", "line", "pie"'));
assert(!echartPanel.includes('"macarons"'));
assert(!echartPanel.includes("dashboard-avatar-rise"));

console.log(JSON.stringify({
  charts: 3,
  status: "dashboard chart options passed"
}, null, 2));
