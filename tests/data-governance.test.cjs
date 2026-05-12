"use strict";

const assert = require("assert");
const {
  cutoffIso,
  governancePlan,
  retentionPolicy
} = require("../backend/src/services/data-governance");

const policy = retentionPolicy();
const plan = governancePlan();
const cutoff = cutoffIso(7, new Date("2026-05-12T00:00:00Z"));

assert.strictEqual(policy.cacheDays, 7);
assert.strictEqual(policy.snapshotDays, 90);
assert.strictEqual(policy.exportDays, 180);
assert(plan.audits.includes("role permission audit"));
assert(plan.backup.restoreDrill.includes("monthly"));
assert.strictEqual(cutoff, "2026-05-05T00:00:00.000Z");

console.log(JSON.stringify({
  cacheDays: policy.cacheDays,
  snapshotDays: policy.snapshotDays,
  status: "data governance passed"
}, null, 2));
