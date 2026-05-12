"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, ".github", "workflows", "monitoring-smoke.yml");
const docsPath = path.join(root, "docs", "MONITORING_AND_ALERTS.md");

const workflow = fs.readFileSync(workflowPath, "utf8");
const docs = fs.readFileSync(docsPath, "utf8");

function assertIncludes(source, value, label) {
  if (!source.includes(value)) {
    throw new Error(`${label} missing ${value}`);
  }
}

assertIncludes(workflow, "schedule:", "workflow");
assertIncludes(workflow, "PREVIEW_TARGET_URL", "workflow");
assertIncludes(workflow, "PRODUCTION_TARGET_URL", "workflow");
assertIncludes(workflow, "VERCEL_PROTECTION_BYPASS", "workflow");
assertIncludes(workflow, 'node-version: "22"', "workflow");
assertIncludes(workflow, "npm run smoke:vercel", "workflow");
assertIncludes(docs, "PREVIEW_TARGET_URL", "docs");
assertIncludes(docs, "PRODUCTION_TARGET_URL", "docs");
assertIncludes(docs, "VERCEL_PROTECTION_BYPASS", "docs");

console.log(JSON.stringify({
  workflow: path.relative(root, workflowPath),
  status: "monitoring config passed"
}, null, 2));
