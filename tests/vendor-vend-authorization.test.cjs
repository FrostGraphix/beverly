const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const migration = read('supabase/migrations/20260520121500_vendor_vend_credential.sql');
const service = read('backend/wallet/src/services/vendor-vend-credential.ts');
const tokenEngine = read('backend/wallet/src/services/token-engine.ts');
const vendingService = read('backend/wallet/src/services/vending.ts');
const customerPurchaseService = read('backend/wallet/src/services/customer-purchase.ts');
const walletEnv = read('backend/wallet/src/config/env.ts');
const routes = read('backend/wallet/src/routes/vendor.ts');
const router = read('apps/vendor/src/router/index.ts');
const authStore = read('apps/vendor/src/stores/auth.ts');
const vendAccess = read('apps/vendor/src/views/VendAccess.vue');
const vend = read('apps/vendor/src/views/Vend.vue');
const remoteSend = read('apps/vendor/src/views/RemoteSend.vue');
const pkg = JSON.parse(read('package.json'));

for (const column of [
  'vend_credential_type',
  'vend_credential_hash',
  'vend_credential_salt',
  'vend_credential_set_at',
]) {
  assert.ok(migration.includes(column), `migration missing ${column}`);
}
assert.match(migration, /vendor_users_vend_credential_type_check/);
const pinMigration = read('supabase/migrations/20260812183000_wallet_vending_pin_only.sql');
assert.match(pinMigration, /vend_credential_type is null or vend_credential_type = 'pin'/);

for (const marker of [
  'VendorVendCredentialError',
  'hasVendorVendCredential',
  'validateVendCredential',
  'crypto.scryptSync',
  'crypto.timingSafeEqual',
  'vendorVendCredentialStatus',
  'setVendorVendCredential',
  'verifyVendorVendCredential',
  "logSecurityEvent('vend_credential_set'",
  "logSecurityEvent('vend_credential_failure'",
  "'vend_credential_required'",
  "'invalid_vend_credential'",
]) {
  assert.ok(service.includes(marker), `service missing ${marker}`);
}

assert.match(routes, /fastify\.get\('\/vend-credential\/status'/);
assert.match(routes, /fastify\.post\('\/vend-credential'/);
assert.match(routes, /fastify\.post\('\/vend'/);
assert.match(routes, /fastify\.post\('\/vend', \{ preHandler: fastify\.requireVendor\(\{ requireMfa: false \}\) \}/);
assert.match(routes, /fastify\.post\('\/vend\/preview', \{ preHandler: fastify\.requireVendor\(\{ requireMfa: false \}\) \}/);
assert.match(routes, /fastify\.post\('\/vend\/:purchaseOrderId\/remote-send', \{ preHandler: fastify\.requireVendor\(\{ requireMfa: false \}\) \}/);
assert.doesNotMatch(routes, /Verify two-factor authentication before vending/);
assert.match(routes, /authorization: z\.string\(\)\.regex\(\/\^\\d\{4\}\$\//);
assert.match(routes, /await verifyVendorVendCredential\(\{/);
assert.match(routes, /credential: body\.authorization/);
assert.match(routes, /return sendVendCredentialError\(reply, error\)/);
assert.match(routes, /error\.code === 'vend_credential_required'/);
assert.match(routes, /error\.code\.endsWith\('_failed'\)/);
assert.match(routes, /energy_authorization_misconfigured/);
assert.match(routes, /assertEnergyVendReady\(\)/);
assert.match(routes, /vend_credential_configured: hasVendorVendCredential\(row\)/);
assert.match(routes, /vend_credential_hash, vend_credential_salt/);
assert.doesNotMatch(routes, /allowArchivedFallback/);
assert.doesNotMatch(routes, /allowHistoricalFallback/);
assert.match(tokenEngine, /return env\.ENERGY_ENABLE_ARCHIVED_METER_FALLBACK === true/);
assert.match(walletEnv, /parsed\.data\.UPSTREAM_BEARER_TOKEN \|\| parsed\.data\.ENERGY_BEARER_TOKEN/);
assert.ok(vendingService.indexOf('assertEnergyVendReady()') < vendingService.indexOf("findWalletByOwner('vendor'"));
assert.ok(customerPurchaseService.indexOf('assertEnergyVendReady()') < customerPurchaseService.indexOf('// Resolve meter'));

assert.match(router, /\['vend', 'remote-send'\]\.includes\(String\(to\.name\)\)/);
assert.match(router, /MFA_OPTIONAL_ROUTE_NAMES/);
assert.match(router, /'vend-access'/);
assert.match(router, /!MFA_OPTIONAL_ROUTE_NAMES\.has\(String\(to\.name\)\)/);
assert.match(router, /requiresMfaVerification && to\.name === 'dashboard'/);
assert.match(router, /vend_credential_configured \? 'vend' : 'vend-access'/);
assert.match(router, /!auth\.user\?\.vend_credential_configured/);
assert.match(router, /name: 'vend-access'/);
assert.match(authStore, /vend_credential_configured: boolean/);
assert.match(authStore, /vend_credential_type: 'pin' \| null/);

assert.match(vendAccess, /\/api\/v1\/vendor\/vend-credential/);
assert.match(vendAccess, /auth\.refreshMe\(\)/);
assert.match(vendAccess, /Use exactly four digits/);
assert.doesNotMatch(vendAccess, />Password</);
assert.match(vendAccess, /credentialProblem/);
assert.match(vendAccess, /Choose a less predictable PIN/);
assert.match(vendAccess, /Authorization entries must match/);
assert.match(vend, /Vending temporarily unavailable/);
assert.match(vend, /No wallet hold, debit, or token request occurred/);
assert.match(vend, /vendingConfigurationBlocked/);

for (const view of [vend, remoteSend]) {
  assert.match(view, /ConfirmDialog/);
  assert.match(view, /const authorization = ref\(''\)/);
  assert.match(view, /const authError = ref\(''\)/);
  assert.match(view, /authorization: authorization\.value/);
  assert.match(view, /Vendor authorization/);
  assert.match(view, /vend_credential_required/);
  assert.match(view, /path: '\/vend-access'/);
  assert.match(view, /redirect: route\.fullPath/);
  assert.match(view, /invalid_vend_credential/);
  assert.match(view, /Invalid vendor authorization/);
  assert.match(view, /pattern="\[0-9\]\{4\}"/);
  assert.doesNotMatch(view, /PIN or password/);
}
assert.match(remoteSend, /mode: 'remote_send'/);
assert.match(vend, /mode: 'wallet'/);

assert.match(pkg.scripts['test:wallet'], /tests\/vendor-vend-authorization\.test\.cjs/);
assert.match(pkg.scripts['test:mfa'], /vendor-vend-credential\.test\.ts/);

console.log('vendor vend authorization contract passed');
