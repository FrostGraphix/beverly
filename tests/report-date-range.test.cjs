"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "../src/services/report-service.mjs"), "utf8");
const functionSource = source.match(/export function dateRangeFromPreset\(preset\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(functionSource, "Expected dateRangeFromPreset source");
const dateRangeFromPreset = Function(`${functionSource.replace("export ", "")}; return dateRangeFromPreset;`)();

const today = new Date();
today.setUTCHours(0, 0, 0, 0);

const oneDay = dateRangeFromPreset("1d");
assert.equal(new Date(oneDay.end).getTime() - new Date(oneDay.start).getTime(), 86400000);

for (const [preset, offset] of [["7d", 6], ["30d", 29]]) {
  const expected = new Date(today);
  expected.setUTCDate(expected.getUTCDate() - offset);
  const range = dateRangeFromPreset(preset);
  assert.equal(range.start, expected.toISOString());
  assert.ok(new Date(range.end).getTime() >= today.getTime());
}

const oneYear = dateRangeFromPreset("365d");
const expectedYear = new Date(today);
expectedYear.setUTCFullYear(expectedYear.getUTCFullYear() - 1);
assert.equal(oneYear.start, expectedYear.toISOString());

console.log(JSON.stringify({ status: "report date ranges passed" }, null, 2));
