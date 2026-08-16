"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

for (const file of [
  "apps/admin/src/views/CustomerDetail.vue",
  "apps/admin/src/views/Support.vue",
]) {
  const source = read(file);
  assert(source.includes("Table view"), `${file} must expose table view.`);
  assert(!source.includes("List view"), `${file} must not expose list view.`);
}

for (const file of [
  "apps/admin/src/views/Vending.vue",
  "apps/admin/src/views/Purchases.vue",
]) {
  const source = read(file);
  assert(source.includes("WalletDataViewSwitch"), `${file} must expose shared data views.`);
  assert(source.includes("'table' | 'list'"), `${file} must expose table and list views.`);
  assert(!source.includes("| 'grid'"), `${file} must not expose grid view.`);
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
  assert(source.includes("canonicalReceiptHtml(canonicalReceipt(model))"), `${file} must use the CRM receipt renderer.`);
  assert(source.includes("data-pdf>PDF Export"), `${file} must expose PDF export.`);
  assert(source.includes('class="brm-btn danger" data-close>Cancel'), `${file} must use the red cancel action.`);
  assert(!source.includes("data-print>Print"), `${file} must not expose browser print.`);
}

console.log("admin-table-receipt-contract ok");
