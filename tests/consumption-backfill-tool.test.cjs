"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const toolPath = path.join(root, "tools", "consumption-backfill.cjs");
const verifyPath = path.join(root, "tools", "consumption-raw-gap-verify.cjs");
const tool = fs.readFileSync(toolPath, "utf8");
const verify = fs.readFileSync(verifyPath, "utf8");

function assertIncludes(source, value, label) {
  if (!source.includes(value)) throw new Error(`${label} missing ${value}`);
}

assertIncludes(tool, "parseRunLog", "backfill tool");
assertIncludes(tool, "resume_failed_from_log", "backfill tool");
assertIncludes(tool, "skipped_completed_from_log", "backfill tool");
assertIncludes(tool, "postLive", "backfill tool");
assertIncludes(tool, "pageRows", "backfill tool");
assertIncludes(tool, "nextPage: complete ? pageNumber : pageNumber + 1", "backfill tool");
assertIncludes(tool, "mode: \"page-stored\"", "backfill tool");
assertIncludes(tool, "--ignore-run-log", "backfill tool");
assertIncludes(tool, "stopAfterEmptyPages", "backfill tool");
assertIncludes(tool, "stoppedAfterEmptyPages", "backfill tool");
assertIncludes(verify, "const canonicalRows = Number(station.rows || 0)", "raw gap verify");
assertIncludes(verify, "const delta = canonicalRows - liveTotal", "raw gap verify");
assertIncludes(verify, "duplicateCovered", "raw gap verify");
assertIncludes(verify, "duplicateCoveredDrift", "raw gap verify");

if (tool.includes("fetchStationDataset")) {
  throw new Error("backfill tool must not crawl a whole station before storing pages");
}

if (verify.includes("const delta = logicalRawRows - liveTotal")) {
  throw new Error("raw gap verify must not fail canonical replay because of archived duplicate rows");
}

console.log(JSON.stringify({
  status: "consumption backfill tool contract passed",
}, null, 2));
