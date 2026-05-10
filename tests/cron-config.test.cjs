"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const api = fs.readFileSync(path.join(root, "api", "reference.js"), "utf8");

assert(Array.isArray(vercel.crons), "crons missing");
assert(vercel.crons.some((cron) => cron.path === "/api/cron/refresh-hot" && cron.schedule === "*/5 * * * *"));
assert(vercel.crons.some((cron) => cron.path === "/api/cron/refresh-hourly" && cron.schedule === "0 * * * *"));
assert(vercel.crons.some((cron) => cron.path === "/api/cron/refresh-daily" && cron.schedule === "0 23 * * *"));
assert(vercel.crons.some((cron) => cron.path === "/api/cron/refresh-backfill" && cron.schedule === "*/30 * * * *"));
assert(api.includes("CRON_SECRET"), "cron secret check missing");
assert(api.includes("runRefreshJob"), "refresh runner missing");
assert(api.includes("writeDailyMeterRows"), "refresh runner must store daily meter rows");

console.log(JSON.stringify({
  crons: vercel.crons.length,
  status: "cron config passed"
}, null, 2));
