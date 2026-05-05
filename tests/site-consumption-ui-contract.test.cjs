"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const appVue = read("src/App.vue");
const siteConsumptionPage = read("src/components/SiteConsumptionPage.vue");
const kpiCardGrid = read("src/components/consumption/KpiCardGrid.vue");
const stationBarChart = read("src/components/consumption/StationBarChart.vue");
const temporalLineChart = read("src/components/consumption/TemporalLineChart.vue");

assert.match(
  appVue,
  /import SiteConsumptionPage from "\.\/components\/SiteConsumptionPage\.vue";/,
  "App should import SiteConsumptionPage from the real component path"
);

assert.match(
  appVue,
  /DailyDataMeterPage v-else-if="route\.hash === '#\/prepay-report\/daily-data-meter'"/,
  "App should keep DailyDataMeterPage on its dedicated branch"
);

assert.match(
  siteConsumptionPage,
  /onChartsReady: \(\{ sales, consumption \}\) => \{/,
  "SiteConsumptionPage should accept the nested chart payload contract"
);

assert.match(
  siteConsumptionPage,
  /this\.chartData = \{ sales, consumption \};/,
  "SiteConsumptionPage should store sales and consumption chart groups together"
);

assert.match(
  siteConsumptionPage,
  /chartMode === "sales"\s*\?\s*this\.chartData\.sales\.stationBar\s*:\s*this\.chartData\.consumption\.stationBar/,
  "SiteConsumptionPage should switch station charts by chart mode"
);

assert.match(
  kpiCardGrid,
  /key: "revenueShortfall"/,
  "KpiCardGrid should render the revenue shortfall card"
);

assert.match(
  kpiCardGrid,
  /const netGapSub = kpi\.netRevenueGap == null/,
  "KpiCardGrid should expose the net gap summary state"
);

assert.match(
  stationBarChart,
  /mode: \{ type: String, default: "sales" \}/,
  "StationBarChart should accept a chart mode prop"
);

assert.match(
  stationBarChart,
  /renderConsumptionComparison\(echarts\)/,
  "StationBarChart should support consumption comparison rendering"
);

assert.match(
  temporalLineChart,
  /mode: \{ type: String, default: "sales" \}/,
  "TemporalLineChart should accept a chart mode prop"
);

assert.match(
  temporalLineChart,
  /renderConsumptionChart\(echarts\)/,
  "TemporalLineChart should support the consumption trend path"
);

console.log(JSON.stringify({
  status: "site consumption ui contract passed",
  checks: 11
}, null, 2));
