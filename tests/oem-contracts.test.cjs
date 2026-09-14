const assert = require('node:assert/strict');
const { resolveInstallation } = require('../packages/oem-contracts');

// The gateway must not choose one installation for a colliding meter identity.
assert.throws(
  () => resolveInstallation([
    { id: '11111111-1111-4111-8111-111111111111' },
    { id: '22222222-2222-4222-8222-222222222222' }
  ]),
  { code: 'OEM_INSTALLATION_AMBIGUOUS' }
);

console.log('oem-contracts ok');
