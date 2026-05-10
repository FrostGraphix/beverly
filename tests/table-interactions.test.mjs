import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFormSeed, pageNumbers, paginateRows, routeSortDirection, routeSortPolicy, rowActionButtons, searchRows, sortRows, totalPages } from "../src/services/table-helpers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "reference-route-manifest.json"), "utf8"));
const routeByHash = (hash) => manifest.find((route) => route.hash === hash);
const accountRoute = manifest.find((route) => route.hash === "#/management/account");
const tokenRoute = manifest.find((route) => route.hash === "#/token-record/credit-token-record");
const dlmsRoute = {
  hash: "#/protocol/dlms",
  title: "DLMS",
  actions: ["Sort", "Search", "Reset", "Add", "Import", "Export", "Delete", "Edit", "Cancel", "Confirm"]
};
const remoteSupportReadRoute = {
  hash: "#/remote-support/gprs-tasks",
  title: "GPRS Tasks",
  actions: ["Sort", "Search", "Reset", "Export"]
};
const remoteSupportToolbarTaskRoute = {
  hash: "#/remote-support/gprs-tasks",
  title: "GPRS Tasks",
  columns: ["id", "gatewayId", "status"],
  actions: ["Sort", "Search", "Reset", "Add Task", "Export"]
};
const rows = [
  { customerId: "470005343091", meterId: "470005343091", stationId: "TUNGA", customerName: "ALI MUHAMMAD", tariffId: "RESIDENTIAL", communicationWay: "LoraWan", ctRatio: "1", remark: "", createTime: "2026-04-28", updateTime: "2026-04-28" },
  { customerId: "470005342689", meterId: "470005342689", stationId: "MUSHA", customerName: "HARUNA ADAMU", tariffId: "RESIDENTIAL", communicationWay: "LoraWan", ctRatio: "1", remark: "", createTime: "2026-04-27", updateTime: "2026-04-27" },
  { customerId: "12301", meterId: "47005346144", stationId: "0001", customerName: "test", tariffId: "123", communicationWay: "LoraWan", ctRatio: "", remark: "", createTime: "2025-07-21", updateTime: "2025-07-21" }
];

assert.strictEqual(searchRows(accountRoute, rows, "TUNGA").length, 1);
assert.strictEqual(searchRows(accountRoute, rows, "").length, 3);
assert.strictEqual(sortRows(accountRoute, rows, "asc")[0].customerId, "12301");
assert.strictEqual(sortRows(accountRoute, rows, "desc")[0].customerId, "12301");
assert.strictEqual(routeSortPolicy(accountRoute).fixed, true);
assert.strictEqual(routeSortDirection(accountRoute), "asc");
assert.strictEqual(paginateRows(rows, 1, 2).length, 2);
assert.strictEqual(paginateRows(rows, 2, 2).length, 1);
assert.strictEqual(totalPages(21, 10), 3);
assert.deepStrictEqual(pageNumbers(2, 5), [1, 2, 3]);
assert.deepStrictEqual(rowActionButtons(accountRoute), ["Edit", "Delete"]);
assert.deepStrictEqual(rowActionButtons(tokenRoute), ["Cancel", "Print"]);
assert.deepStrictEqual(rowActionButtons(dlmsRoute), ["Edit", "Delete"]);
assert.deepStrictEqual(rowActionButtons(remoteSupportReadRoute), []);
assert.deepStrictEqual(rowActionButtons(remoteSupportToolbarTaskRoute), []);

const recordRows = [
  { receiptId: 1, createDate: "2026-04-28 09:00:00" },
  { receiptId: 2, createDate: "2026-04-30 09:00:00" },
  { receiptId: 3, createDate: "2026-04-29 09:00:00" }
];
assert.strictEqual(routeSortDirection(tokenRoute), "desc");
assert.strictEqual(sortRows(tokenRoute, recordRows, "asc")[0].receiptId, 2);

const lowPurchaseRoute = routeByHash("#/prepay-report/low-purchase-situation");
assert.strictEqual(sortRows(lowPurchaseRoute, [{ totalUnit: 5.7 }, { totalUnit: 1.4 }, { totalUnit: 10 }], "desc")[0].totalUnit, 1.4);

const longNonpurchaseRoute = routeByHash("#/prepay-report/long-nonpurchase-situation");
assert.strictEqual(sortRows(longNonpurchaseRoute, [{ nonpurchaseDays: 11 }, { nonpurchaseDays: 42 }], "asc")[0].nonpurchaseDays, 42);

const gatewayRoute = routeByHash("#/management/gateway");
assert.strictEqual(sortRows(gatewayRoute, [{ successRate: "92%" }, { successRate: "100%" }], "asc")[0].successRate, "100%");

const formSeed = createFormSeed(accountRoute, "Edit", rows[0]);
assert.strictEqual(formSeed.customerId, "470005343091");
assert.strictEqual(formSeed.stationId, "TUNGA");

const tokenSeed = createFormSeed(tokenRoute, "Cancel", {
  receiptId: 8510,
  customerId: "47005377107",
  customerName: "ABAH MUHAMMED",
  meterId: "47005377107",
  totalUnit: 35,
  totalPaid: 12250,
  token: "6357 5846 8761 4183 8884",
  stationId: "TUNGA"
});
assert.strictEqual(tokenSeed.receiptId, 8510);
assert.strictEqual(tokenSeed.meterId, "47005377107");

console.log(JSON.stringify({
  searched: searchRows(accountRoute, rows, "TUNGA").length,
  pages: totalPages(21, 10),
  accountActions: rowActionButtons(accountRoute).length,
  tokenActions: rowActionButtons(tokenRoute).length,
  status: "table interactions passed"
}, null, 2));
