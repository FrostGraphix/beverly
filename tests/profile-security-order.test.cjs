const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

for (const portal of ['vendor', 'admin', 'customer']) {
  const profile = read(`apps/${portal}/src/views/Profile.vue`);
  const password = profile.lastIndexOf('to="/password-change"');
  assert.notEqual(password, -1, `${portal} profile must expose password changes`);
  assert.ok(password > profile.indexOf('Profile'), `${portal} password action must follow profile content`);
  assert.ok(password > profile.lastIndexOf('Profile details'), `${portal} password action must follow profile details`);
}

const vendor = read('apps/vendor/src/views/Profile.vue');
assert.ok(vendor.indexOf('Account password') > vendor.indexOf('Sign out'), 'vendor password section must be last');

console.log('profile-security-order: ok');
