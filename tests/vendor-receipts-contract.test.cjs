const fs = require('fs');
const assert = require('assert');

const route = fs.readFileSync('backend/wallet/src/routes/vendor.ts', 'utf8');
const page = fs.readFileSync('apps/vendor/src/views/Receipts.vue', 'utf8');
const customerPage = fs.readFileSync('apps/customer/src/views/Receipts.vue', 'utf8');

assert.match(route, /fastify\.get\('\/receipts'/);
assert.match(route, /purchase_order_id/);
assert.match(route, /receipt_number/);
assert.match(page, /\/api\/v1\/vendor\/receipts\?limit=300/);
assert.match(page, /copy\(r\.token, 'Token'\)/);
assert.match(page, /printReceipt/);
assert.match(page, /receipt-mobile-list/);
assert.match(customerPage, /\/api\/v1\/customer\/receipts/);
assert.match(customerPage, /receipt-mobile-list/);
assert.match(customerPage, /receipt-stats/);
assert.match(customerPage, /printReceiptDoc/);
assert.match(customerPage, /Raise dispute/);

console.log(JSON.stringify({ status: 'vendor receipts contract passed' }));
