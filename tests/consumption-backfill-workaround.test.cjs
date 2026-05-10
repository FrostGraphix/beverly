"use strict";

const assert = require("node:assert");

const {
  dedupeRows,
  filterRowsByRange,
  rowDay,
  rowKey,
  summarizeRows,
} = require("../tools/consumption-live-dataset.cjs");

const stationId = "OGUFA";
const rows = [
  { meterId: "M-2", currentDate: "2026-05-10", total1: 57 },
  { meterId: "M-1", currentDate: "2025-08-02", total1: 11 },
  { meterId: "M-1", currentDate: "2025-08-01", total1: 10 },
  { meterId: "M-1", currentDate: "2025-08-01", total1: 10 },
];

assert.strictEqual(rowDay(rows[0]), "2026-05-10");
assert.strictEqual(rowKey(stationId, rows[0]), "OGUFA|M-2|2026-05-10");

const uniqueRows = dedupeRows(stationId, rows);
assert.strictEqual(uniqueRows.length, 3);
assert.deepStrictEqual(
  uniqueRows.map((row) => row.currentDate),
  ["2025-08-01", "2025-08-02", "2026-05-10"]
);

const filteredRows = filterRowsByRange(uniqueRows, "2025-08-01", "2025-08-31");
assert.strictEqual(filteredRows.length, 2);
assert(filteredRows.every((row) => row.currentDate.startsWith("2025-08")));

assert.deepStrictEqual(summarizeRows(uniqueRows), {
  earliestReadingDate: "2025-08-01",
  latestReadingDate: "2026-05-10",
});

console.log("consumption-backfill-workaround ok");
