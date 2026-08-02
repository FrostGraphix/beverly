const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('supabase/migrations/20260802183000_push_subscriptions.sql');
assert.match(migration, /create table if not exists public\.push_subscriptions/i);
assert.match(migration, /force row level security/i);
assert.match(migration, /revoke all .* anon, authenticated/i);

const routes = read('backend/wallet/src/routes/admin.ts');
for (const route of ['/push/config', '/push/subscription', '/push/test']) {
  assert.ok(routes.includes(route), `${route} must exist`);
}
assert.match(routes, /actorId: req\.actor!\.userId/);

const service = read('backend/wallet/src/services/push-notifications.ts');
assert.match(service, /statusCode === 404/);
assert.match(service, /statusCode === 410/);
assert.match(service, /belongs to another account/);
assert.match(service, /eq\('actor_id', input\.actorId\)/);

for (const file of ['apps/admin/public/push-sw.js', 'public/push-sw.js']) {
  const worker = read(file);
  assert.match(worker, /addEventListener\('push'/);
  assert.match(worker, /addEventListener\('notificationclick'/);
  assert.match(worker, /target\.origin !== self\.location\.origin/);
}

assert.match(read('apps/admin/vite.config.ts'), /importScripts: \['push-sw\.js'\]/);
assert.match(read('vite.config.mjs'), /importScripts: \["push-sw\.js"\]/);
assert.match(read('apps/admin/src/views/Notifications.vue'), /adminPushNotifications\.test\(\)/);
assert.match(read('src/components/SettingsPage.vue'), /crmPushNotifications\.test\(\)/);

console.log('Admin and CRM push contract passed.');
