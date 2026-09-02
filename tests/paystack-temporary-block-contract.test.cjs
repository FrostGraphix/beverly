"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const env = read("backend/wallet/src/config/env.ts");
const vendorRoute = read("backend/wallet/src/routes/vendor.ts");
const customerRoute = read("backend/wallet/src/routes/customer.ts");
const vendorFund = read("apps/vendor/src/views/Fund.vue");
const customerFund = read("apps/customer/src/views/FundWallet.vue");

assert.match(env, /PAYSTACK_PAYMENTS_ENABLED: envBoolean\.default\(false\)/);
assert.match(vendorRoute, /paystack_temporarily_unavailable/);
assert.match(customerRoute, /paystack_temporarily_unavailable/g);
assert.match(vendorFund, /VITE_PAYSTACK_PAYMENTS_ENABLED === 'true'/);
assert.match(vendorFund, /Use bank transfer/);
assert.match(customerFund, /VITE_PAYSTACK_PAYMENTS_ENABLED === 'true'/);
assert.match(customerFund, /Request bank transfer/);
assert.match(vendorFund, /Paystack temporarily unavailable\./);
assert.match(customerFund, /Paystack temporarily unavailable\./);

console.log("paystack temporary block contract passed");
