const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20261005100000_reconcile_canonical_kyc_policy.sql'),
  'utf8',
);

assert.match(migration, /delete from public\.system_settings\s+where key = 'kyc_policy'/i);
assert.match(migration, /from public\.kyc_tier_settings\s+where singleton = true/i);
assert.match(migration, /and w\.kyc_policy_managed/i);
assert.match(migration, /owner_type = 'customer'/i);
assert.match(migration, /owner_type = 'vendor'/i);
assert.doesNotMatch(migration, /alter table public\.kyc_tier_settings/i);

console.log('KYC policy reconciliation contract passed.');
