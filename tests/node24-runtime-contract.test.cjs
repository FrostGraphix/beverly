"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").trim();
const packageJson = JSON.parse(read("package.json"));

assert.equal(packageJson.engines?.node, "24.x", "Vercel must select Node 24 from package.json");
assert.equal(packageJson.packageManager, "pnpm@10.28.0", "pnpm must remain pinned for repeatable installs");
assert.match(packageJson.scripts?.["runtime:verify"] || "", /runtime-parity-check/, "the runtime parity command must protect the Node/Corepack boundary");
assert.equal(read(".nvmrc"), "24.13.1", "NVM must select the approved Node 24 release");
assert.equal(read(".node-version"), "24.13.1", "other version managers must select the approved Node 24 release");

for (const workflow of [
  ".github/workflows/ci.yml",
  ".github/workflows/monitoring-smoke.yml",
  ".github/workflows/wallet-ci.yml",
  ".github/workflows/blue-green-promote.yml",
]) {
  assert.match(read(workflow), /24\.13\.1/, `${workflow} must run the approved Node 24 release`);
}

const runtimeCheck = read("tools/node-version-check.cjs");
assert.match(runtimeCheck, /EXPECTED_NODE_MAJOR = 24/, "runtime guard must reject non-Node-24 runtimes");
assert.match(runtimeCheck, /LOCAL_NODE_VERSION = "24\.13\.1"/, "runtime guard must keep the local and CI pin explicit");

const vercelPreflight = read("tools/vercel-deploy-preflight.cjs");
assert.match(vercelPreflight, /nodeEngine !== "24\.x"/, "Vercel preflight must reject a non-Node-24 deployment contract");

const vercelConfig = JSON.parse(read("vercel.json"));
assert.equal(vercelConfig.env?.ENABLE_EXPERIMENTAL_COREPACK, "1", "Vercel must enable Corepack for the pinned pnpm version");
assert.equal(packageJson.volta?.node, "24.13.1", "Volta must select the approved local Node release");
assert.equal(packageJson.volta?.pnpm, "10.28.0", "Volta must select the pinned pnpm release");
assert.match(read(".npmrc"), /^engine-strict=true$/m, "installs must fail clearly when the wrong Node major is active");

console.log("node 24 runtime contract passed");
