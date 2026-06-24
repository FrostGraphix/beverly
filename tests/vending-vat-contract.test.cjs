const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const vat = read('backend/wallet/src/services/vending-vat.ts');
assert.match(vat, /VENDING_VAT_BASIS_POINTS\s*=\s*750/);
assert.match(vat, /calculateVendingVatBreakdown/);
assert.match(vat, /grossAmountMinor/);
assert.match(vat, /energyAmountMinor/);
assert.match(vat, /vatAmountMinor/);

const tokenEngine = read('backend/wallet/src/services/token-engine.ts');
assert.match(tokenEngine, /calculateVendingVatBreakdown/);
assert.match(tokenEngine, /env\.VENDING_VAT_BASIS_POINTS/);
assert.match(tokenEngine, /const units = naira \/ t\.basePricePerKwh/);
assert.match(tokenEngine, /energyAmountMinor: vat\.energyAmountMinor/);
assert.match(tokenEngine, /taxAmountMinor: vat\.vatAmountMinor/);

const migration = read('supabase/migrations/20260619120000_vending_vat_inclusive_breakdown.sql');
assert.match(migration, /energy_amount_minor bigint/);
assert.match(migration, /vat_amount_minor bigint/);
assert.match(migration, /vat_rate_basis_points integer/);
assert.match(migration, /10750/);

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
assert.match(paymentTransactions, /amountMinor: preview\.energyAmountMinor/);
assert.match(paymentTransactions, /vatAmountMinor: preview\.taxAmountMinor/);

const vendorVend = read('apps/vendor/src/views/Vend.vue');
assert.match(vendorVend, /Energy value/);
assert.match(vendorVend, /VAT \(7\.5%\)/);

const customerBuy = read('apps/customer/src/views/BuyToken.vue');
assert.match(customerBuy, /Energy value/);
assert.match(customerBuy, /VAT \(7\.5%\)/);

const receipts = [
  read('apps/vendor/src/lib/receipts.ts'),
  read('apps/customer/src/lib/receipts.ts'),
  read('apps/admin/src/lib/receipts.ts'),
].join('\n');
assert.match(receipts, /Energy Value/);
assert.match(receipts, /VAT \(7\.5%\)/);

const reports = read('apps/admin/src/views/Reports.vue');
assert.match(reports, /VAT collected/);
assert.match(reports, /energyRevenueMinor/);

const reportRoute = read('backend/wallet/src/routes/admin.ts');
assert.match(reportRoute, /energy_revenue_minor/);
assert.match(reportRoute, /vat_minor/);
assert.match(reportRoute, /energyRevenueMinor: 0/);

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
