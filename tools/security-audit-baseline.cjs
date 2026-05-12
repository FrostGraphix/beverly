"use strict";

const { execSync } = require("node:child_process");

const accepted = new Map([
  ["@vitejs/plugin-vue2", "Vue 2 bridge is required until framework migration."],
  ["vue", "Vue 2 migration is tracked separately."],
  ["vuex", "Vuex 3 remains coupled to Vue 2."],
  ["vite", "Patched fix requires Vite major upgrade."],
  ["esbuild", "Transitive Vite dev-server advisory."]
]);

function readAudit() {
  try {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    return JSON.parse(execSync(`${npm} audit --json`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

const report = readAudit();
const vulnerabilities = Object.values(report.vulnerabilities || {});
const unknown = vulnerabilities.filter((item) => !accepted.has(item.name));
const severe = vulnerabilities.filter((item) => ["high", "critical"].includes(item.severity));

console.log(JSON.stringify({
  total: vulnerabilities.length,
  accepted: vulnerabilities.filter((item) => accepted.has(item.name)).map((item) => ({
    name: item.name,
    severity: item.severity,
    reason: accepted.get(item.name)
  })),
  unknown: unknown.map((item) => ({ name: item.name, severity: item.severity })),
  severe: severe.map((item) => ({ name: item.name, severity: item.severity })),
  status: unknown.length || severe.length ? "failed" : "accepted-baseline"
}, null, 2));

if (unknown.length || severe.length) process.exitCode = 1;
