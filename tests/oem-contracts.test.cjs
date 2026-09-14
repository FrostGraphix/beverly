const assert = require('node:assert/strict');
const { resolveInstallation, authorizeInstallation } = require('../packages/oem-contracts');

// The gateway must not choose one installation for a colliding meter identity.
assert.throws(
  () => resolveInstallation([
    { id: '11111111-1111-4111-8111-111111111111' },
    { id: '22222222-2222-4222-8222-222222222222' }
  ]),
  { code: 'OEM_INSTALLATION_AMBIGUOUS' }
);

// A disabled installation cannot reach an OEM operation.
assert.throws(
  () => authorizeInstallation({
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'disabled'
  }, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  { code: 'OEM_INSTALLATION_INACTIVE' }
);

const activeInstallation = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  status: 'active'
};
assert.throws(
  () => authorizeInstallation(activeInstallation, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  { code: 'OEM_TENANT_FORBIDDEN' }
);
assert.equal(
  authorizeInstallation(activeInstallation, activeInstallation.tenantId),
  activeInstallation
);

console.log('oem-contracts ok');
