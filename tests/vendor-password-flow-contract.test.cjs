const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const resetView = read('apps/vendor/src/views/ResetPassword.vue');
const passwordView = read('apps/vendor/src/views/PasswordChange.vue');
const loginView = read('apps/vendor/src/views/Login.vue');
const vendorRoutes = read('backend/wallet/src/routes/vendor.ts');
const routePolicy = read('backend/wallet/src/contracts/route-policy.ts');
const sessionGateMigration = read('supabase/migrations/20260912143000_vendor_password_rls_session_gate.sql');

assert.match(resetView, /delete sanitizedQuery\.token/);
assert.match(resetView, /router\.replace\(\{ query: sanitizedQuery \}\)/);
assert.match(passwordView, /safeVendorRedirect/);
assert.match(loginView, /safeVendorRedirect/);
assert.doesNotMatch(loginView, /auth\/v1\/token\?grant_type=password/);
assert.match(vendorRoutes, /phone:\s+z\.string\(\)\.trim\(\)\.min\(8\)\.max\(32\)\.optional\(\)/);
assert.match(vendorRoutes, /const credentials = body\.email[\s\S]+\{ phone: identifier, password: body\.password \}/);
assert.match(vendorRoutes, /password_session_id: sessionId/);
assert.match(vendorRoutes, /password_reset_required: recoveringPasswordReset \? false/);
assert.match(vendorRoutes, /session_binding_failed/);
assert.match(vendorRoutes, /fastify\.post\('\/auth\/email\/login', \{[\s\S]{0,160}rateLimit: \{ max: 10, timeWindow: '15 minutes' \}/);
assert.match(routePolicy, /post\('\/api\/v1\/vendor\/auth\/email\/login'\)/);
assert.match(sessionGateMigration, /password_reset_required is not true/);
assert.match(sessionGateMigration, /password_session_id = \(select auth\.jwt\(\) ->> 'session_id'\)/);
assert.match(sessionGateMigration, /password_changed_at is null/);
assert.match(sessionGateMigration, /drop policy if exists "vendor users read own"/);
assert.match(vendorRoutes, /current: z\.string\(\)\.min\([^\n]+\.max\(200\)/);
assert.match(vendorRoutes, /next:\s+z\.string\(\)\.min\([^\n]+\.max\(128\)/);

console.log('vendor-password-flow-contract: ok');
