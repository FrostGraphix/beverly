const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const trackerModal = read('packages/tokens/RemoteSendTrackerModal.vue');
const vendorTransactions = read('apps/vendor/src/views/Transactions.vue');
const vendorVend = read('apps/vendor/src/views/Vend.vue');
const customerBuyToken = read('apps/customer/src/views/BuyToken.vue');
const customerTransactions = read('apps/customer/src/views/Transactions.vue');
const vendorRoutes = read('backend/wallet/src/routes/vendor.ts');
const customerRoutes = read('backend/wallet/src/routes/customer.ts');
const vendingService = read('backend/wallet/src/services/vending.ts');
const customerPurchaseService = read('backend/wallet/src/services/customer-purchase.ts');
const apiReference = read('api/reference.js');

// 1. Verify RemoteSendTrackerModal robust error handling & watching
assert.match(trackerModal, /const fallbackState = errData\?\.deliveryState || errData\?\.delivery_state/);
assert.match(trackerModal, /currentState\.value = 'remote_send_failed_needs_manual_entry'/);
assert.match(trackerModal, /watch\(\s*\(\) => \[props\.deliveryState, props\.remoteTaskId, props\.remark, props\.token\]/);

// 2. Verify frontend views fetchRemoteSendStatus error extraction
assert.match(vendorTransactions, /deliveryState: data\.delivery_state \|\| data\.deliveryState/);
assert.match(vendorVend, /deliveryState: data\.delivery_state \|\| data\.deliveryState/);
assert.match(customerBuyToken, /deliveryState: data\.delivery_state \|\| data\.deliveryState/);
assert.match(customerTransactions, /deliveryState: data\.delivery_state \|\| data\.deliveryState/);

// 3. Verify backend vending & customer services allow valid statuses & handle failed delivery state
assert.match(vendingService, /po\.status === 'reversed'/);
assert.match(vendingService, /if \(po\.remote_task_id\)/);
assert.match(customerPurchaseService, /po\.status === 'reversed'/);
assert.match(customerPurchaseService, /if \(po\.remote_task_id\)/);

// 4. Verify Fastify route error payloads include deliveryState & remark
assert.match(vendorRoutes, /deliveryState: 'remote_send_failed_needs_manual_entry'/);
assert.match(customerRoutes, /deliveryState: 'remote_send_failed_needs_manual_entry'/);

// 5. Verify api/reference.js canonical proxy handling
assert.match(apiReference, /canonicalResult\.status < 400 \|\| !pathname\.includes\('\/remote-send'\)/);

console.log('remote-send tracker flow end-to-end audit test passed');
