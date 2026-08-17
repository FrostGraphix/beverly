const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const adminRoutes = read('backend/wallet/src/routes/admin.ts');
const vendorRoutes = read('backend/wallet/src/routes/vendor.ts');
const vendorService = read('backend/wallet/src/services/vending.ts');
const customerService = read('backend/wallet/src/services/customer-purchase.ts');
const vendorDetail = read('apps/admin/src/views/VendorDetail.vue');

assert.match(adminRoutes, /'PATCH \/vendors\/:id': 'wallet\.vendors\.manage'/);
assert.match(adminRoutes, /fastify\.patch\('\/vendors\/:id'/);
assert.match(adminRoutes, /vendor\.details_updated/);
for (const field of ['legalName', 'tradingName', 'contactEmail', 'contactPhone', 'cacNumber', 'tin', 'businessType', 'operatingAddress']) {
  assert.ok(adminRoutes.includes(field), `editable vendor field missing: ${field}`);
}

assert.match(vendorDetail, /Edit vendor details/);
assert.match(vendorDetail, /Save vendor details/);
assert.match(vendorDetail, /\/api\/v1\/admin\/vendors\/\$\{id\}/);
assert.match(vendorDetail, /\/api\/v1\/admin\/vendors\/\$\{id\}\/station/);
assert.match(vendorDetail, /\/api\/v1\/admin\/stations/);

assert.match(vendorService, /vendorStationId: string/);
assert.match(vendorService, /assertStationVendAllowed\(input\.vendorStationId, meter\.stationId\)/);
assert.ok(vendorService.indexOf('assertStationVendAllowed(input.vendorStationId, meter.stationId)') < vendorService.indexOf('createHold({'));
assert.ok(vendorService.indexOf('assertStationVendAllowed(input.vendorStationId, meter.stationId)') < vendorService.indexOf("from('purchase_orders').insert"));
assert.match(vendorService, /input\.meterId,\s*input\.vendorStationId,\s*input\.amountMinor/);
assert.match(vendorRoutes, /vendorStationId: req\.actor!\.stationId/);

assert.match(customerService, /\.select\('status, station_id'\)/);
assert.match(customerService, /assertStationVendAllowed\(approvedMeter\.stationId, meter\.stationId\)/);
assert.ok(customerService.indexOf('assertStationVendAllowed(approvedMeter.stationId, meter.stationId)') < customerService.indexOf('createHold({'));
assert.ok(customerService.indexOf('assertStationVendAllowed(approvedMeter.stationId, meter.stationId)') < customerService.indexOf("from('purchase_orders').insert"));

console.log('admin vendor editing and station vending boundaries passed');
