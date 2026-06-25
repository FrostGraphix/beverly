"use strict";

const assert = require("node:assert");
const { automationReport } = require("../backend/src/services/automation-catalog");

const report = automationReport();
const itemKeys = new Set(report.items.map((item) => item.key));

assert.strictEqual(report.direction, "Operational Command");
assert.strictEqual(report.polish, "Executive utility");
assert(report.summary.total >= 18, "Expected full automation coverage.");
assert.strictEqual(report.summary.cron, 4);
assert(report.summary.ci >= 2, "Expected CI coverage.");
assert(report.summary.logging >= 5, "Expected ledger coverage.");
assert(itemKeys.has("refresh-hot"));
assert(itemKeys.has("refresh-hourly"));
assert(itemKeys.has("refresh-daily"));
assert(itemKeys.has("refresh-backfill"));
assert(itemKeys.has("snapshots"));
assert(itemKeys.has("consumption-persistence"));
assert(itemKeys.has("ci-hardening"));
assert(itemKeys.has("smoke-monitoring"));
assert(itemKeys.has("uptime-smoke"));

console.log(JSON.stringify({
  total: report.summary.total,
  status: "automation report passed"
}, null, 2));
