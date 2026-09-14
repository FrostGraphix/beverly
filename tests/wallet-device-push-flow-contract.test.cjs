'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

for (const portal of ['admin', 'vendor', 'customer']) {
  const worker = read(`apps/${portal}/public/push-sw.js`);
  const vite = read(`apps/${portal}/vite.config.ts`);
  assert.match(worker, /showNotification\(/);
  assert.match(worker, /self\.registration\.scope/);
  assert.match(worker, /target\.pathname\.startsWith/);
  assert.match(vite, /importScripts: \['push-sw\.js'\]/);
}

const customer = read('backend/wallet/src/routes/customer.ts');
const vendor = read('backend/wallet/src/routes/vendor.ts');
const admin = read('backend/wallet/src/routes/admin.ts');
const customerNotifications = read('backend/wallet/src/services/notifications.ts');
const vendorNotifications = read('backend/wallet/src/services/vendor-notifications.ts');
const operations = read('backend/wallet/src/services/operational-notifications.ts');
for (const route of [customer, vendor, admin]) {
  assert.match(route, /'\/push\/config'/);
  assert.match(route, /'\/push\/subscription'/);
  assert.match(route, /'\/push\/test'/);
}
assert.match(customer, /requireCustomer\(\)/);
assert.match(vendor, /requireVendor\(\)/);
assert.match(customerNotifications, /sendWebPush\('customer'/);
assert.match(vendorNotifications, /sendWebPush\('vendor'/);
assert.match(operations, /sendWebPush\('staff'/);
assert.match(admin, /sendWebPush\(recipient\.type, recipient\.id/);
assert.match(read('apps/customer/src/views/Notifications.vue'), /customerPushNotifications\.enable\(\)/);
assert.match(read('apps/vendor/src/views/Notifications.vue'), /enableDeviceNotifications\(\)/);
assert.match(read('apps/admin/src/views/Notifications.vue'), /adminPushNotifications\.enable\(\)/);

(async () => {
  for (const portal of ['admin', 'vendor', 'customer']) {
    let pushed;
    let opened;
    const scope = `https://beverly.acoblighting.com/wallet-${portal}/`;
    const handlers = {};
    const self = {
      registration: { scope, showNotification: async (title, options) => { pushed = { title, options }; } },
      location: { origin: 'https://beverly.acoblighting.com' },
      clients: {
        matchAll: async () => [{ url: 'https://beverly.acoblighting.com/wallet-other/', navigate: async () => { throw new Error('Wrong portal navigated.'); } }],
        openWindow: async (url) => { opened = url; },
      },
      addEventListener: (name, handler) => { handlers[name] = handler; },
    };
    vm.runInNewContext(read(`apps/${portal}/public/push-sw.js`), { self, URL });
    let pending;
    handlers.push({ data: { json: () => ({ title: 'Test alert', body: 'Delivery verified.', url: '/notifications' }) }, waitUntil: (promise) => { pending = promise; } });
    await pending;
    assert.equal(pushed.title, 'Test alert');
    handlers.notificationclick({ notification: { data: pushed.options.data, close() {} }, waitUntil: (promise) => { pending = promise; } });
    await pending;
    assert.equal(opened, `${scope}notifications`);
  }
  console.log('Wallet device push flow contract passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
