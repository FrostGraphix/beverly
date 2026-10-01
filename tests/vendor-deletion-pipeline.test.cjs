const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const route = fs.readFileSync(path.join(root, 'backend/wallet/src/routes/admin.ts'), 'utf8');
const page = fs.readFileSync(path.join(root, 'apps/admin/src/views/Vendors.vue'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260924170000_vendor_deletion_pipeline.sql'),
  'utf8',
);

assert.match(route, /admin_soft_delete_vendor/);
assert.match(route, /auth\.admin\.signOut\(authUserId, 'global'\)/);
assert.match(route, /auth\.admin\.deleteUser\(authUserId/);
assert.match(route, /vendor\.deleted/);
assert.match(route, /confirmation/i);

assert.match(page, /deleteConfirmation/);
assert.match(page, /Type the vendor name/i);
assert.match(page, /disable-confirm/);

assert.match(migration, /create or replace function public\.admin_soft_delete_vendor/i);
assert.match(migration, /update public\.vendor_users[\s\S]*status = 'disabled'/i);
assert.match(migration, /update public\.wallets[\s\S]*status = 'closed'/i);
assert.match(migration, /delete from public\.vendor_mfa_sessions/i);
assert.match(migration, /delete from public\.vendor_mfa_recovery_codes/i);
assert.match(migration, /revoke all on function public\.admin_soft_delete_vendor/i);
assert.match(migration, /grant execute on function public\.admin_soft_delete_vendor[\s\S]*to service_role/i);

console.log('vendor deletion pipeline contract passed');
