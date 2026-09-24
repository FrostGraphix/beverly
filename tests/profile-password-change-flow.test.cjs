const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('every portal profile exposes authenticated password changing', () => {
  const portals = ['admin', 'vendor', 'customer'];
  for (const portal of portals) {
    const profile = read(`apps/${portal}/src/views/Profile.vue`);
    assert.match(profile, /Change password/);
    assert.match(profile, /to="\/password-change"/);
  }
});

test('customer password changes use an authenticated backend route', () => {
  const route = read('backend/wallet/src/routes/customer.ts');
  assert.match(route, /fastify\.post\('\/password-change',[\s\S]*requireCustomer/);
  assert.match(route, /replaceCustomerPassword/);

  const policy = read('backend/wallet/src/contracts/route-policy.ts');
  assert.match(policy, /post\('\/api\/v1\/customer\/password-change'\)/);
});

test('customer password changes bind the rotated session', () => {
  const service = read('backend/wallet/src/services/customer-password-change.ts');
  assert.match(service, /invalid_current_password/);
  assert.match(service, /signOut\(.*'global'/s);
  assert.match(service, /password_session_id/);
  assert.match(service, /password_changed_at/);
  assert.match(service, /password_change_rate_limited/);
});
