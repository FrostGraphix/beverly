"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function assertMarkers(file, markers) {
  const source = read(file);
  for (const marker of markers) {
    assert.ok(source.includes(marker), `${file} missing ${marker}`);
  }
}

function main() {
  const customerApi = read("apps/customer/src/lib/api.ts");
  const vendorApi = read("apps/vendor/src/lib/api.ts");
  const vendorLogin = read("apps/vendor/src/views/Login.vue");
  const vendorVite = read("apps/vendor/vite.config.ts");
  const customerVite = read("apps/customer/vite.config.ts");
  const vendorRouter = read("apps/vendor/src/router/index.ts");
  const customerRouter = read("apps/customer/src/router/index.ts");
  const walletCss = read("packages/tokens/wallet.css");
  const rootPackage = JSON.parse(read("package.json"));

  assertMarkers("backend/wallet/src/routes/admin.ts", [
    "fastify.get('/me'",
    "fastify.get('/access'",
    "fastify.put('/access/roles/:roleKey/permissions'",
    "fastify.post('/access/users'",
    "fastify.patch('/access/users/:userId/role'",
    "fastify.get('/stations'",
    "fastify.get('/vendor-applications'",
    "fastify.post('/vendors'",
    "fastify.get('/vendors'",
    "fastify.patch('/vendors/:id/status'",
    "fastify.get('/vendors/:id'",
    "fastify.get('/vendors/:id/wallet'",
    "fastify.get('/vendors/:id/transactions'",
    "fastify.get('/vendors/:id/funding'",
    "fastify.get('/vendors/:id/staff'",
    "fastify.get('/funding/pending'",
    "fastify.get('/funding/history'",
    "fastify.post('/funding/reconcile-approved'",
    "fastify.post('/funding/:id/approve'",
    "fastify.post('/funding/:id/reject'",
    "fastify.get('/wallets'",
    "fastify.get('/wallets/summary'",
    "fastify.get('/wallets/:id'",
    "fastify.get('/wallets/:id/ledger'",
    "fastify.patch('/wallets/:id/status'",
    "fastify.patch('/wallets/:id/limits'",
    "fastify.get('/customers'",
    "fastify.get('/customers/summary'",
    "fastify.get('/customers/:id'",
    "fastify.get('/customers/:id/wallet'",
    "fastify.get('/customers/:id/purchases'",
    "fastify.get('/customers/:id/funding'",
    "fastify.patch('/customers/:id/status'",
    "fastify.get('/purchases'",
    "fastify.get('/vending'",
    "fastify.get('/purchases/summary'",
    "fastify.get('/purchases/:id'",
    "fastify.post('/purchases/:id/resend-sms'",
    "fastify.get('/meter-orders/stats'",
    "fastify.get('/meter-orders'",
    "fastify.get('/meter-orders/:id'",
    "fastify.patch('/meter-orders/:id'",
    "fastify.get('/fraud'",
    "fastify.patch('/fraud/:id/resolve'",
    "fastify.get('/disputes'",
    "fastify.get('/disputes/:id'",
    "fastify.patch('/disputes/:id'",
    "fastify.get('/refunds'",
    "fastify.post('/refunds'",
    "fastify.post('/refunds/:id/approve'",
    "fastify.post('/refunds/:id/reject'",
    "fastify.get('/settlement'",
    "fastify.get('/reconciliation'",
    "fastify.post('/reconciliation/run'",
    "fastify.get('/audit'",
    "fastify.get('/audit/:id'",
    "fastify.get('/audit/export.csv'",
    "fastify.get('/security-events'",
    "fastify.get('/audit/summary'",
    "fastify.get('/reports/overview'",
    "fastify.get('/reports/export.csv'",
    "fastify.get('/feature-flags'",
    "fastify.post('/feature-flags'",
    "fastify.patch('/feature-flags/:key'",
    "fastify.get('/privacy/deletions'",
    "fastify.patch('/privacy/deletions/:id'",
    "fastify.get('/consumption'",
    "fastify.get('/consumption/meters'",
    "fastify.post('/consumption/refresh'",
  ]);

  assertMarkers("backend/wallet/src/routes/staff-mfa.ts", [
    "fastify.get('/status'",
    "fastify.post('/setup/start'",
    "fastify.post('/setup/verify'",
    "fastify.post('/setup/reset'",
    "fastify.post('/challenge/verify'",
    "fastify.post('/recovery/regenerate'",
    "fastify.post('/disable'",
  ]);

  assertMarkers("backend/wallet/src/routes/vendor.ts", [
    "fastify.get('/me'",
    "fastify.get('/vend-credential/status'",
    "fastify.post('/vend-credential'",
    "fastify.get('/mfa/status'",
    "fastify.post('/mfa/setup/start'",
    "fastify.post('/mfa/setup/verify'",
    "fastify.post('/mfa/setup/reset'",
    "fastify.post('/mfa/challenge/verify'",
    "fastify.post('/mfa/disable'",
    "fastify.post('/password-change'",
    "fastify.get('/wallet'",
    "fastify.get('/wallet/ledger'",
    "fastify.post('/funding/paystack'",
    "fastify.post('/funding/bank-transfer'",
    "fastify.get('/funding'",
    "fastify.post('/vend/preview'",
    "fastify.post('/vend/live-plan'",
    "fastify.post('/vend'",
    "fastify.get('/transactions'",
    "fastify.get('/receipts/:orderId'",
    "fastify.post('/logout'",
    "fastify.post('/disputes'",
    "fastify.get('/disputes'",
    "fastify.get('/disputes/:id'",
    "fastify.post('/disputes/:id/messages'",
    "fastify.get('/settlement'",
  ]);

  assertMarkers("backend/wallet/src/routes/customer.ts", [
    "fastify.post('/auth/signup'",
    "fastify.post('/auth/email/signup'",
    "fastify.post('/auth/email/login'",
    "fastify.post('/auth/login'",
    "fastify.post('/auth/recover'",
    "fastify.post('/auth/verify'",
    "fastify.get('/me'",
    "fastify.patch('/me'",
    "fastify.post('/logout'",
    "fastify.post('/kyc/tier1'",
    "fastify.post('/kyc/tier2/nin'",
    "fastify.get('/meters'",
    "fastify.post('/meters'",
    "fastify.delete('/meters/:id'",
    "fastify.get('/wallet'",
    "fastify.get('/wallet/ledger'",
    "fastify.post('/wallet/fund'",
    "fastify.post('/purchase/preview'",
    "fastify.post('/purchase'",
    "fastify.post('/purchase/step-up-verify'",
    "fastify.get('/transactions'",
    "fastify.get('/funding'",
    "fastify.get('/receipts'",
    "fastify.get('/receipts/:id'",
    "fastify.post('/receipts/:id/resend-sms'",
    "fastify.post('/meter-orders'",
    "fastify.get('/meter-orders'",
    "fastify.get('/meter-orders/:id'",
    "fastify.post('/meter-orders/:id/verify-payment'",
    "fastify.post('/disputes'",
    "fastify.get('/disputes'",
    "fastify.get('/disputes/:id'",
    "fastify.post('/disputes/:id/messages'",
    "fastify.post('/privacy/data-export'",
    "fastify.post('/privacy/delete-account'",
    "fastify.get('/notifications'",
    "fastify.post('/notifications/read-all'",
    "fastify.patch('/notifications/:id/read'",
    "fastify.get('/notifications/preferences'",
    "fastify.put('/notifications/preferences'",
  ]);

  for (const apiSource of [customerApi, vendorApi]) {
    assert.match(apiSource, /function normalizeBaseUrl/);
    assert.match(apiSource, /export const API_BASE = BASE/);
    assert.match(apiSource, /function unwrapEnvelope/);
    assert.match(apiSource, /function portalBasePath/);
    assert.match(apiSource, /const loginPath = `\$\{portalBasePath\(\)\}login`/);
    assert.match(apiSource, /if \(res\.status === 401\) handleUnauthorized\(\)/);
    assert.match(apiSource, /Idempotency-Key/);
  }

  assert.match(customerApi, /clearCustomerToken\(\)/);
  assert.match(vendorApi, /clearVendorSession\(\)/);
  assert.match(vendorLogin, /import \{ API_BASE \} from '..\/lib\/api'/);
  assert.match(vendorVite, /VITE_VENDOR_BASE/);
  assert.match(vendorVite, /dist\/wallet-vendor/);
  assert.match(customerVite, /VITE_CUSTOMER_BASE/);
  assert.match(customerVite, /dist\/wallet-customer/);
  assert.match(customerVite, /start_url: base/);
  assert.match(customerVite, /navigateFallback: assetPath\('index\.html'\)/);
  assert.match(vendorRouter, /function portalHistoryBase/);
  assert.match(customerRouter, /function portalHistoryBase/);
  assert.match(vendorRouter, /createWebHistory\(portalHistoryBase\(import\.meta\.env\.BASE_URL\)\)/);
  assert.match(customerRouter, /createWebHistory\(portalHistoryBase\(import\.meta\.env\.BASE_URL\)\)/);
  assert.match(walletCss, /\.bw-scrim\s*\{[\s\S]*pointer-events:\s*none;/);
  assert.match(walletCss, /\.bw-scrim\.open\s*\{[\s\S]*pointer-events:\s*auto;/);
  assert.match(rootPackage.scripts.build, /@beverly\/admin-app build/);
  assert.match(rootPackage.scripts.build, /@beverly\/vendor-app build/);
  assert.match(rootPackage.scripts.build, /@beverly\/customer-app build/);
  assert.match(rootPackage.scripts["test:wallet"], /wallet-app-route-contract\.test\.cjs/);

  console.log(JSON.stringify({
    status: "wallet app route contract passed",
    coverage: ["admin", "vendor", "customer"]
  }, null, 2));
}

main();
