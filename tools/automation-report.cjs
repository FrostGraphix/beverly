"use strict";

const { automationReport } = require("../backend/src/services/automation-catalog");

const report = automationReport();
console.log(JSON.stringify(report, null, 2));

if (report.summary.missing > 0) {
  process.exitCode = 1;
}
