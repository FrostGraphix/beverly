"use strict";

// Verifies the running Node is 22 AND that every place the project pins Node
// agrees. The runtime check alone let the pins drift apart silently.

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const problems = [];

const major = Number(process.versions.node.split(".")[0]);
if (major !== 22) {
  console.error(`Expected Node 22, got ${process.version}.`);
  console.error("Select Node 22 using .nvmrc or .node-version.");
  process.exit(1);
}

function readIfPresent(rel) {
  const full = path.join(root, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8").trim() : null;
}

// package.json engines: the Vercel build contract.
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (packageJson.engines?.node !== "22.x") {
  problems.push(`package.json engines.node must be "22.x", found ${JSON.stringify(packageJson.engines?.node)}`);
}

// .nvmrc / .node-version: what a version manager would select.
const pinned = readIfPresent(".node-version");
for (const file of [".nvmrc", ".node-version"]) {
  const value = readIfPresent(file);
  if (value === null) {
    problems.push(`${file} is missing`);
    continue;
  }
  if (!value.startsWith("22.")) {
    problems.push(`${file} must pin a 22.x release, found ${value}`);
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
  engines: packageJson.engines.node
}, null, 2));
