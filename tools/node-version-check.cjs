"use strict";

// Verifies that every contributor and CI job uses Node 24. Local version
// managers pin one approved patch release; Vercel intentionally owns its
// patched 24.x release, so production accepts the supported major only.

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const problems = [];
const EXPECTED_NODE_MAJOR = 24;
const LOCAL_NODE_VERSION = "24.13.1";

const major = Number(process.versions.node.split(".")[0]);
if (major !== EXPECTED_NODE_MAJOR) {
  console.error(`Expected Node ${EXPECTED_NODE_MAJOR}, got ${process.version}.`);
  console.error(`Select Node ${LOCAL_NODE_VERSION} using .nvmrc, .node-version, or Volta.`);
  process.exit(1);
}

function readIfPresent(rel) {
  const full = path.join(root, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8").trim() : null;
}

// package.json engines: the Vercel build contract. Vercel selects supported
// releases by major and applies security patch updates automatically.
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (packageJson.engines?.node !== "24.x") {
  problems.push(`package.json engines.node must be "24.x", found ${JSON.stringify(packageJson.engines?.node)}`);
}
if (packageJson.volta?.node !== LOCAL_NODE_VERSION || packageJson.volta?.pnpm !== "10.28.0") {
  problems.push("package.json volta must pin Node 24.13.1 and pnpm 10.28.0");
}

// .nvmrc / .node-version: what a version manager would select.
const pinned = readIfPresent(".node-version");
for (const file of [".nvmrc", ".node-version"]) {
  const value = readIfPresent(file);
  if (value === null) {
    problems.push(`${file} is missing`);
    continue;
  }
  if (value !== LOCAL_NODE_VERSION) {
    problems.push(`${file} must pin ${LOCAL_NODE_VERSION}, found ${value}`);
  }
  if (pinned && value !== pinned) {
    problems.push(`${file} (${value}) must match .node-version (${pinned})`);
  }
}

if (problems.length) {
  console.error("Node version pins disagree:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: "node-version-check passed",
  running: process.version,
  pinned,
  engines: packageJson.engines.node,
  packageManager: packageJson.packageManager
}, null, 2));
