const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const sharedVat = read('packages/tokens/index.js');
assert.match(sharedVat, /VENDING_VAT_BASIS_POINTS\s*=\s*750/);
assert.match(sharedVat, /energyAmountMinor\s*=\s*Math\.round\(\(grossAmountMinor \* 10000\) \/ \(10000 \+ vatRateBasisPoints\)\)/);
assert.match(sharedVat, /vatAmountMinor\s*=\s*grossAmountMinor - energyAmountMinor/);

const vat = read('backend/wallet/src/services/vending-vat.ts');
assert.match(vat, /from '@beverly\/tokens'/);
assert.match(vat, /calculateVendingVatBreakdown/);
assert.doesNotMatch(vat, /Math\.round/);

const tokenEngine = read('backend/wallet/src/services/token-engine.ts');
assert.match(tokenEngine, /calculateVendingVatBreakdown/);
assert.match(tokenEngine, /env\.VENDING_VAT_BASIS_POINTS/);
assert.match(tokenEngine, /resolveVatRateBasisPoints/);
assert.match(tokenEngine, /previewPurchaseWithPolicy/);
assert.match(tokenEngine, /const units = naira \/ t\.basePricePerKwh/);
assert.match(tokenEngine, /energyAmountMinor: vat\.energyAmountMinor/);
assert.match(tokenEngine, /taxAmountMinor: vat\.vatAmountMinor/);
assert.match(tokenEngine, /units: Number\(units\.toFixed\(4\)\)/);

const migration = read('supabase/migrations/20260619120000_vending_vat_inclusive_breakdown.sql');
assert.match(migration, /energy_amount_minor bigint/);
assert.match(migration, /vat_amount_minor bigint/);
assert.match(migration, /vat_rate_basis_points integer/);
assert.match(migration, /10750/);

const policyMigration = read('supabase/migrations/20260624100000_phase7_data_governance.sql');
assert.match(policyMigration, /create table if not exists public\.vat_policies/);
assert.match(policyMigration, /approved_by <> submitted_by/);
assert.match(policyMigration, /00000000-0000-0000-0000-000000000000/);

const vatPolicy = read('backend/wallet/src/services/vat-policy.ts');
assert.match(vatPolicy, /different finance checker/);
assert.match(vatPolicy, /Only pending VAT policies can be approved/);

const vending = read('backend/wallet/src/services/vending.ts');
assert.match(vending, /energy_amount_minor: preview\.energyAmountMinor/);
assert.match(vending, /vat_amount_minor: preview\.taxAmountMinor/);
assert.match(vending, /amountMinor: preview\.energyAmountMinor/);
assert.match(vending, /vatAmountMinor: preview\.taxAmountMinor/);

const customerPurchase = read('backend/wallet/src/services/customer-purchase.ts');
assert.match(customerPurchase, /energy_amount_minor: preview\.energyAmountMinor/);
assert.match(customerPurchase, /vat_amount_minor: preview\.taxAmountMinor/);
assert.match(customerPurchase, /netMinor: preview\.energyAmountMinor/);

const paymentTransactions = read('backend/wallet/src/services/payment-transactions.ts');
assert.match(paymentTransactions, /amountMinor: energyAmountMinor/);
assert.match(paymentTransactions, /vatAmountMinor/);
assert.match(paymentTransactions, /vatRateBasisPoints/);
assert.doesNotMatch(paymentTransactions, /previewPurchaseWithPolicy/);

const vendorVend = read('apps/vendor/src/views/Vend.vue');
assert.match(vendorVend, /Energy value/);
assert.match(vendorVend, /vatRateBasisPoints/);

const customerBuy = read('apps/customer/src/views/BuyToken.vue');
assert.match(customerBuy, /Energy value/);
assert.match(customerBuy, /vatRateBasisPoints/);

const receipts = [
  read('apps/vendor/src/lib/receipts.ts'),
  read('apps/customer/src/lib/receipts.ts'),
  read('apps/admin/src/lib/receipts.ts'),
].join('\n');
assert.match(receipts, /Energy Value/);
assert.match(receipts, /vat_rate_basis_points/);
assert.doesNotMatch(receipts, /units_kwh\)\.toFixed\([123]\)/);

const unitDisplays = [
  read('apps/vendor/src/lib/format.ts'),
  read('apps/customer/src/lib/format.ts'),
  read('apps/customer/src/views/ReceiptDetail.vue'),
  read('apps/admin/src/views/Purchases.vue'),
  read('backend/wallet/src/services/customer-purchase.ts'),
  read('backend/wallet/src/services/notifications.ts'),
].join('\n');
assert.doesNotMatch(unitDisplays, /units(?:_kwh)?[^\n]*toFixed\([123]\)/);

const reports = read('apps/admin/src/views/Reports.vue');
assert.match(reports, /VAT collected/);

const referenceApi = read('api/reference.js');
assert.match(referenceApi, /calculateVendingVatBreakdown\(amtMinor\)/);
assert.match(referenceApi, /unitsKwh = Number\(\(\(vat\.energyAmountMinor \/ 100\) \/ tariffNairaPerKwh\)\.toFixed\(4\)\)/);

const smokeToken = read('tools/smoke-credit-token.cjs');
assert.match(smokeToken, /energyAmountMinor \* \(10000 \+ vatRateBasisPoints\)/);
assert.match(reports, /energyRevenueMinor/);

const reportRoute = read('backend/wallet/src/routes/admin.ts');
assert.match(reportRoute, /energy_revenue_minor/);
assert.match(reportRoute, /vat_minor/);
assert.match(reportRoute, /energyRevenueMinor: 0/);
assert.match(reportRoute, /fastify\.get\('\/vat-policies'/);
assert.match(reportRoute, /fastify\.post\('\/vat-policies'/);
assert.match(reportRoute, /fastify\.post\('\/vat-policies\/:id\/approve'/);
assert.match(reportRoute, /vat_policy\.submitted/);
assert.match(reportRoute, /vat_policy\.approved/);

const vatEnv = read('backend/wallet/src/config/env.ts');
assert.match(vatEnv, /VENDING_VAT_BASIS_POINTS/);

const operationsSurfaces = [
  read('apps/vendor/src/views/Transactions.vue'),
  read('apps/customer/src/views/ReceiptDetail.vue'),
  read('apps/customer/src/views/Disputes.vue'),
  read('apps/vendor/src/views/Disputes.vue'),
  read('apps/admin/src/views/CustomerDetail.vue'),
  read('apps/admin/src/views/VendorDetail.vue'),
  read('apps/admin/src/views/Disputes.vue'),
].join('\n');
assert.match(operationsSurfaces, /Energy value/);
assert.match(operationsSurfaces, /VAT/);

console.log('vending VAT contract ok');
