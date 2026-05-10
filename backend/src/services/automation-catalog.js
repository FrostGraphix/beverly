"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { serviceConfigured } = require("./supabase-service");
const { snapshotsEnabled, snapshotSchedule } = require("./snapshot-service");
const { storeEnabled } = require("./consumption-store");
const { refreshTargets } = require("./refresh-targets");

const root = path.resolve(__dirname, "..", "..", "..");
const vercelConfigPath = path.join(root, "vercel.json");
const packageJsonPath = path.join(root, "package.json");
const workflowsDir = path.join(root, ".github", "workflows");

function safeJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function workflowExists(name) {
  try {
    return fs.existsSync(path.join(workflowsDir, name));
  } catch {
    return false;
  }
}

function packageScripts() {
  return safeJson(packageJsonPath, {}).scripts || {};
}

function vercelCrons() {
  return safeJson(vercelConfigPath, {}).crons || [];
}

function cronMap() {
  return new Map(vercelCrons().map((entry) => [entry.path, entry.schedule]));
}

function item({
  key,
  title,
  lane,
  mode,
  status,
  source,
  owner = "platform",
  trigger,
  command = "",
  schedule = "",
  endpoint = "",
  notes = ""
}) {
  return {
    key,
    title,
    lane,
    mode,
    status,
    owner,
    source,
    trigger,
    command,
    schedule,
    endpoint,
    notes
  };
}

