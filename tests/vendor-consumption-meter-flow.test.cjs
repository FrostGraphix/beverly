const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const view = fs.readFileSync(path.join(root, 'apps/vendor/src/views/Consumption.vue'), 'utf8');
const route = fs.readFileSync(path.join(root, 'backend/wallet/src/routes/vendor.ts'), 'utf8');

assert.ok(view.includes('placeholder="Enter meter number"'), 'meter input missing');
assert.ok(view.includes("meter_id: selectedMeter.value"), 'meter filter missing');
assert.ok(view.includes('@submit.prevent="searchMeter"'), 'meter search submission missing');
assert.ok(!view.includes('Site total'), 'vendor consumption must not offer a station-wide Site total view');
assert.ok(!view.includes("type View = 'site' | 'meters'"), 'vendor consumption must not retain site/meter view state');
assert.ok(!view.includes("scope = view.value === 'site' ? 'station' : 'meter'"), 'vendor client must always request meter analytics');
assert.ok(route.includes("fastify.get('/consumption', { preHandler: fastify.requireVendor() }"), 'vendor auth hook missing');
assert.ok(route.includes("error: 'invalid_meter_id'"), 'server meter validation missing');
assert.ok(route.includes("stationsAuthority([actor.stationId])"), 'vendor station boundary missing');
assert.ok(route.includes("error: 'meter_scope_required'"), 'vendor API must reject retired station-wide consumption requests');
assert.ok(!route.includes("scope must be meter | station | cumulative"), 'vendor API must not advertise retired aggregate scopes');

console.log('vendor-consumption-meter-flow ok');
