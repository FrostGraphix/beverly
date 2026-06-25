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
  const panel = read("src/components/consumption/SiteConsumptionAuditPanel.vue");
  const app = read("src/App.vue");
  const browser = read("tests/vue-app.browser.test.cjs");

  assertIncludes(api, "expectedMidnightSyncDate", "missing midnight sync verifier");
  assertIncludes(api, "classifyBackfillDrift", "missing backfill drift classifier");
  assertIncludes(api, "syncLogs", "missing audit sync logs");
  assertIncludes(api, "alerts", "missing structured audit alerts");

  assertIncludes(page, "site-consumption-sync-banner", "missing sync failure banner");
  assertIncludes(page, "site-consumption-audit-export", "missing audit export button");
  assertIncludes(page, "exportAuditReport", "missing audit export flow");
  assertIncludes(page, "roleId", "missing admin role input");
  assertIncludes(app, ':role-id="currentRoleId"', "missing site consumption role binding");

  assertIncludes(panel, "site-consumption-sync-logs", "missing admin sync logs");
  assertIncludes(panel, "admin", "missing admin-only guard");
  assertIncludes(panel, "export-audit", "missing panel export event");

  assertIncludes(browser, "site-consumption-sync-banner", "missing browser banner smoke");
  assertIncludes(browser, "site-consumption-sync-logs", "missing browser log smoke");
  assertIncludes(browser, "site-consumption-audit-export", "missing browser export smoke");

  console.log(JSON.stringify({ status: "site consumption hardening contract passed" }, null, 2));
}

main();
