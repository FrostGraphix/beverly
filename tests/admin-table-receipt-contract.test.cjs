"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

for (const file of [
  "apps/admin/src/views/CustomerDetail.vue",
  "apps/admin/src/views/Vending.vue",
  "apps/admin/src/views/Purchases.vue",
  "apps/admin/src/views/Support.vue",
]) {
  const source = read(file);
  assert(source.includes("Table view"), `${file} must expose table view.`);
  assert(!source.includes("List view"), `${file} must not expose list view.`);
}

const vending = read("apps/admin/src/views/Vending.vue");
assert(vending.includes("POLL_INTERVAL_MS = 5_000"), "Vending monitor must update automatically.");
assert(!vending.includes(">Refresh</button>"), "Vending monitor must not require manual refresh.");

for (const file of [
  "apps/admin/src/lib/receipts.ts",
  "apps/customer/src/lib/receipts.ts",
  "apps/vendor/src/lib/receipts.ts",
]) {
  const source = read(file);
  assert(source.includes("background:#fff") || source.includes("background: #fff"), `${file} must use white receipts.`);
  assert(source.includes("#16a34a"), `${file} must use Beverly green accents.`);
  assert(source.includes("#eef7f0"), `${file} must use the shared preview canvas.`);
}

console.log("admin-table-receipt-contract ok");
