const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20260812183000_wallet_vending_pin_only.sql');
const service = read('backend/wallet/src/services/customer-vend-pin.ts');
const routes = read('backend/wallet/src/routes/customer.ts');
const policy = read('backend/wallet/src/contracts/route-policy.ts');
const router = read('apps/customer/src/router/index.ts');
const setup = read('apps/customer/src/views/VendPin.vue');
const purchase = read('apps/customer/src/views/BuyToken.vue');
const security = read('apps/customer/src/views/Security.vue');

for (const column of ['vend_pin_hash', 'vend_pin_salt', 'vend_pin_set_at']) {
  assert(migration.includes(column));
}
assert(service.includes("crypto.scryptSync"));
assert(service.includes("crypto.timingSafeEqual"));
assert(service.includes("logSecurityEvent('vend_pin_set'"));
assert(service.includes("logSecurityEvent('vend_pin_failure'"));
assert(service.includes('const MAX_ATTEMPTS = 5'));
assert(service.includes("'vend_pin_locked'"));
assert.match(service, /const PIN_RE = \/\^\\d\{4\}\$\//);
assert.match(routes, /fastify\.get\('\/vend-pin\/status'/);
assert.match(routes, /fastify\.post\('\/vend-pin'/);
assert.match(routes, /await verifyCustomerVendPin\(\{/);
assert.match(routes, /pin: z\.string\(\)\.regex\(\/\^\\d\{4\}\$\//);
assert(policy.includes("post('/api/v1/customer/vend-pin')"));
assert(router.includes("path: '/vend-pin'"));
assert(router.includes("!auth.customer?.vend_pin_configured"));
assert(setup.includes('pattern="[0-9]{4}"'));
assert(setup.includes('Choose a less predictable PIN.'));
assert(purchase.includes('v-model="vendPin"'));
assert(purchase.includes('pin: vendPin.value'));
assert(security.includes('Change vending PIN'));

console.log('customer vending PIN contract passed');
