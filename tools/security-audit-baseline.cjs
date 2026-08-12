"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const accepted = new Map([
  ["uuid", "Present only through ExcelJS; no non-vulnerable ExcelJS release is available."]
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
    const corepack = path.join(path.dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js");
    return JSON.parse(execFileSync(process.execPath, [corepack, "pnpm", "audit", "--prod", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }));
  } catch (error) {
    if (error.stdout) return JSON.parse(String(error.stdout));
    throw error;
  }
}

assertNoVulnerableEchartsLinesSeries();
const report = readAudit();
const vulnerabilities = Object.values(report.advisories || {}).map((item) => ({
  name: item.module_name,
  severity: item.severity
}));
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
