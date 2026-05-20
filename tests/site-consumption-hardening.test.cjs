"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(file, text, label) {
  if (!file.includes(text)) throw new Error(label);
}

function main() {
  const api = read("api/reference.js");
  const page = read("src/components/SiteConsumptionPage.vue");
  const app = read("src/App.vue");

  // Proxy-side audit machinery is retained for downstream tooling.
  assertIncludes(api, "expectedMidnightSyncDate", "missing midnight sync verifier");
  assertIncludes(api, "classifyBackfillDrift", "missing backfill drift classifier");
  assertIncludes(api, "syncLogs", "missing audit sync logs");
  assertIncludes(api, "alerts", "missing structured audit alerts");

  // Site Consumption page (rewritten): live per-station fetch, scalable, role-aware.
  assertIncludes(page, "fetchConsumptionStatistics", "missing live consumption fetch");
  assertIncludes(page, "_stationGen", "missing stale-response guard");
  assertIncludes(page, "_doFetchStations", "missing parallel station fetch");
  assertIncludes(page, "roleId", "missing admin role input");
  assertIncludes(app, ':role-id="currentRoleId"', "missing site consumption role binding");

  console.log(JSON.stringify({ status: "site consumption hardening contract passed" }, null, 2));
}

main();
