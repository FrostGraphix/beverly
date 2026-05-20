const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const migration = read('supabase/migrations/20260520120000_staff_mfa_foundation.sql');
const service = read('backend/wallet/src/services/staff-mfa.ts');
const routes = read('backend/wallet/src/routes/staff-mfa.ts');
const routeIndex = read('backend/wallet/src/routes/index.ts');
const auth = read('backend/wallet/src/plugins/auth.ts');
const login = read('apps/admin/src/views/Login.vue');
const security = read('apps/admin/src/views/Security.vue');
const api = read('apps/admin/src/lib/api.ts');
const pkg = JSON.parse(read('package.json'));

for (const table of [
  'staff_mfa_factors',
  'staff_mfa_recovery_codes',
  'staff_mfa_sessions',
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`), `missing ${table}`);
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `missing ${table} RLS`);
  assert.match(migration, new RegExp(`wallet service role all staff mfa`), `missing ${table} service policy`);
}

assert.match(migration, /references auth\.users\(id\) on delete cascade/);
assert.match(migration, /staff_mfa_one_active_factor_idx/);
assert.match(migration, /token_hash text not null unique/);

for (const marker of [
  'staffMfaEnrolled',
  'staffMfaSessionVerified',
  'beginStaffMfaReplacement',
  'generateRecoveryCodes',
  'recoveryHash',
  'SESSION_TTL_MS = 12 * 60 * 60 * 1000',
  "surface: 'staff'",
]) {
  assert.ok(service.includes(marker), `service missing ${marker}`);
}

for (const endpoint of [
  '/status',
  '/setup/start',
  '/setup/verify',
  '/setup/reset',
  '/challenge/verify',
  '/recovery/regenerate',
  '/disable',
]) {
  assert.ok(routes.includes(endpoint), `route missing ${endpoint}`);
}

assert.match(routeIndex, /register\(staffMfaRoutes,\s*\{ prefix: '\/api\/v1\/admin\/mfa' \}\)/);
assert.match(routeIndex, /register\(adminRoutes,\s*\{ prefix: '\/api\/v1\/admin'\s*\}\)/);
assert.match(routes, /preHandler: fastify\.requireAuth\(\)/);
assert.doesNotMatch(routes, /preHandler: fastify\.requireStaff\(\)/);

assert.match(auth, /staffMfaEnrolled/);
assert.match(auth, /staffMfaSessionVerified/);
assert.match(auth, /if \(req\.actor\.mfaEnrolled && !req\.actor\.mfaVerified\)/);
assert.match(auth, /error: 'mfa_required'/);

assert.match(api, /handleMfaRequired/);
assert.match(api, /reason', 'mfa_required'/);
assert.match(login, /reasonMfa/);
assert.match(login, /\/api\/v1\/admin\/mfa\/status/);
assert.match(login, /\/api\/v1\/admin\/mfa\/challenge\/verify/);
assert.match(login, /:inputmode="useRecovery \? 'text' : 'numeric'"/);
assert.match(login, /Use a recovery code/);

for (const marker of [
  '/api/v1/admin/mfa/setup/start',
  '/api/v1/admin/mfa/setup/verify',
  '/api/v1/admin/mfa/setup/reset',
  '/api/v1/admin/mfa/recovery/regenerate',
  '/api/v1/admin/mfa/disable',
  'qrcode-generator',
  'Save your recovery codes',
  'Replace authenticator',
]) {
  assert.ok(security.includes(marker), `security UI missing ${marker}`);
}

assert.match(pkg.scripts['test:mfa'], /tests\/admin-staff-mfa-flow\.test\.cjs/);
assert.match(pkg.scripts['test:mfa'], /staff-mfa-runtime\.test\.ts/);

console.log('admin staff MFA contract passed');
