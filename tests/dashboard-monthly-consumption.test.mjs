import assert from "node:assert/strict";
import fs from "node:fs";
import { dashboardMonthlyWindow, mapStoredMonthlyConsumption } from "../src/services/dashboard-service.mjs";

assert.deepEqual(dashboardMonthlyWindow(new Date("2026-09-14T12:00:00Z")), {
  from: "2025-10-01", to: "2026-09-14",
});
assert.deepEqual(mapStoredMonthlyConsumption({ temporal: {
  labels: ["2026-09", "2026-07", "2026-08"],
  kwhSeries: [1144.97, 20767.56, 6237.67],
} }), {
  title: "Monthly Consumption",
  labels: ["2026-07", "2026-08", "2026-09"],
  values: [20767.56, 6237.67, 1144.97],
});
assert.throws(() => mapStoredMonthlyConsumption({ temporal: { labels: ["2026-09"], kwhSeries: [] } }), /unavailable/);
assert.throws(() => mapStoredMonthlyConsumption({ temporal: { labels: ["2026-09"], kwhSeries: [NaN] } }), /invalid/);

const page = fs.readFileSync(new URL("../src/components/DashboardPage.vue", import.meta.url), "utf8");
assert.match(page, /fetchStationConsumptionAnalytics\(\{ from, to, granularity: "monthly"/);
assert.doesNotMatch(page, /toMonthlyConsumption\(/);
assert.match(page, /option\.title\.show = false/);
assert.match(page, /Selected period ends/);

console.log("dashboard monthly consumption passed");
