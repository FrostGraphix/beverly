"use strict";

const assert = require("assert");
const { localDateKey, previousDayRange, refreshTargets } = require("../backend/src/services/refresh-targets");

const hot = refreshTargets("hot", new Date("2026-05-07T10:00:00Z"));
const hourly = refreshTargets("hourly", new Date("2026-05-07T10:00:00Z"));
const midnight = refreshTargets("hourly", new Date("2026-05-07T00:00:00Z"));
const dailySyncTarget = refreshTargets("daily", new Date("2026-05-07T23:00:00Z"))
  .find((target) => target.name === "daily-consumption-sync-tunga");
const backfillTarget = refreshTargets("backfill", new Date("2026-05-07T23:00:00Z"))
  .find((target) => target.name === "historical-consumption-backfill-tunga");

assert(hot.some((target) => target.name === "dashboard-panels"));
assert(hot.every((target) => ["5m", "15m"].includes(target.cadence)));
assert(hourly.some((target) => target.name === "accounts"));
assert(hourly.every((target) => target.path !== "/api/DailyDataMeter/read" || ("FROM" in target.payload && "TO" in target.payload)));
assert(!hourly.some((target) => target.name === "long-nonpurchase"));
assert(midnight.some((target) => target.name === "long-nonpurchase"));
assert(midnight.some((target) => target.name === "daily-consumption-sync-tunga"));
assert.strictEqual(dailySyncTarget.payload.pageSize, 500);
assert.strictEqual(dailySyncTarget.paginate, true);
assert.strictEqual(backfillTarget.payload.pageSize, 500);
assert.strictEqual(backfillTarget.payload.FROM, "2025-01-01");
assert.strictEqual(backfillTarget.paginate, true);
assert.strictEqual(backfillTarget.maxPages, 2);
assert.strictEqual(localDateKey(new Date("2026-05-07T23:00:00Z")), "2026-05-08");
assert.deepStrictEqual(previousDayRange(new Date("2026-05-07T23:00:00Z")), {
  from: "2026-05-07",
  to: "2026-05-07"
});
assert(refreshTargets("all").length > hourly.length);

console.log(JSON.stringify({
  hot: hot.length,
  hourly: hourly.length,
  midnight: midnight.length,
  status: "refresh targets passed"
}, null, 2));
