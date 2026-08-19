"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const registry = read("src/services/station-registry.mjs");
const tableService = read("src/services/table-service.js");
const apiService = read("src/services/api.js");
const archivePage = read("src/components/ArchiveReportsPage.vue");
const alarmPage = read("src/components/AbnormalAlarmPage.vue");
const stationConsumptionPage = read("src/components/StationConsumptionPage.vue");
const reportsPage = read("src/components/ReportsPage.vue");
const consumptionStatsPage = read("src/components/ConsumptionStatisticsPage.vue");
const siteSidebar = read("src/components/consumption/SiteSidebar.vue");
const adminWalletDashboard = read("src/components/wallet/AdminWalletDashboard.vue");

// 1. Station Registry contract checks
assert.match(registry, /export function onStationMutation/, "station-registry must export onStationMutation");
assert.match(registry, /export function notifyStationMutation/, "station-registry must export notifyStationMutation");

// 2. Table Service contract checks
assert.match(tableService, /onStationMutation\(\s*\(\)\s*=>/, "table-service must subscribe loadDynamicStationOptions to onStationMutation");
assert.match(tableService, /notifyStationMutation/, "table-service must re-export notifyStationMutation");

// 3. API Service contract checks
assert.match(apiService, /import\s*\{\s*notifyStationMutation\s*\}\s*from\s*"(?:\.\/|\.\.\/services\/)station-registry\.mjs";/, "api.js must import notifyStationMutation");
assert.match(apiService, /checkStationMutation/, "api.js must trigger station mutation checks on write operations");

// 4. Component station dropdown reactivity checks
assert.match(archivePage, /tableSiteOptions/, "ArchiveReportsPage must reactively include tableSiteOptions in stationOptions");
assert.match(alarmPage, /tableSiteOptions/, "AbnormalAlarmPage must reactively include tableSiteOptions in stations");
assert.match(stationConsumptionPage, /tableSiteOptions/, "StationConsumptionPage must reactively include tableSiteOptions in STATIONS");
assert.match(reportsPage, /tableSiteOptions/, "ReportsPage must reactively bind stationOptions to tableSiteOptions");
assert.match(consumptionStatsPage, /onStationMutation/, "ConsumptionStatisticsPage must listen to onStationMutation");
assert.match(siteSidebar, /tableSiteOptions/, "SiteSidebar must reactively include tableSiteOptions");
assert.match(adminWalletDashboard, /tableSiteOptions/, "AdminWalletDashboard must reactively include tableSiteOptions in activityStations");

// 5. Functional mutation test
const { tableSiteOptions, loadDynamicStationOptions } = require("../src/services/table-service.js");
const { invalidateStations, notifyStationMutation, onStationMutation } = require("../src/services/station-registry.mjs");

let triggered = false;
const unsub = onStationMutation(() => { triggered = true; });
notifyStationMutation();
assert.strictEqual(triggered, true, "notifyStationMutation must trigger registered mutation listeners");
unsub();

console.log(JSON.stringify({ status: "station dropdown live updates contract passed" }, null, 2));
