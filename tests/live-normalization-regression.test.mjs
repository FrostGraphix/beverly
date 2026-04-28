import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConsumptionStatisticsPayload } from "../src/services/live-report-adapters.mjs";
import { normalizeCollection } from "../src/services/response-normalizers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSample(filename) {
  return JSON.parse(fs.readFileSync(path.join(root, "contracts", "samples", filename), "utf8"));
}

const hourlySample = readSample("api__DailyDataMeter__readHourly.json");
const consumptionSample = readSample("API__PrepayReport__ConsumptionStatistics.json");
const derivedPayload = buildConsumptionStatisticsPayload(hourlySample.body.readings || []);
const derivedCollection = normalizeCollection(derivedPayload);
const capturedCollection = normalizeCollection(consumptionSample.body);

assert.strictEqual(consumptionSample.body.code, 0);
assert(derivedCollection.rows.length > 0);
assert(capturedCollection.rows.length > 0);
assert.strictEqual(capturedCollection.rows[0].collectionDate, derivedCollection.rows[0].collectionDate);
assert.strictEqual(typeof capturedCollection.rows[0].consumption, "number");

console.log(JSON.stringify({
  derivedRows: derivedCollection.rows.length,
  capturedRows: capturedCollection.rows.length,
  status: "live normalization regression passed"
}, null, 2));
