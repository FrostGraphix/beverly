"use strict";

const assert = require("assert");
const {
  snapshotPolicy,
  snapshotSchedule
} = require("../backend/src/services/snapshot-service");

const dashboard = snapshotPolicy("/api/dashboard/readPanelGroup");
const token = snapshotPolicy("/api/token/creditTokenRecord/readMore");
const consumption = snapshotPolicy("/api/DailyDataMeter/readHourly");
const schedule = snapshotSchedule();

assert.strictEqual(dashboard.type, "dashboard");
assert.strictEqual(dashboard.seconds, 300);
assert.strictEqual(token.type, "token-record");
assert.strictEqual(token.seconds, 900);
assert.strictEqual(consumption.type, "consumption");
assert(schedule.some((entry) => entry.type === "customer-risk"));
assert(schedule.some((entry) => entry.type === "daily-report"));

console.log(JSON.stringify({
  policies: schedule.length,
  status: "snapshot service passed"
}, null, 2));
