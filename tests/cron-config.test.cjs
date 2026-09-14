"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const api = fs.readFileSync(path.join(root, "api", "reference.js"), "utf8");

assert(Array.isArray(vercel.crons), "crons missing");
assert.strictEqual(vercel.crons.length, new Set(vercel.crons.map((cron) => cron.path)).size, "cron paths must be unique");
assert(vercel.crons.some((cron) => cron.path === "/api/cron/refresh-hot" && cron.schedule === "0 6 * * *"));
assert(vercel.crons.some((cron) => cron.path === "/api/cron/refresh-hourly" && cron.schedule === "0 12 * * *"));
assert(vercel.crons.some((cron) => cron.path === "/api/cron/refresh-daily" && cron.schedule === "0 23 * * *"));
assert(vercel.crons.some((cron) => cron.path === "/api/cron/refresh-backfill" && cron.schedule === "0 18 * * *"));
assert(vercel.crons.some((cron) => cron.path === "/api/cron/consumption-sync" && cron.schedule === "0 3 * * *"));
assert.strictEqual(vercel.env?.DATABASE_QUOTA_MB, "500", "database quota must be explicit");
assert.strictEqual(vercel.env?.DATABASE_QUOTA_WARN_PERCENT, "70", "database warning gate must preserve thirty-percent headroom");
assert.strictEqual(vercel.env?.DATABASE_QUOTA_BACKFILL_PAUSE_PERCENT, "75", "database backfill gate must preserve twenty-five-percent headroom");
assert.strictEqual(vercel.env?.DATABASE_QUOTA_HARD_STOP_PERCENT, "80", "database hard-stop gate must preserve twenty-percent headroom");
assert.strictEqual(vercel.env?.CONSUMPTION_HOT_RETENTION_DAYS, "90", "hot ingestion window must match retention");
assert.strictEqual(vercel.env?.RAW_HOT_WINDOW_DAYS, "90", "hot read window must match retention");
assert.strictEqual(vercel.env?.CONSUMPTION_SYNC_PAGE_SIZE, "500", "sync page size must stay bounded");
assert.strictEqual(vercel.env?.CONSUMPTION_SYNC_INCREMENTAL_MAX_PAGES, "50", "incremental catchup budget must be explicit");
assert(vercel.crons.some((cron) => cron.path === "/api/cron/archive-readings" && cron.schedule === "0 1 * * *"), "archive sweep must run nightly before retention");
assert(vercel.crons.some((cron) => cron.path === "/api/cron/governance-daily" && cron.schedule === "0 0 * * *"), "governance cleanup must run nightly");
assert(api.includes("CRON_SECRET"), "cron secret check missing");
assert(api.includes("runRefreshJob"), "refresh runner missing");
assert(api.includes("writeDailyMeterRows"), "refresh runner must store daily meter rows");
assert(api.includes("runConsumptionSync"), "smart consumption sync missing");
assert(api.includes("[consumption-sync-start]"), "consumption sync start logs missing");
assert(api.includes("[consumption-sync-done]"), "consumption sync completion logs missing");
assert(api.includes("[consumption-sync-error]"), "consumption sync failure logs missing");

console.log(JSON.stringify({
  crons: vercel.crons.length,
  status: "cron config passed"
}, null, 2));
