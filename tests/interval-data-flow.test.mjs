import assert from "node:assert/strict";
import { hourlyCreateTime, intervalRowMatchesSearch, normalizeDailyMeterRow, sliceIntervalRows } from "../src/services/interval-data-flow.mjs";

const row = normalizeDailyMeterRow({
  serialNumber: "47005308995",
  gateway: "E4-38-19-FF-FE-1A-BE-63",
  collectionDate: "2026-05-10",
  customerAccountId: "CUST-9",
  name: "Amina Bello",
  siteId: "KYAKALE",
  relayStatus: "Closed",
  terminalCover: "Open"
});

assert.equal(row.meterId, "47005308995");
assert.equal(row.gatewayId, "E4-38-19-FF-FE-1A-BE-63");
assert.equal(row.customerId, "CUST-9");
assert.equal(row.customerName, "Amina Bello");
assert.equal(row.stationId, "KYAKALE");
assert.equal(row.relayOpen, "Closed");
assert.equal(row.terminalCoverOpen, "Open");
assert.equal(normalizeDailyMeterRow({ create_time: "2026-05-10 08:31:46" }).createTime, "2026-05-10 08:31:46");
assert.equal(normalizeDailyMeterRow({ currentDate: "2026-05-13 03:27:43" }).createTime, "2026-05-13 03:27:43");
assert.equal(normalizeDailyMeterRow({ collectionTime: "2026-05-13 04:27:43" }).createTime, "2026-05-13 04:27:43");

assert.equal(intervalRowMatchesSearch(row, "amina"), true);
assert.equal(intervalRowMatchesSearch(row, "470053"), true);
assert.equal(intervalRowMatchesSearch(row, "kyakale"), true);
assert.equal(intervalRowMatchesSearch(row, "missing"), false);
assert.deepEqual(sliceIntervalRows([1, 2, 3, 4, 5], 2, 2), [3, 4]);
assert.equal(hourlyCreateTime({ createTime: "2026-05-10 08:31:46", timestamp: "2026-05-10T00:00:00.000Z" }), "2026-05-10 08:31:46");
assert.equal(hourlyCreateTime({ createDate: "2026-05-10", createTime: "2026-05-10 08:31:46" }), "2026-05-10 08:31:46");
assert.equal(hourlyCreateTime({ create_time: "2026-05-10 09:45:00" }), "2026-05-10 09:45:00");
assert.equal(hourlyCreateTime({ createDate: "2026-05-13 03:27:43", timestamp: "2026-05-13T03:00:00.000Z" }), "2026-05-13 03:27:43");
assert.equal(hourlyCreateTime({ collectionTime: "2026-05-13 04:27:43" }), "2026-05-13 04:27:43");
assert.equal(hourlyCreateTime({ currentDate: "2026-05-13 05:27:43" }), "2026-05-13 05:27:43");
assert.equal(hourlyCreateTime({ timestamp: "2026-05-10T00:00:00.000Z", currentDate: "2026-05-10" }), "2026-05-10");

console.log("interval-data-flow ok");