function buildAutomationCatalog() {
  const scripts = packageScripts();
  const crons = cronMap();
  const snapshotEnabled = snapshotsEnabled();
  const supabaseReady = serviceConfigured();
  const consumptionReady = storeEnabled();
  const refreshCount = refreshTargets("all").length;
  const snapshotCount = snapshotSchedule().length;

  return [
    item({
      key: "refresh-hot",
      title: "Hot data refreshes",
      lane: "Live Refresh",
      mode: "cron",
      status: crons.has("/api/cron/refresh-hot") ? "ready" : "missing",
      source: "vercel.json",
      trigger: "Every 5 minutes",
      schedule: crons.get("/api/cron/refresh-hot") || "",
      endpoint: "/api/cron/refresh-hot",
      notes: "Keeps dashboard panels, charts, stations, tariffs, and token records warm."
    }),
    item({
      key: "refresh-hourly",
      title: "Hourly data refreshes",
      lane: "Live Refresh",
      mode: "cron",
      status: crons.has("/api/cron/refresh-hourly") ? "ready" : "missing",
      source: "vercel.json",
      trigger: "Hourly",
      schedule: crons.get("/api/cron/refresh-hourly") || "",
      endpoint: "/api/cron/refresh-hourly",
      notes: "Refreshes customer, account, meter, and rolling daily meter reads."
    }),
    item({
      key: "refresh-daily",
      title: "Daily report refreshes",
      lane: "Live Refresh",
      mode: "cron",
      status: crons.has("/api/cron/refresh-daily") ? "ready" : "missing",
      source: "vercel.json",
      trigger: "Daily",
      schedule: crons.get("/api/cron/refresh-daily") || "",
      endpoint: "/api/cron/refresh-daily",
      notes: "Runs daily consumption sync and report pulls."
    }),
    item({
      key: "refresh-backfill",
      title: "Backfill refresh loops",
      lane: "Live Refresh",
      mode: "cron",
      status: crons.has("/api/cron/refresh-backfill") ? "ready" : "missing",
      source: "vercel.json",
      trigger: "Every 30 minutes",
      schedule: crons.get("/api/cron/refresh-backfill") || "",
      endpoint: "/api/cron/refresh-backfill",
      notes: "Advances historical station backfill in bounded pages."
    }),
    item({
      key: "refresh-targets",
      title: "Refresh target orchestration",
      lane: "Live Refresh",
      mode: "policy",
      status: refreshCount > 0 ? "ready" : "missing",
      source: "backend/src/services/refresh-targets.js",
      trigger: `${refreshCount} target definitions`,
      notes: "Central cadence map for hot, hourly, daily, and backfill pulls."
    }),
    item({
      key: "snapshots",
      title: "Snapshot capture policies",
      lane: "Live Refresh",
      mode: "policy",
      status: snapshotEnabled && supabaseReady ? "ready" : "conditional",
      source: "backend/src/services/snapshot-service.js",
      trigger: `${snapshotCount} policy windows`,
      endpoint: "/api/system/snapshot-schedule",
      notes: "Stores time-bounded operational snapshots when Supabase session storage is active."
    }),
    item({
      key: "consumption-persistence",
      title: "Consumption row persistence",
      lane: "Live Refresh",
      mode: "storage",
      status: consumptionReady ? "ready" : "conditional",
      source: "backend/src/services/consumption-store.js",
      trigger: "DailyDataMeter reads",
      endpoint: "/api/system/consumption-store",
      notes: "Upserts station, meter, and reading date records into Supabase."
    }),
    item({
      key: "import-logging",
      title: "Import job logging",
      lane: "Operations Ledger",
      mode: "logging",
      status: "ready",
      source: "backend/src/services/storage-adapter.js",
      trigger: "Import writes",
      endpoint: "/api/local/importJobs/read",
      notes: "Tracks import file, row count, storage path, and status."
    }),
    item({
      key: "export-logging",
      title: "Export job logging",
      lane: "Operations Ledger",
      mode: "logging",
      status: "ready",
      source: "backend/src/services/storage-adapter.js",
      trigger: "Export writes",
      endpoint: "/api/local/exportJob/create",
      notes: "Stores export metadata and saved artifact location."
    }),
    item({
      key: "print-logging",
      title: "Print job logging",
      lane: "Operations Ledger",
      mode: "logging",
      status: "ready",
      source: "backend/src/services/storage-adapter.js",
      trigger: "Print writes",
      endpoint: "/api/local/printJob/create",
      notes: "Captures receipt generation and rendered storage artifact."
    }),
    item({
      key: "write-confirmation",
      title: "Write confirmation logging",
      lane: "Operations Ledger",
      mode: "logging",
      status: "ready",
      source: "backend/src/services/storage-adapter.js",
      trigger: "Protected live writes",
      notes: "Keeps approval traces for risky live actions."
    }),
    item({
      key: "audit-logs",
      title: "Audit log capture",
      lane: "Operations Ledger",
      mode: "logging",
      status: "ready",
      source: "backend/src/services/storage-adapter.js",
      trigger: "API reads and writes",
      notes: "Captures method, path, outcome, and proxy source."
    }),
    item({
      key: "ci-hardening",
      title: "PR and push CI",
      lane: "Release Guard",
      mode: "ci",
      status: workflowExists("ci.yml") ? "ready" : "missing",
      source: ".github/workflows/ci.yml",
      trigger: "pull_request, push, workflow_dispatch",
      notes: "Runs build, typecheck, contracts, services, security, and hardening audit."
    }),
    item({
      key: "smoke-monitoring",
      title: "Hourly smoke monitoring",
      lane: "Release Guard",
      mode: "ci",
      status: workflowExists("monitoring-smoke.yml") ? "ready" : "missing",
      source: ".github/workflows/monitoring-smoke.yml",
      trigger: "Hourly cron and manual dispatch",
      notes: "Runs preview and production smoke when target URLs exist."
    }),
    item({
      key: "log-review",
      title: "Manual log review",
      lane: "Release Guard",
      mode: "manual",
      status: scripts["logs:review"] ? "ready" : "missing",
      source: "tools/production-log-review.cjs",
      trigger: "Operator run",
      command: "npm run logs:review",
      notes: "Flags auth failures, schema drift, fallback usage, and leaked secrets."
    }),
    item({
      key: "env-validation",
      title: "Manual env validation",
      lane: "Release Guard",
      mode: "manual",
      status: scripts["security:check"] && scripts["security:review:production"] ? "ready" : "missing",
      source: "tools/production-env-check.cjs",
      trigger: "Operator run",
      command: "npm run security:check",
      notes: "Checks JWT, CORS, write approval guard, and token presence."
    }),
    item({
      key: "manual-backfill",
      title: "Manual backfill runs",
      lane: "Release Guard",
      mode: "manual",
      status: scripts["consumption:backfill"] ? "ready" : "missing",
      source: "tools/consumption-backfill.cjs",
      trigger: "Operator run",
      command: "npm run consumption:backfill",
      notes: "Rehydrates historical daily consumption pages with retry and progress state."
    }),
    item({
      key: "uptime-smoke",
      title: "Manual uptime smoke",
      lane: "Release Guard",
      mode: "manual",
      status: scripts["smoke:vercel"] ? "ready" : "missing",
      source: "tools/vercel-smoke.cjs",
      trigger: "Operator run",
      command: "npm run smoke:vercel",
      notes: "Verifies health, core reads, and write guard from a target URL."
    })
  ];
}

function summarize(items) {
  const summary = {
    total: items.length,
    ready: 0,
    conditional: 0,
    missing: 0,
    manual: 0,
    cron: 0,
    ci: 0,
    logging: 0
  };

  for (const entry of items) {
    if (summary[entry.status] !== undefined) summary[entry.status] += 1;
    if (summary[entry.mode] !== undefined) summary[entry.mode] += 1;
  }

  return summary;
}

function groupByLane(items) {
  const lanes = new Map();
  for (const entry of items) {
    if (!lanes.has(entry.lane)) lanes.set(entry.lane, []);
    lanes.get(entry.lane).push(entry);
  }
  return Array.from(lanes.entries()).map(([lane, entries]) => ({
    lane,
    entries
  }));
}

function automationReport() {
  const items = buildAutomationCatalog();
  return {
    generatedAt: new Date().toISOString(),
    direction: "Operational Command",
    polish: "Executive utility",
    summary: summarize(items),
    lanes: groupByLane(items),
    items
  };
}

module.exports = {
  automationReport,
  buildAutomationCatalog
};
