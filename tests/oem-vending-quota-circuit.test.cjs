const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20260917160000_oem_vending_quota_circuit.sql',
), 'utf8');

assert.match(migration, /create table if not exists public\.oem_vending_circuits/i);
assert.match(migration, /status text not null[^;]+check \(status in \('ready', 'blocked'\)\)/i);
assert.match(migration, /blocked_until timestamptz not null/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /auth\.role\(\)\) = 'service_role'/i);
assert.match(migration, /revoke all on table public\.oem_vending_circuits from anon, authenticated/i);
assert.match(migration, /grant all on table public\.oem_vending_circuits to service_role/i);
assert.match(migration, /create or replace function public\.claim_oem_vending_probe/i);
assert.match(migration, /security definer/i);
assert.match(migration, /blocked_until <= p_now/i);
assert.match(migration, /grant execute on function public\.claim_oem_vending_probe[^;]+to service_role/i);

console.log('OEM vending quota circuit migration contract passed.');
