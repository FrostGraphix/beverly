const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const migration = read('supabase/migrations/20260520121500_vendor_vend_credential.sql');
const service = read('backend/wallet/src/services/vendor-vend-credential.ts');
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
assert.match(migration, /vend_credential_type in \('pin', 'password'\)/);

for (const marker of [
  'VendorVendCredentialError',
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
assert.match(routes, /authorization: z\.string\(\)\.min\(4\)\.max\(80\)/);
assert.match(routes, /await verifyVendorVendCredential\(\{/);
assert.match(routes, /credential: body\.authorization/);
assert.match(routes, /return sendVendCredentialError\(reply, error\)/);
assert.match(routes, /error\.code === 'vend_credential_required' \? 428 : 400/);
assert.match(routes, /vend_credential_configured: Boolean/);

assert.match(router, /\['vend', 'remote-send'\]\.includes\(String\(to\.name\)\)/);
assert.match(router, /!auth\.user\?\.vend_credential_configured/);
assert.match(router, /name: 'vend-access'/);
assert.match(authStore, /vend_credential_configured: boolean/);
assert.match(authStore, /vend_credential_type: 'pin' \| 'password' \| null/);

assert.match(vendAccess, /\/api\/v1\/vendor\/vend-credential/);
assert.match(vendAccess, /auth\.refreshMe\(\)/);
assert.match(vendAccess, /PIN: 4-6 digits/);
assert.match(vendAccess, /Password: 10\+ characters/);

for (const view of [vend, remoteSend]) {
  assert.match(view, /ConfirmDialog/);
  assert.match(view, /const authorization = ref\(''\)/);
  assert.match(view, /authorization: authorization\.value/);
  assert.match(view, /Vendor authorization/);
}
assert.match(remoteSend, /mode: 'remote_send'/);
assert.match(vend, /mode: 'wallet'/);

assert.match(pkg.scripts['test:wallet'], /tests\/vendor-vend-authorization\.test\.cjs/);
assert.match(pkg.scripts['test:mfa'], /vendor-vend-credential\.test\.ts/);

console.log('vendor vend authorization contract passed');
