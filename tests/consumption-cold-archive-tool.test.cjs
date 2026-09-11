"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const toolPath = path.join(__dirname, "..", "tools", "consumption-cold-archive.cjs");
assert.equal(fs.existsSync(toolPath), true, "cold archive tool must exist");
const source = fs.readFileSync(toolPath, "utf8");

assert.match(source, /--station/);
assert.match(source, /archiveProvidedRows/);
assert.match(source, /dailyMeterArchiveRecord/);
assert.match(source, /postLive/);
assert.match(source, /pageRows/);
assert.match(source, /Math\.min\(500/);
assert.match(source, /groupedByMonth/);
assert.match(source, /filterRowsByRange\(rows, from, to, stationId\)/);
assert.doesNotMatch(source, /writeDailyMeterRows/);

console.log("consumption cold archive tool passed");
