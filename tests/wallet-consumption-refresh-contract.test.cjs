"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "backend", "wallet", "src", "services", "consumption.ts");
const routePath = path.join(root, "backend", "wallet", "src", "routes", "admin.ts");
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
assertIncludes(service, "DEFAULT_REFRESH_STATIONS", "service");
// The estate must be discovered, not hardcoded: the constant is a fallback for
// an unreachable registry, never the list of stations Beverly operates.
assertIncludes(service, "list_consumption_station_ids", "service");
assertIncludes(service, "resolveRefreshStations", "service");
assertIncludes(service, "meter_consumption_aggregates", "service");
assertIncludes(service, "groupedRows", "service");
assertIncludes(service, "fetchAllRows", "service");
assertIncludes(routes, "stationIds", "admin route");
assertIncludes(routes, "refreshConsumptionAggregates(stationIds)", "admin route");
// Selecting a station rebuilds exactly that station; selecting none sends no
// list at all, so the server resolves the whole estate from the database
// rather than from a station list this page happened to load earlier.
assertIncludes(view, "selectedStn.value ? { stationIds: [selectedStn.value] } : {}", "admin view");
assertIncludes(view, "api.post('/api/v1/admin/consumption/refresh', body)", "admin view");
assertIncludes(view, "spend=true", "admin view");
assertIncludes(view, "readingCount(r)", "admin view");
assertIncludes(migration, "create or replace function public.refresh_meter_reading_aggregates_for_station", "migration");

if (service.includes("rpc('refresh_consumption_aggregates'")) {
  throw new Error("service must not call the old global consumption refresh RPC");
}

console.log(JSON.stringify({
  status: "wallet consumption refresh contract passed",
  rpc: "refresh_meter_reading_aggregates_for_station",
}, null, 2));
