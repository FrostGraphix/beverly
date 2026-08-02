const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const view = fs.readFileSync(path.join(root, 'apps/vendor/src/views/Consumption.vue'), 'utf8');
const route = fs.readFileSync(path.join(root, 'backend/wallet/src/routes/vendor.ts'), 'utf8');

assert.ok(view.includes('placeholder="Enter meter number"'), 'meter input missing');
assert.ok(view.includes("params.set('meter_id', selectedMeter.value)"), 'meter filter missing');
assert.ok(view.includes('@submit.prevent="searchMeter"'), 'meter search submission missing');
assert.ok(route.includes("fastify.get('/consumption', { preHandler: fastify.requireVendor() }"), 'vendor auth hook missing');
assert.ok(route.includes("error: 'invalid_meter_id'"), 'server meter validation missing');
assert.ok(route.includes("stationsAuthority([actor.stationId])"), 'vendor station boundary missing');

console.log('vendor-consumption-meter-flow ok');
