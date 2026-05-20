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
assert(vercel.crons.some((cron) => cron.path === "/api/cron/consumption-sync" && cron.schedule === "0 0,6,12,18 * * *"));
assert(api.includes("CRON_SECRET"), "cron secret check missing");
assert(api.includes("runRefreshJob"), "refresh runner missing");
assert(api.includes("writeDailyMeterRows"), "refresh runner must store daily meter rows");
assert(api.includes("runConsumptionSync"), "smart consumption sync missing");

console.log(JSON.stringify({
  crons: vercel.crons.length,
  status: "cron config passed"
}, null, 2));
