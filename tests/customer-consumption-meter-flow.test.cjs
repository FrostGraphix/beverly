const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const view = fs.readFileSync(path.join(root, 'apps/customer/src/views/Consumption.vue'), 'utf8');
const route = fs.readFileSync(path.join(root, 'backend/wallet/src/routes/customer.ts'), 'utf8');

assert.ok(view.includes('placeholder="Enter meter number"'), 'meter input missing');
assert.ok(view.includes("params.set('meter_id', selectedMeter.value)"), 'meter filter missing');
assert.ok(view.includes('@submit.prevent="searchMeter"'), 'meter search submission missing');
assert.ok(route.includes("fastify.get('/consumption', { preHandler: fastify.requireCustomer() }"), 'customer auth hook missing');
assert.ok(route.includes("error: 'invalid_meter_id'"), 'server meter validation missing');
assert.ok(route.includes('metersAuthority(meterIds)'), 'customer meter boundary missing');

console.log('customer-consumption-meter-flow ok');
