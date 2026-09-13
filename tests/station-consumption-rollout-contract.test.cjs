"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const stationPage = read("src/components/StationConsumptionPage.vue");
const stationService = read("src/services/consumption-service.mjs");
const adminView = read("apps/admin/src/views/Consumption.vue");
const migrationA = read("supabase/migrations/20260521210000_meter_reading_aggregates.sql");
const migrationB = read("supabase/migrations/20260521220000_meter_agg_per_station_refresh.sql");
const migrationC = read("supabase/migrations/20260521231000_fix_station_aggregate_refresh.sql");

assert(
  stationService.includes("/api/local/consumption/refresh-aggregates"),
  "station consumption service must use CRM cookie-authenticated refresh endpoint"
);
assert(
  stationService.includes("stationIds"),
  "station consumption refresh must pass stationIds"
);
assert(
  stationPage.includes("triggerMeterAggregateRefresh(stationIds)"),
  "station page must call refresh with stationIds"
);
assert(stationPage.includes("Source freshness"), "station page must label source freshness");
assert(stationPage.includes("data?.freshness"), "station page must consume synchronization health");
assert(stationPage.includes("maximumLagDays"), "station page must show synchronization lag");
assert(
  adminView.includes("/api/v1/admin/consumption/refresh") && adminView.includes("stationIds: [selectedStn.value]"),
  "wallet admin view must use station-scoped refresh payload"
);
assert(
  adminView.includes("Rebuild aggregates"),
  "wallet admin view must expose rebuild action copy"
);
assert(
  migrationA.includes("refresh_meter_reading_aggregates_for_station('TUNGA')"),
  "base aggregate migration must schedule per-station refresh"
);
assert(
  migrationB.includes("create or replace function public.refresh_meter_reading_aggregates_for_station"),
  "May 21 per-station migration must define refresh function"
);
assert(
  migrationC.includes("create or replace function public.refresh_meter_reading_aggregates_for_station"),
  "May 21 fix migration must keep refresh function"
);

console.log(JSON.stringify({
  status: "station consumption rollout contract passed",
  refreshEndpoint: "/api/local/consumption/refresh-aggregates",
}, null, 2));
