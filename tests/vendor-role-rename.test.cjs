const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('supabase/migrations/20260714120000_rename_vendor_manager_role.sql');
const onboarding = read('backend/wallet/src/services/vendor-onboarding.ts');
const auth = read('backend/wallet/src/plugins/auth.ts');
const store = read('apps/vendor/src/stores/auth.ts');
const profile = read('apps/vendor/src/views/Profile.vue');
const shell = read('apps/vendor/src/components/AppShell.vue');
const manifest = read('src/data/route-manifest.js');
const reference = read('api/reference.js');

assert.match(migration, /alter column role set default 'vendor'/);
assert.match(migration, /where lower\(role\) in \('vendor_manager', 'vendor-manager'\)/);
assert.match(migration, /jsonb_build_object\('role', 'vendor', 'role_key', 'vendor'\)/);
assert.match(migration, /when 'vendor_manager' then 'vendor'/);
assert.match(migration, /select public\.normalized_role_key\(vu\.role\)/);
assert.match(onboarding, /user_metadata: \{ role: 'vendor'/);
assert.match(onboarding, /role: 'vendor'/);
assert.match(auth, /function normalizeVendorRole/);
assert.match(auth, /role: normalizeVendorRole/);
assert.match(store, /role: 'vendor' \| 'vendor_user'/);
assert.match(profile, /\? 'Vendor User' : 'Vendor'/);
assert.match(shell, /\? 'Vendor User' : 'Vendor'/);
assert.match(manifest, /\["vendor", "vendor-manager", "vendor_manager"\]\.includes\(value\)\) return "vendor"/);
assert.match(reference, /new Set\(\["vendor", "vendor_user"\]\)/);

console.log('vendor role rename contract passed');
