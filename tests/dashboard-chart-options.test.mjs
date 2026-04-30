import assert from "node:assert";
import { createBarOption, createLineOption, createPieOption, dashboardSeries } from "../src/services/dashboard-chart-options.mjs";

const series = dashboardSeries(["2026-01-01", "2026-01-02"], [10, 20]);
const bar = createBarOption(series, "Purchase Money");
const line = createLineOption(series, "Communication Success Rate");
const pie = createPieOption(series, "Abnormal Alarm");

assert.strictEqual(series.xData.length, 2);
assert.strictEqual(bar.series[0].type, "bar");
assert.strictEqual(bar.series[0].animationDuration, 2000);
assert.strictEqual(line.series[0].type, "line");
assert.strictEqual(line.tooltip.formatter, "{b} <br/>{a} : {c}%");
assert.strictEqual(pie.series[0].type, "pie");
assert.strictEqual(pie.series[0].roseType, "radius");

console.log(JSON.stringify({
  charts: 3,
  status: "dashboard chart options passed"
}, null, 2));
