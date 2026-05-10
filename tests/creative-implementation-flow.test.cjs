const assert = require("node:assert");
const fs = require("node:fs");
const { artifactPath, runAudit } = require("../tools/creative-implementation-audit.cjs");

const report = runAudit();

assert.strictEqual(report.status, "passed", JSON.stringify(report.checks.filter((check) => !check.passed), null, 2));
assert.strictEqual(report.summary.failed, 0);
assert(report.summary.total >= 10, "Expected broad flow coverage.");
assert(report.directions.includes("Operational Command"));
assert.strictEqual(report.chosenDirection, "Operational Command with Executive polish");
assert(fs.existsSync(artifactPath), "Expected audit artifact.");

console.log("creative-implementation-flow ok");
