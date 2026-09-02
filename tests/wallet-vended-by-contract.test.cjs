"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");
const admin = read("backend/wallet/src/routes/admin.ts");
const vending = read("backend/wallet/src/services/vending.ts");
const receipts = read("apps/admin/src/lib/receipts.ts");
const vendorReceipts = read("apps/vendor/src/lib/receipts.ts");
const customerReceipts = read("apps/customer/src/lib/receipts.ts");
const purchases = read("apps/admin/src/views/Purchases.vue");
const monitor = read("apps/admin/src/views/Vending.vue");
const reports = read("backend/wallet/src/routes/admin-reports.ts");
const consumption = read("apps/admin/src/views/Consumption.vue");
const migration = read("supabase/migrations/20260901143000_purchase_operator_receipt_identity.sql");

assert.match(admin, /enrichPurchaseRows/);
assert.match(admin, /vended_by_name/);
assert.match(admin, /vendor_business_name/);
assert.match(admin, /wallet_name/);
assert.match(admin, /Vendor Portal Vending/);
assert.match(vending, /eq\('auth_user_id', input\.vendorUserId\)/);
assert.match(migration, /add column if not exists vended_by text/);
assert.match(receipts, /field\('Wallet', row\.wallet_name/);
assert.match(receipts, /row\.vendor_business_name/);
assert.match(vendorReceipts, /row\.vendor_business_name/);
assert.match(customerReceipts, /vendorIdentity/);
assert.doesNotMatch(receipts, /row\.station_id \|\| row\.station_name \|\| 'TUNGA'/);
assert.match(purchases, /<th>Vended By<\/th>/);
assert.match(monitor, /<th>Vended By<\/th>/);
assert.match(monitor, /WalletTablePagination/);
assert.match(monitor, /v-model:pageSize="pageSize"/);
assert.match(reports, /'vendor_name', 'vendor_business_name', 'customer_name'/);
assert.match(consumption, /WalletDataViewSwitch/);
assert.match(consumption, /WalletTablePagination/);
assert.match(consumption, /stationSummaryPageSize/);

console.log("wallet vended-by contract passed");
