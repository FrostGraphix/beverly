const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

const migration = read('supabase/migrations/20261001090000_login_voice_preference.sql');
assert.match(migration, /login_voice_enabled boolean not null default true/);
for (const route of ['customer.ts', 'vendor.ts', 'admin.ts']) {
  const source = read(`backend/wallet/src/routes/${route}`);
  assert.match(source, /login_voice_enabled/);
}
for (const portal of ['customer', 'vendor', 'admin']) {
  const voice = read(`apps/${portal}/src/utils/voice.js`);
  assert.match(voice, /loginVoiceEnabled !== false/);
  assert.match(voice, /sessionStorage/);
  assert.doesNotMatch(voice, /console\.warn\('Play failed'/);
}
for (const profile of ['apps/customer/src/views/Profile.vue', 'apps/vendor/src/views/Profile.vue', 'apps/admin/src/views/Profile.vue']) {
  const source = read(profile);
  assert.match(source, /Login voice/);
  assert.match(source, /role="switch"/);
  assert.match(source, /aria-checked/);
}
console.log('login voice contract passed');
