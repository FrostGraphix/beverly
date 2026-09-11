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
assert(vercel.crons.some((cron) => cron.path === "/api/cron/consumption-sync" && cron.schedule === "*/15 * * * *"));
assert.strictEqual(vercel.env?.DATABASE_QUOTA_MB, "500", "database quota must be explicit");
assert.strictEqual(vercel.env?.DATABASE_QUOTA_WARN_PERCENT, "75", "database warning gate must be explicit");
assert.strictEqual(vercel.env?.DATABASE_QUOTA_BACKFILL_PAUSE_PERCENT, "85", "database backfill gate must be explicit");
assert.strictEqual(vercel.env?.DATABASE_QUOTA_HARD_STOP_PERCENT, "90", "database hard-stop gate must be explicit");
assert.strictEqual(vercel.env?.CONSUMPTION_HOT_RETENTION_DAYS, "120", "hot ingestion window must match retention");
assert(vercel.crons.some((cron) => cron.path === "/api/cron/archive-readings" && cron.schedule === "5 * * * *"), "archive sweep must refresh current coverage hourly");
assert(api.includes("CRON_SECRET"), "cron secret check missing");
assert(api.includes("runRefreshJob"), "refresh runner missing");
assert(api.includes("writeDailyMeterRows"), "refresh runner must store daily meter rows");
assert(api.includes("runConsumptionSync"), "smart consumption sync missing");

console.log(JSON.stringify({
  crons: vercel.crons.length,
  status: "cron config passed"
}, null, 2));
