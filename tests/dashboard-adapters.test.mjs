import assert from "node:assert";
import { buildPurchaseRowsFromPayments } from "../src/services/live-report-adapters.mjs";

const rows = buildPurchaseRowsFromPayments([
  { timestamp: "2026-01-01T10:00:00.000Z", amount: 100 },
  { timestamp: "2026-01-01T11:00:00.000Z", amount: 50 },
  { timestamp: "2026-01-02T10:00:00.000Z", purchaseMoney: 25 }
]);

assert.deepStrictEqual(rows, [
  { collectionDate: "2026-01-01", amount: 150 },
  { collectionDate: "2026-01-02", amount: 25 }
]);

console.log(JSON.stringify({
  rows: rows.length,
  status: "dashboard adapters passed"
}, null, 2));
