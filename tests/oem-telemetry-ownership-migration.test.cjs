const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261007120000_oem_telemetry_ownership.sql'), 'utf8').toLowerCase();
const rollback = fs.readFileSync(path.join(root, 'supabase/rollbacks/20261007120000_oem_telemetry_ownership.rollback.sql'), 'utf8').toLowerCase();

assert.match(migration, /before insert or update on public\.oem_telemetry_readings/);
assert.match(migration, /m\.oem_installation_id\s*=\s*new\.oem_installation_id/);
assert.match(migration, /m\.serial\s*=\s*new\.external_meter_id/);
assert.match(migration, /m\.site_id\s*=\s*new\.external_site_id/);
assert.match(migration, /m\.customer_external_id\s*=\s*new\.external_customer_id/);
assert.match(migration, /raise exception/);
assert.match(rollback, /drop trigger if exists/);
assert.match(rollback, /drop function if exists/);
console.log('OEM telemetry ownership migration contract passed');
