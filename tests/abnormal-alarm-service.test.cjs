const assert = require("node:assert/strict");
const {
  conditionActive,
  deriveAbnormalAlarms,
  summarizeAbnormalAlarms,
} = require("../backend/src/services/abnormal-alarm-service");

assert.equal(conditionActive(false), true);
assert.equal(conditionActive(true), false);
assert.equal(conditionActive("Open"), true);
assert.equal(conditionActive("Low"), true);
assert.equal(conditionActive("Closed"), false);
assert.equal(conditionActive(1), true);
assert.equal(conditionActive(0), false);

const rows = deriveAbnormalAlarms([
  {
    stationId: "MUSHA",
    meterId: "M-1",
    total1: 18,
    usage1: 0,
    relayOpen: true,
    magneticInterference: true,
    batteryLow: false,
    terminalCoverOpen: "Closed",
  },
  {
    station_id: "KYAKALE",
    meter_id: "M-2",
    total1: -1,
    battery_low: false,
    current_reverse: false,
  },
  {
    meterId: "M-3",
    total1: 22,
    relayOpen: "Open",
    coverOpen: "Open",
    currentUnbalance: "Unbalance",
    power: 1.2,
  },
], "TUNGA");

assert.deepEqual(rows.map((row) => row.alarmKey), [
  "batteryLow",
  "noData",
  "relayOpen",
  "coverOpen",
  "currentUnbalance",
]);
assert.equal(rows[0].usage1, 0);
assert.equal(rows[1].stationId, "KYAKALE");
assert.equal(rows[1].meterId, "M-2");
assert.equal(rows[2].stationId, "TUNGA");
assert.equal(rows.filter((row) => row.meterId === "M-2").length, 1);
assert.equal(rows.find((row) => row.alarmKey === "coverOpen").severity, "critical");
assert.equal(rows.find((row) => row.alarmKey === "relayOpen").bypassRisk, "high");
assert.equal(rows.find((row) => row.alarmKey === "relayOpen").evidence.observedLoad, true);
assert.deepEqual(summarizeAbnormalAlarms(rows), {
  total: 5,
  critical: 2,
  warning: 3,
  bypassCandidates: 1,
  affectedMeters: 3,
  affectedStations: 3,
});

const observedRows = deriveAbnormalAlarms([{
  meterId: "470005342689",
  stationId: "TUNGA",
  collectionDate: "2026-04-28 09:00:00",
  totalEnergy: 128.6,
  lastHourUsage: 1.2,
  creditBalance: 49.8,
  maximumDemand: 8.3,
  power: 1.1,
  relayStatus: "Open",
  terminalCover: "Closed",
  upperOpen: "No",
}]);
assert.equal(observedRows.length, 1);
assert.equal(observedRows[0].alarmKey, "relayOpen");
assert.equal(observedRows[0].total1, 128.6);
assert.equal(observedRows[0].currentDate, "2026-04-28 09:00:00");

console.log("abnormal alarm service tests passed");
