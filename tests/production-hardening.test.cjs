const assert = require("node:assert");
const fs = require("node:fs");
const { reportPath, runAudit } = require("../tools/production-hardening-audit.cjs");

const report = runAudit();

assert.strictEqual(report.status, "passed", JSON.stringify(report.checks.filter((check) => !check.passed), null, 2));
assert.strictEqual(report.summary.failed, 0);
assert(fs.existsSync(reportPath), "Expected hardening audit artifact.");

console.log("production-hardening ok");
