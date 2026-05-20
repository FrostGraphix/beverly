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

// New three-view architecture: All Sites / By Station / By Customer
assert.match(
  siteConsumptionPage,
  /key: "all".*key: "station".*key: "customer"/s,
  "SiteConsumptionPage should expose the All Sites / By Station / By Customer views"
);

assert.match(
  siteConsumptionPage,
  /activePeriod: "monthly"/,
  "SiteConsumptionPage should default to the monthly period"
);

assert.match(
  siteConsumptionPage,
  /periodPlan\(\)/,
  "SiteConsumptionPage should resolve a period plan (range + fetch granularity + bucket)"
);

assert.match(
  siteConsumptionPage,
  /fetchConsumptionStatistics\(/,
  "SiteConsumptionPage should fetch live consumption data per station"
);

assert.match(
  siteConsumptionPage,
  /_doFetchStations/,
  "SiteConsumptionPage should fetch every station in parallel for the All Sites/By Station views"
);

assert.match(
  siteConsumptionPage,
  /loadCustomer/,
  "SiteConsumptionPage should resolve and fetch per-customer consumption"
);

assert.match(
  siteConsumptionPage,
  /_aggregate\(rows, bucket\)/,
  "SiteConsumptionPage should bucket rows into day/week/month/year totals"
);

// Design-system + scalability hooks
assert.match(
  siteConsumptionPage,
  /_stationGen/,
  "SiteConsumptionPage should guard against stale station responses with a generation counter"
);

assert.match(
  siteConsumptionPage,
  /BaseButton/,
  "SiteConsumptionPage controls should consume the shared design system"
);

console.log(JSON.stringify({
  status: "site consumption ui contract passed",
  checks: 11
}, null, 2));
