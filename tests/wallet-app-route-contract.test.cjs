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
  const adminRouter = read("apps/admin/src/router/index.ts");
  const vendorRouter = read("apps/vendor/src/router/index.ts");
  const customerRouter = read("apps/customer/src/router/index.ts");
  const adminMeterOrders = read("apps/admin/src/views/MeterOrders.vue");
  const adminMeterOrderCreate = read("apps/admin/src/views/MeterOrderCreate.vue");
  const vendorMeterOrders = read("apps/vendor/src/views/MeterOrders.vue");
  const vendorWallet = read("apps/vendor/src/views/Wallet.vue");
  const vendorFundingHistory = read("apps/vendor/src/views/FundingHistory.vue");
  const vendorStatement = read("apps/vendor/src/views/Statement.vue");
  const vendorTransactions = read("apps/vendor/src/views/Transactions.vue");
  const vendorShell = read("apps/vendor/src/components/AppShell.vue");
  const adminShell = read("apps/admin/src/components/AppShell.vue");
  const vendorExport = read("apps/vendor/src/lib/export.ts");
  const vendorMeterOrderCreate = read("apps/vendor/src/views/MeterOrderCreate.vue");
  const meterOrdersService = read("backend/wallet/src/services/meter-orders.ts");
  const customerMeterOrders = read("backend/wallet/src/routes/customer.ts");
  const walletCss = read("packages/tokens/wallet.css");
  const rootPackage = JSON.parse(read("package.json"));

  assertMarkers("backend/wallet/src/routes/admin.ts", [
    "dev.console",
    "fastify.get('/me'",
    "fastify.get('/access'",
    "fastify.post('/access/roles'",
    "fastify.patch('/access/roles/:roleKey'",
    "fastify.delete('/access/roles/:roleKey'",
    "fastify.put('/access/roles/:roleKey/permissions'",
    "fastify.post('/access/users'",
    "fastify.patch('/access/users/:userId/role'",
    "fastify.patch('/access/users/:userId/station'",
    "fastify.patch('/access/users/:userId/suspension'",
    "fastify.post('/access/users/:userId/reset-password'",
    "fastify.post('/access/users/:userId/revoke-sessions'",
    "access.role.created",
    "access.role.updated",
    "access.role.deleted",
    "fastify.get('/stations'",
    "fastify.get('/vendor-applications'",
    "fastify.delete('/vendor-applications/:id'",
    "fastify.post('/vendors'",
    "fastify.get('/vendors'",
    "fastify.get('/vendors/summary'",
    "fastify.delete('/vendors/:id'",
    "fastify.patch('/vendors/:id/status'",
    "fastify.get('/vendors/:id'",
    "fastify.get('/vendors/:id/wallet'",
    "fastify.get('/vendors/:id/transactions'",
    "fastify.get('/vendors/:id/funding'",
    "fastify.get('/vendors/:id/staff'",
    "fastify.post('/meter-orders'",
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
    "fastify.delete('/customers/:id'",
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
    "adminReportsRoutes",
    "fastify.get('/feature-flags'",
    "fastify.post('/feature-flags'",
    "fastify.patch('/feature-flags/:key'",
    "fastify.get('/privacy/deletions'",
    "fastify.patch('/privacy/deletions/:id'",
    "fastify.get('/consumption'",
    "fastify.get('/consumption/meters'",
    "fastify.post('/consumption/refresh'",
    "enforceResourceStation(req, reply)",
    "station_required",
    "overlaps('operating_stations', stationIds)",
    "stationIds: z.array",
    "scopeStations(query, assignedStations)",
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
    "fastify.get('/customers'",
    "fastify.post('/meter-orders'",
    "fastify.get('/meter-orders'",
    "fastify.get('/meter-orders/:id'",
    "fastify.post('/funding/paystack'",
    "fastify.post('/payments/:reference/verify'",
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
    "fastify.post('/payments/:reference/verify'",
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
  const customerRoutes = read("backend/wallet/src/routes/customer.ts");
  assert.match(customerRoutes, /Number\(ps\.data\?\.amount\) !== Number\(\(order as any\)\.amount_minor\)/);
  assert.match(customerRoutes, /payment_amount_mismatch/);
  assert.match(customerRoutes, /if \(!purchaseRows\?\.length\) return \{ receipts: \[\] \}/);

  for (const apiSource of [customerApi, vendorApi]) {
    assert.match(apiSource, /function normalizeBaseUrl/);
    assert.match(apiSource, /export const API_BASE = BASE/);
    assert.match(apiSource, /function unwrapEnvelope/);
    assert.match(apiSource, /function portalBasePath/);
    assert.match(apiSource, /const loginPath = `\$\{portalBasePath\(\)\}login`/);
    assert.match(apiSource, /const refreshed = await refreshAccessToken\(\)/);
    assert.match(apiSource, /if \(res\.status === 401 && shouldRedirectUnauthorized\(path\)\) handleUnauthorized\(\)/);
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
  assert.match(adminRouter, /path: '\/meter-orders'/);
  assert.match(adminRouter, /path: '\/meter-orders\/new'/);
  assert.match(vendorRouter, /function portalHistoryBase/);
  assert.match(customerRouter, /function portalHistoryBase/);
  assert.match(vendorRouter, /path: '\/meter-orders'/);
  assert.match(vendorRouter, /path: '\/meter-orders\/new'/);
  assert.match(vendorRouter, /createWebHistory\(portalHistoryBase\(import\.meta\.env\.BASE_URL\)\)/);
  assert.match(customerRouter, /createWebHistory\(portalHistoryBase\(import\.meta\.env\.BASE_URL\)\)/);
  assert.match(adminMeterOrders, /source_channel/);
  assert.match(adminMeterOrders, /sponsor_mode/);
  assert.match(adminMeterOrders, /vendor_organizations/);
  assert.match(adminMeterOrders, /sourceLabel/);
  assert.match(adminMeterOrders, /New Order/);
  assert.match(adminMeterOrders, /aria-label="Meter order summary"/);
  assert.match(adminMeterOrders, /stats\?\.in_progress/);
  assert.match(adminMeterOrderCreate, /sponsorMode/);
  assert.match(adminMeterOrderCreate, /vendor_wallet/);
  assert.match(adminMeterOrderCreate, /\/api\/v1\/admin\/meter-orders/);
  assert.match(vendorMeterOrders, /\/api\/v1\/vendor\/meter-orders/);
  assert.match(vendorMeterOrders, /sponsor_mode/);
  assert.match(vendorMeterOrders, /aria-label="Meter order summary"/);
  assert.match(vendorMeterOrders, /\['paid', 'assigned', 'dispatched'\]/);
  assert.match(vendorWallet, /aria-label="Wallet summary"/);
  assert.match(vendorWallet, /wallet-stat-grid/);
  assert.match(vendorFundingHistory, /Export CSV/);
  assert.match(vendorFundingHistory, /exportCsv\('beverly-vendor-funding-history', filtered\.value/);
  assert.match(vendorFundingHistory, /:disabled="!filtered\.length"/);
  assert.match(vendorStatement, /aria-label="Statement summary"/);
  assert.match(vendorStatement, /class="bw-t-wrap"/);
  assert.match(vendorStatement, /class="bw-t-cards"/);
  assert.match(vendorStatement, /Export CSV/);
  assert.match(vendorStatement, /exportCsv\('beverly-vendor-statement', batches\.value/);
  assert.match(vendorTransactions, /Export period/);
  assert.match(vendorTransactions, /<option value="1d">Last day<\/option>/);
  assert.match(vendorTransactions, /<option value="7d">Last 7 days<\/option>/);
  assert.match(vendorTransactions, /<option value="30d">Last 30 days<\/option>/);
  assert.match(vendorTransactions, /<option value="all">All time<\/option>/);
  assert.match(vendorTransactions, /has_more/);
  assert.match(vendorTransactions, /exportCsv\(`beverly-vendor-transactions-\$\{exportRange\.value\}`/);
  assert.match(vendorShell, /class="bw-sidebar-foot sidebar-account"/);
  assert.match(vendorShell, /class="sidebar-avatar"/);
  assert.match(vendorShell, /class="bw-btn sidebar-signout"/);
  assert.match(vendorShell, /\? 'Vendor User' : 'Vendor'/);
  assert.match(vendorShell, /ref="navRef"/);
  assert.match(vendorShell, /scrollToActiveLink/);
  assert.match(adminShell, /class="bw-sidebar-foot sidebar-account"/);
  assert.match(adminShell, /class="sidebar-avatar"/);
  assert.match(adminShell, /class="bw-btn sidebar-signout"/);
  assert.match(adminShell, /ref="navRef"/);
  assert.match(adminShell, /scrollToActiveLink/);
  assert.match(walletCss, /\.sidebar-account-card/);
  assert.match(read("backend/wallet/src/routes/vendor.ts"), /period: z\.enum\(\['1d', '7d', '30d', 'all'\]\)/);
  assert.match(read("backend/wallet/src/services/vending.ts"), /\.range\(offset, offset \+ limit - 1\)/);
  assert.match(vendorExport, /text\.replace\(\/"\/g, '""'\)/);
  assert.match(vendorExport, /text\/csv;charset=utf-8/);
  for (const portal of ['admin', 'vendor', 'customer']) {
    const views = path.join(root, 'apps', portal, 'src', 'views');
    for (const file of fs.readdirSync(views).filter((name) => name.endsWith('.vue'))) {
      assert.doesNotMatch(read(path.join('apps', portal, 'src', 'views', file)), />\s*CSV\s*<\/button>/, `${portal}/${file} uses an inconsistent export label`);
    }
  }
  assert.match(vendorMeterOrderCreate, /\/api\/v1\/vendor\/customers/);
  assert.match(vendorMeterOrderCreate, /\/api\/v1\/vendor\/meter-orders/);
  const sponsorMigration = read("supabase/migrations/20260622090000_meter_order_sponsor_mode.sql");
  assert.match(sponsorMigration, /manual_paid/);
  assert.match(sponsorMigration, /vendor_wallet/);
  assert.match(meterOrdersService, /METER_ORDER_TRANSITIONS/);
  assert.match(meterOrdersService, /assertMeterOrderTransition/);
  assert.match(meterOrdersService, /customer_meter_order/);
  assert.match(meterOrdersService, /runIdempotentMeterOrder/);
  assert.match(meterOrdersService, /claimWalletIdempotency/);
  assert.match(meterOrdersService, /completeWalletIdempotency/);
  assert.match(meterOrdersService, /abandonWalletIdempotency/);
  assert.match(meterOrdersService, /deterministicMeterOrderReference\('morda'/);
  assert.doesNotMatch(meterOrdersService, /Date\.now\(\).*Math\.random/);
  assert.match(customerMeterOrders, /assertClientIdempotencyKey/);
  assert.match(customerMeterOrders, /\.eq\('status', 'pending_payment'\)/);
  assert.match(walletCss, /\.bw-scrim\s*\{[\s\S]*pointer-events:\s*none;/);
  assert.match(walletCss, /\.bw-scrim\.open\s*\{[\s\S]*pointer-events:\s*auto;/);
  assert.match(walletCss, /\.bw-t-wrap:has\(~ \.bw-t-cards\)\s*\{\s*display:\s*none;/);
  assert.match(walletCss, /\.bw-t-wrap ~ \.bw-t-cards\s*\{\s*display:\s*block;/);
  assert.match(rootPackage.scripts.build, /@beverly\/admin-app build/);
  assert.match(rootPackage.scripts.build, /@beverly\/vendor-app build/);
  assert.match(rootPackage.scripts.build, /@beverly\/customer-app build/);
  assert.match(rootPackage.scripts["dev-console:user"], /ensure-dev-console-user\.mjs/);
  assert.match(rootPackage.scripts["test:wallet"], /wallet-app-route-contract\.test\.cjs/);

  console.log(JSON.stringify({
    status: "wallet app route contract passed",
    coverage: ["admin", "vendor", "customer"]
  }, null, 2));
}

main();
