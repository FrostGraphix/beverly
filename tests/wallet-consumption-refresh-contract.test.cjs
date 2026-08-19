"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "backend", "wallet", "src", "services", "consumption.ts");
const routePath = fs.existsSync(path.join(root, "backend", "wallet", "src", "routes", "admin-consumption.ts"))
  ? path.join(root, "backend", "wallet", "src", "routes", "admin-consumption.ts")
  : path.join(root, "backend", "wallet", "src", "routes", "admin.ts");
const viewPath = path.join(root, "apps", "admin", "src", "views", "Consumption.vue");
const migrationPath = path.join(root, "supabase", "migrations", "20260521231000_fix_station_aggregate_refresh.sql");

const service = fs.readFileSync(servicePath, "utf8");
const routes = fs.readFileSync(routePath, "utf8");
const view = fs.readFileSync(viewPath, "utf8");
const migration = fs.readFileSync(migrationPath, "utf8");

function assertIncludes(source, value, label) {
  if (!source.includes(value)) throw new Error(`${label} missing ${value}`);
}

assertIncludes(service, "refresh_meter_reading_aggregates_for_station", "service");
assertIncludes(service, "p_station_id", "service");
assertIncludes(service, "await listStations()", "service");
assertIncludes(service, "meter_consumption_aggregates", "service");
assertIncludes(service, "groupedRows", "service");
assertIncludes(routes, "stationIds", "admin route");
assertIncludes(routes, "refreshConsumptionAggregates(stationIds)", "admin route");
// The view sends a station list only when one is selected; with no selection it
// posts an empty body so the server resolves the full estate from the database
// (a station onboarded after page load is then still covered).
assertIncludes(view, "api.post('/api/v1/admin/consumption/refresh', body)", "admin view");
assertIncludes(view, "selectedStn.value ? { stationIds: [selectedStn.value] } : {}", "admin view");
assertIncludes(migration, "create or replace function public.refresh_meter_reading_aggregates_for_station", "migration");

if (service.includes("rpc('refresh_consumption_aggregates'")) {
  throw new Error("service must not call the old global consumption refresh RPC");
}

console.log(JSON.stringify({
  status: "wallet consumption refresh contract passed",
  rpc: "refresh_meter_reading_aggregates_for_station",
}, null, 2));
