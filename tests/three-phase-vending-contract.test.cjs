const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('supabase/migrations/20260525121500_wallet_meter_phase_vending.sql');
assert.match(migration, /alter table if exists public\.customer_meters[\s\S]*meter_type/i);
assert.match(migration, /alter table if exists public\.purchase_orders[\s\S]*meter_type/i);
assert.match(migration, /alter table if exists public\.account_bindings[\s\S]*meter_type/i);
assert.match(migration, /purchase_orders_meter_type_check/i);

const customerMetersMigration = read('supabase/migrations/20260525133000_customer_meters_phase_table.sql');
assert.match(customerMetersMigration, /create table if not exists public\.customer_meters/);
assert.match(customerMetersMigration, /meter_type text/);
assert.match(customerMetersMigration, /service role manages customer meters/);

const customerPurchase = read('backend/wallet/src/services/customer-purchase.ts');
assert.match(customerPurchase, /meter_type:\s*meterType/);
assert.match(customerPurchase, /isThreePhase:\s*meter\.isThreePhase/);
assert.match(customerPurchase, /meterType:\s*meterTypeFromInfo\(meter\)/);
assert.match(customerPurchase, /Selected meter phase does not match the live meter record/);

const vending = read('backend/wallet/src/services/vending.ts');
assert.match(vending, /export function meterTypeFromInfo/);
assert.match(vending, /meter_type:\s*meterType/);
assert.match(vending, /meterType:\s*row\.meter_type/);

const webhooks = read('backend/wallet/src/routes/webhooks.ts');
assert.match(webhooks, /isThreePhase:\s*meter\.isThreePhase/);
assert.match(webhooks, /meter_type:\s*meterType/);

const onboardMeter = read('apps/customer/src/views/OnboardMeter.vue');
assert.match(onboardMeter, /meter_type:\s*meterType\.value/);
assert.match(onboardMeter, /Meter phase/);

const buyToken = read('apps/customer/src/views/BuyToken.vue');
assert.match(buyToken, /meterTypeLabel/);
assert.match(buyToken, /preview\.meterType/);

const monitor = read('apps/admin/src/views/Vending.vue');
assert.match(monitor, /meter_type/);
assert.match(monitor, /<th>Phase<\/th>/);

const purchases = read('apps/admin/src/views/Purchases.vue');
assert.match(purchases, /meter_type/);
assert.match(purchases, /header: 'Phase'/);
assert.match(purchases, /fMeterType/);

const vendorVend = read('apps/vendor/src/views/Vend.vue');
assert.match(vendorVend, /isThreePhase/);
assert.match(vendorVend, /Phase/);

const customerRoutes = read('backend/wallet/src/routes/customer.ts');
assert.match(customerRoutes, /shapeReceipt/);
assert.match(customerRoutes, /meter_type/);

const disputes = read('backend/wallet/src/services/disputes.ts');
assert.match(disputes, /withPurchaseContexts/);
assert.match(disputes, /meter_type/);

const privacy = read('backend/wallet/src/services/data-privacy.ts');
assert.match(privacy, /customer_meters'\)\.select\('meter_id, meter_type/);
assert.match(privacy, /purchase_orders'\)\.select\('id, meter_id, meter_type/);

console.log('three-phase vending contract ok');
