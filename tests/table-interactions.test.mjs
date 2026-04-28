import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFormSeed, pageNumbers, paginateRows, rowActionButtons, searchRows, sortRows, totalPages } from "../src/services/table-helpers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "reference-route-manifest.json"), "utf8"));
const accountRoute = manifest.find((route) => route.hash === "#/management/account");
const tokenRoute = manifest.find((route) => route.hash === "#/token-record/credit-token-record");
const rows = [
  { customerId: "470005343091", meterId: "470005343091", stationId: "TUNGA", customerName: "ALI MUHAMMAD", tariffId: "RESIDENTIAL", communicationWay: "LoraWan", ctRatio: "1", remark: "", createTime: "2026-04-28", updateTime: "2026-04-28" },
  { customerId: "470005342689", meterId: "470005342689", stationId: "MUSHA", customerName: "HARUNA ADAMU", tariffId: "RESIDENTIAL", communicationWay: "LoraWan", ctRatio: "1", remark: "", createTime: "2026-04-27", updateTime: "2026-04-27" },
  { customerId: "12301", meterId: "47005346144", stationId: "0001", customerName: "test", tariffId: "123", communicationWay: "LoraWan", ctRatio: "", remark: "", createTime: "2025-07-21", updateTime: "2025-07-21" }
];

assert.strictEqual(searchRows(accountRoute, rows, "TUNGA").length, 1);
assert.strictEqual(searchRows(accountRoute, rows, "").length, 3);
assert.strictEqual(sortRows(accountRoute, rows, "asc")[0].customerId, "12301");
assert.strictEqual(sortRows(accountRoute, rows, "desc")[0].customerId, "470005343091");
assert.strictEqual(paginateRows(rows, 1, 2).length, 2);
assert.strictEqual(paginateRows(rows, 2, 2).length, 1);
assert.strictEqual(totalPages(21, 10), 3);
assert.deepStrictEqual(pageNumbers(2, 5), [1, 2, 3]);
assert.deepStrictEqual(rowActionButtons(accountRoute), ["Edit", "Delete"]);
assert.deepStrictEqual(rowActionButtons(tokenRoute), ["Print"]);

const formSeed = createFormSeed(accountRoute, "Edit", rows[0]);
assert.strictEqual(formSeed.customerId, "470005343091");
assert.strictEqual(formSeed.stationId, "TUNGA");

console.log(JSON.stringify({
  searched: searchRows(accountRoute, rows, "TUNGA").length,
  pages: totalPages(21, 10),
  accountActions: rowActionButtons(accountRoute).length,
  tokenActions: rowActionButtons(tokenRoute).length,
  status: "table interactions passed"
}, null, 2));
