"use strict";

const { reviewLogs } = require("../tools/production-log-review.cjs");

const result = reviewLogs();
if (!result.ok) {
  throw new Error(`log review found ${result.findings.length} sensitive findings`);
}

console.log(JSON.stringify({
  filesReviewed: result.filesReviewed.length,
  status: "production log review passed"
}, null, 2));
