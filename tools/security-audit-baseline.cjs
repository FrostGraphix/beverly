"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const accepted = new Map([
  ["@vitejs/plugin-vue2", "Vue 2 bridge is required until framework migration."],
  ["vue", "Vue 2 migration is tracked separately."],
  ["vuex", "Vuex 3 remains coupled to Vue 2."],
  ["vite", "Patched fix requires Vite major upgrade."],
  ["esbuild", "Transitive Vite dev-server advisory."],
  ["echarts", "The affected Lines-series tooltip path is prohibited by the source guard."],
  ["exceljs", "The current upstream release retains a transitive uuid advisory; npm offers only an incompatible downgrade."],
  ["uuid", "Present only through ExcelJS; no non-vulnerable ExcelJS release is available."],
  ["archiver", "Transitive build packaging utility dependency."],
  ["archiver-utils", "Transitive build packaging utility dependency."],
  ["brace-expansion", "Transitive glob tooling dependency."],
  ["glob", "Transitive build tooling dependency."],
  ["minimatch", "Transitive glob tooling dependency."],
  ["postcss", "Transitive CSS bundler tool dependency."],
  ["readdir-glob", "Transitive file scanner dependency."],
  ["rimraf", "Transitive build cleanup utility dependency."],
  ["zip-stream", "Transitive build packaging utility dependency."]
]);

function sourceFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(?:js|mjs|cjs|ts|vue)$/.test(entry.name) ? [fullPath] : [];
  });
}

function assertNoVulnerableEchartsLinesSeries() {
  const roots = ["src", "apps"].map((entry) => path.resolve(entry));
  const pattern = /\btype\s*:\s*["']lines["']/;
  const matches = roots.flatMap(sourceFiles).filter((filePath) => pattern.test(fs.readFileSync(filePath, "utf8")));
  if (matches.length) {
    throw new Error(`ECharts Lines series requires upgrading to 6.1.0: ${matches.join(", ")}`);
  }
}

function readAudit() {
  try {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    return JSON.parse(execSync(`${npm} audit --json`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

assertNoVulnerableEchartsLinesSeries();
const report = readAudit();
const vulnerabilities = Object.values(report.vulnerabilities || {});
const unknown = vulnerabilities.filter((item) => !accepted.has(item.name));
const severe = unknown.filter((item) => ["high", "critical"].includes(item.severity));

console.log(JSON.stringify({
  total: vulnerabilities.length,
  accepted: vulnerabilities.filter((item) => accepted.has(item.name)).map((item) => ({
    name: item.name,
    severity: item.severity,
    reason: accepted.get(item.name)
  })),
  unknown: unknown.map((item) => ({ name: item.name, severity: item.severity })),
  severe: severe.map((item) => ({ name: item.name, severity: item.severity })),
  status: unknown.length ? "failed" : "accepted-baseline"
}, null, 2));

if (unknown.length) process.exitCode = 1;
