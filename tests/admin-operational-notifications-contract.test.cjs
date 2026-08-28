const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const service = read('backend/wallet/src/services/operational-notifications.ts');
const funding = read('backend/wallet/src/services/funding.ts');
const refunds = read('backend/wallet/src/services/refunds.ts');
const disputes = read('backend/wallet/src/services/disputes.ts');
const support = read('backend/wallet/src/services/support.ts');
const meters = read('backend/wallet/src/services/customer-purchase.ts');
const shell = read('apps/admin/src/components/AppShell.vue');
const supportView = read('apps/admin/src/views/Support.vue');
const migration = read('supabase/migrations/20260826210000_operational_notifications.sql');

assert.match(service, /permission:/, 'fanout must target permission holders');
assert.match(service, /stationId/, 'fanout must respect station scope');
assert.match(service, /dedupe_key/, 'fanout must persist an idempotency key');
assert.match(service, /sendWebPush\('staff'/, 'fanout must deliver admin push alerts');

for (const [name, source] of Object.entries({ funding, refunds, disputes, support, meters })) {
  assert.match(source, /notifyOperationalStaff/, `${name} must publish operational alerts`);
}

assert.match(shell, /onNotificationCountChange/, 'shell must consume unread counts');
assert.match(shell, /loadUnreadNotifications/, 'shell must load unread counts');
assert.match(shell, /notification-badge/, 'bell must render an unread badge');

assert.match(supportView, /chatSending/, 'chat send must have an in-flight guard');
assert.match(supportView, /mergeChatMessages/, 'chat polling must deduplicate messages');

assert.match(migration, /unique[^;]+recipient_type[^;]+recipient_id[^;]+dedupe_key/is,
  'database must enforce delivery idempotency');

console.log('admin operational notifications contract passed');
