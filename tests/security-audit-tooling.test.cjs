"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "../tools/security-audit-baseline.cjs"), "utf8");

assert.ok(source.includes('["audit", "--prod", "--json"]'), "security audit must inspect the canonical pnpm production graph");
assert.ok(source.includes('process.platform === "win32" ? "pnpm.cmd" : "pnpm"'), "security audit must invoke pnpm portably");
assert.ok(!source.includes("shell: true"), "security audit must not enable an unescaped command shell");
assert.ok(!source.includes("npm audit --json"), "security audit must not inspect the stale npm lock graph");
for (const removedAcceptance of ["nanoid", "postcss", "brace-expansion", "fastify", "fast-jwt", "fast-uri", "find-my-way"]) {
  assert.ok(!source.includes(`["${removedAcceptance}",`), `${removedAcceptance} must not be silently accepted`);
}

console.log("security audit tooling contract passed");
