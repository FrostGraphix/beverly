"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { checkVercelDeployPreflight } = require("../tools/vercel-deploy-preflight.cjs");

const root = path.join(__dirname, "..");
const importScript = fs.readFileSync(path.join(root, "tools", "import-vercel-env.ps1"), "utf8");

const result = checkVercelDeployPreflight();
assert.strictEqual(result.ok, true, result.failures.join("; "));

assert.match(importScript, /\$localOnlyNames = @\(/, "local-only block missing");
assert.match(importScript, /Skipping blank/, "blank values must be skipped");
assert.match(importScript, /--scope/, "scope support missing");
assert.match(importScript, /Refusing production live writes/, "production write guard missing");

console.log(JSON.stringify({
  status: "vercel deploy preflight passed",
  warnings: result.warnings
}, null, 2));
