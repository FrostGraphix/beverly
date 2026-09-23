const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const auth = read('backend/wallet/src/plugins/auth.ts');
const routes = read('backend/wallet/src/routes/admin.ts');
const service = read('backend/wallet/src/services/staff-password-change.ts');
const router = read('apps/admin/src/router/index.ts');
const store = read('apps/admin/src/stores/auth.ts');
const login = read('apps/admin/src/views/Login.vue');
const migration = read('supabase/migrations/20260923120000_staff_temporary_password_pipeline.sql');
const view = read('apps/admin/src/views/PasswordChange.vue');

assert.match(migration, /password_reset_required boolean not null default false/);
assert.match(migration, /password_changed_at timestamptz/);
assert.match(migration, /password_session_id text/);
assert.match(auth, /passwordResetRequired:\s*\(staffRow as any\)\.password_reset_required/);
assert.match(auth, /tokenAllowedAfterPasswordChange\(token, \(staffRow as any\)\.password_changed_at/);
assert.match(routes, /fastify\.post\('\/password-change'/);
assert.match(routes, /password_reset_required:\s*true/);
assert.match(service, /password_reset_required:\s*false/);
assert.match(router, /path:\s*'\/password-change'/);
assert.match(router, /auth\.user\?\.password_reset_required/);
assert.match(store, /password_reset_required:\s*boolean/);
assert.match(store, /rotateSession/);
assert.match(login, /password_reset_required/);
assert.match(view, /\/api\/v1\/admin\/password-change/);
assert.match(view, /evaluateVendorPassword/);

console.log('admin temporary-password flow contract passed');
