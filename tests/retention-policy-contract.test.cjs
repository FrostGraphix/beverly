"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const governance = require("../backend/src/services/data-governance");
const supabase = require("../backend/src/services/supabase-service");

const policy = governance.retentionPolicy();
assert.deepEqual(policy, {
  hotReadingDays: 90,
  cacheDays: 1,
  snapshotDays: 14,
  exportDays: 180,
  printDays: 365,
  importDays: 365,
  writeConfirmationDays: 730,
  automationDeliveryDays: 90
});

const plan = governance.governancePlan();
assert.equal(plan.cadence, "daily at 00:00 UTC via Vercel Cron");

const vercel = JSON.parse(read("vercel.json"));
assert.equal(vercel.env.CONSUMPTION_HOT_RETENTION_DAYS, "90");
assert.equal(vercel.env.RAW_HOT_WINDOW_DAYS, "90");
assert.equal(vercel.env.DATA_GOVERNANCE_ENABLED, "true");
assert.equal(vercel.env.CACHE_RETENTION_DAYS, "1");
assert.equal(vercel.env.SNAPSHOT_RETENTION_DAYS, "14");
assert.equal(vercel.env.EXPORT_RETENTION_DAYS, "180");
assert.equal(vercel.env.PRINT_RETENTION_DAYS, "365");
assert.equal(vercel.env.IMPORT_RETENTION_DAYS, "365");
assert.equal(vercel.env.WRITE_CONFIRMATION_RETENTION_DAYS, "730");
assert.equal(vercel.env.AUTOMATION_DELIVERY_RETENTION_DAYS, "90");
assert(vercel.crons.some((cron) => cron.path === "/api/cron/governance-daily" && cron.schedule === "0 0 * * *"));

const syncService = read("backend/src/services/consumption-sync-service.js");
const consumptionStore = read("backend/src/services/consumption-store.js");
assert.match(syncService, /CONSUMPTION_HOT_RETENTION_DAYS, 90/);
assert.match(consumptionStore, /RAW_HOT_WINDOW_DAYS \|\| 90/);
assert.doesNotMatch(consumptionStore, /20260812170000_raw_retention_120d\.sql/);

const migration = read("supabase/migrations/20260914120000_retention_policy_alignment.sql");
assert.match(migration, /create or replace function public\.run_consumption_retention/);
assert.match(migration, /prune_archived_daily_meter_readings\([\s\S]*interval '90 days'/);
assert.match(migration, /where jobname in \([\s\S]*nightly-database-retention-cleanup[\s\S]*prune-archived-daily-meter-readings/);
assert.match(migration, /'run-consumption-retention'/);
assert.doesNotMatch(migration, /delete from public\.daily_meter_readings/i);
assert.doesNotMatch(migration, /job_id\s*:=\s*18/i);
const appCleanup = migration.match(/create or replace function public\.cleanup_app_retention\(\)[\s\S]*?\$\$;/i)?.[0] || "";
assert(appCleanup);
assert.doesNotMatch(appCleanup, /delete from public\.audit_logs/i);
assert.doesNotMatch(appCleanup, /delete from public\.import_jobs/i);
assert.match(migration, /cache_retention_days integer default 1/);
assert.match(migration, /snapshot_retention_days integer default 14/);

const runbook = read("docs/DATA_GOVERNANCE_RUNBOOK.md");
assert.match(runbook, /Exports: 180 days/);
assert.match(runbook, /export job metadata and stored export artifacts/i);

const original = {
  serviceConfigured: supabase.serviceConfigured,
  restRequest: supabase.restRequest,
  deleteStorageObjects: supabase.deleteStorageObjects
};
const calls = [];
process.env.DATA_GOVERNANCE_ENABLED = "true";
supabase.serviceConfigured = () => true;
supabase.restRequest = async (pathname, options = {}) => {
  calls.push({ pathname, options });
  if (pathname.startsWith("/export_jobs?select=")) {
    return [{ id: "11111111-1111-4111-8111-111111111111", storage_bucket: "exports", storage_path: "reports/old.csv" }];
  }
  if (pathname.startsWith("/print_jobs?select=")) return [];
  return [];
};
supabase.deleteStorageObjects = async (bucket, objectPaths) => {
  calls.push({ bucket, objectPaths });
  return { bucket, paths: objectPaths };
};

(async () => {
  try {
    const result = await governance.runRetentionCleanup({ now: new Date("2026-09-14T00:00:00Z") });
    const exportsResult = result.results.find((entry) => entry.table === "export_jobs");
    assert.equal(exportsResult.deleted, 1);
    assert.equal(exportsResult.storageDeleted, 1);
    assert(calls.some((call) => call.bucket === "exports" && call.objectPaths?.includes("reports/old.csv")));
    assert(calls.some((call) => call.pathname?.startsWith("/export_jobs?id=in.")));

    calls.length = 0;
    supabase.deleteStorageObjects = async () => {
      throw new Error("storage unavailable");
    };
    await assert.rejects(
      () => governance.runRetentionCleanup({ now: new Date("2026-09-14T00:00:00Z") }),
      /storage unavailable/
    );
    assert(!calls.some((call) => call.pathname?.startsWith("/export_jobs?id=in.")));
    console.log("retention policy contract passed");
  } finally {
    Object.assign(supabase, original);
    delete process.env.DATA_GOVERNANCE_ENABLED;
  }
})().catch((error) => {
  Object.assign(supabase, original);
  console.error(error);
  process.exit(1);
});
