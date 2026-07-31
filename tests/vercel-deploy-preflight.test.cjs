"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { checkVercelDeployPreflight } = require("../tools/vercel-deploy-preflight.cjs");

const root = path.join(__dirname, "..");
const importScript = fs.readFileSync(path.join(root, "tools", "import-vercel-env.ps1"), "utf8");

const teamId = "team_QaH3UbO8a73beiWz5LmJc5k4";
const validEnv = {
  VERCEL_TEAM_ID: teamId,
  OEM_CREDENTIALS_ENCRYPTION_KEY: "test-only-oem-encryption-key"
};
const result = checkVercelDeployPreflight({ env: validEnv });
assert.strictEqual(result.ok, true, result.failures.join("; "));

const missingOemKey = checkVercelDeployPreflight({ env: { VERCEL_TEAM_ID: teamId } });
assert.strictEqual(missingOemKey.ok, false);
assert.match(missingOemKey.failures.join("\n"), /OEM_CREDENTIALS_ENCRYPTION_KEY/);

const missingTeam = checkVercelDeployPreflight({ env: {} });
assert.strictEqual(missingTeam.ok, false);
assert.match(missingTeam.failures.join("\n"), /July 2 failed because a non-member actor/);
assert.match(missingTeam.failures.join("\n"), new RegExp(teamId));

const wrongScope = checkVercelDeployPreflight({ env: { ...validEnv, VERCEL_TEAM_ID: "", VERCEL_SCOPE: "frostgraphix" } });
assert.strictEqual(wrongScope.ok, false);
assert.match(wrongScope.failures.join("\n"), new RegExp(teamId));

assert.match(importScript, /\$localOnlyNames = @\(/, "local-only block missing");
assert.match(importScript, /Skipping blank/, "blank values must be skipped");
assert.match(importScript, /--scope/, "scope support missing");
assert.match(importScript, /Refusing production live writes/, "production write guard missing");

console.log(JSON.stringify({
  status: "vercel deploy preflight passed",
  warnings: result.warnings
}, null, 2));
