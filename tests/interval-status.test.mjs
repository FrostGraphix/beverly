import assert from "node:assert/strict";
import { normalizeHourlyStatus, normalizeIntervalStatus, normalizeIntervalTableStatus } from "../src/services/interval-status.mjs";

for (const value of [null, undefined, "", " ", "Normal", "normal", "Closed", "false", false, 0, "0", "No", "OK", "okay"]) {
  assert.equal(normalizeHourlyStatus(value), "Normal", `${String(value)} should be Normal`);
}

for (const value of ["Check", "Open", "true", true, 1, "1", "Yes", "Abnormal", "Error", "failed", "failure", "Tamper", "low", "reverse", "unbalance"]) {
  assert.equal(normalizeHourlyStatus(value), "Check", `${String(value)} should be Check`);
}

assert.equal(normalizeIntervalStatus("Closed"), normalizeHourlyStatus("Closed"));
assert.equal(normalizeIntervalStatus("Open"), normalizeHourlyStatus("Open"));
assert.equal(normalizeHourlyStatus("No"), "Normal", "Hourly No should remain Normal");
assert.equal(normalizeHourlyStatus("Closed"), "Normal", "Hourly Closed should remain Normal");
assert.equal(normalizeHourlyStatus("Open"), "Check", "Hourly Open should remain Check");
assert.equal(normalizeIntervalStatus("unexpected-api-value"), "Check");
assert.equal(normalizeIntervalTableStatus("Normal"), "Check");
assert.equal(normalizeIntervalTableStatus("Check"), "Normal");
assert.equal(normalizeIntervalTableStatus("Closed"), "Check");
assert.equal(normalizeIntervalTableStatus("Open"), "Normal");
assert.equal(normalizeIntervalTableStatus("No"), "Check", "Main table No should stay inverted");

console.log("interval-status ok");
