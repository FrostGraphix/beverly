const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const pushService = read('backend/wallet/src/services/vendor-push.ts');
const notifications = read('backend/wallet/src/services/vendor-notifications.ts');
const vendorRoutes = read('backend/wallet/src/routes/vendor.ts');
const client = read('apps/vendor/src/lib/push-notifications.ts');
const worker = read('apps/vendor/public/push-sw.js');
const migration = read('supabase/migrations/20260729150000_vendor_push_subscriptions.sql');

assert(pushService.includes("[404, 410].includes"), 'Expired device subscriptions must be removed.');
assert(notifications.includes('await sendVendorPush'), 'Persisted vendor notifications must trigger device delivery.');
for (const file of ['backend/wallet/src/services/disputes.ts', 'backend/wallet/src/services/funding.ts', 'backend/wallet/src/services/support.ts']) {
  assert(!read(file).includes('void notifyVendor'), `${file} must await notification delivery.`);
}
assert(vendorRoutes.includes("fastify.post('/push/subscription'"), 'Device subscription endpoint is missing.');
assert(vendorRoutes.includes("fastify.delete('/push/subscription'"), 'Device unsubscribe endpoint is missing.');
assert(client.includes('Notification.requestPermission()'), 'Permission must follow explicit user action.');
assert(client.includes('DEVICE_DISABLED_KEY'), 'Device opt-out must survive reloads.');
assert(worker.includes("self.addEventListener('notificationclick'"), 'Device notifications must reopen Beverly.');
assert(migration.includes('endpoint text not null unique'), 'Each device endpoint must remain unique.');

console.log('vendor device notifications contract passed');
