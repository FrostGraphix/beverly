"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const env = read("backend/wallet/src/config/env.ts");
const vendorRoute = read("backend/wallet/src/routes/vendor.ts");
const customerRoute = read("backend/wallet/src/routes/customer.ts");
const webhookRoute = read("backend/wallet/src/routes/webhooks.ts");
const vendorFund = read("apps/vendor/src/views/Fund.vue");
const customerFund = read("apps/customer/src/views/FundWallet.vue");
const vercelConfig = JSON.parse(read("vercel.json"));

// Backend activation remains fail-closed unless production enables it.
assert.match(env, /PAYSTACK_PAYMENTS_ENABLED: envBoolean\.default\(false\)/);
assert.match(vendorRoute, /if \(!env\.PAYSTACK_PAYMENTS_ENABLED\)/);
assert.match(customerRoute, /if \(!env\.PAYSTACK_PAYMENTS_ENABLED\)/g);

// Activated portal builds open Paystack first while retaining bank transfer.
for (const portal of [vendorFund, customerFund]) {
  assert.match(portal, /VITE_PAYSTACK_PAYMENTS_ENABLED === 'true'/);
  assert.match(portal, /ref<Mode>\(PAYSTACK_AVAILABLE \? 'paystack' : 'bank'\)/);
  assert.match(portal, />Bank transfer</);
  assert.doesNotMatch(portal, /Paystack remains paused\./);
}

// Fulfilment still depends on signed webhooks and trusted callbacks.
assert.match(webhookRoute, /verifyWebhookSignature/);
assert.equal(
  vercelConfig.env.PAYSTACK_WEBHOOK_URL,
  "https://acob-beverly.vercel.app/api/v1/webhook/paystack",
);
assert.equal(
  vercelConfig.env.CUSTOMER_FUNDING_CALLBACK_URL,
  "https://acob-beverly.vercel.app/wallet-customer/wallet/fund?payment=return",
);
assert.equal(
  vercelConfig.env.VENDOR_FUNDING_CALLBACK_URL,
  "https://beverly.acoblighting.com/wallet-vendor/wallet/fund?payment=return",
);

console.log("paystack activation contract passed");
