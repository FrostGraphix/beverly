const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const buyToken = read('apps/customer/src/views/BuyToken.vue');
const receipts = read('apps/customer/src/lib/receipts.ts');
const routes = read('backend/wallet/src/routes/customer.ts');
const purchases = read('backend/wallet/src/services/customer-purchase.ts');
const pkg = JSON.parse(read('package.json'));

assert.match(receipts, /export function downloadReceipt\(model: ReceiptModel\): void/);
assert.match(receipts, /downloadCanonicalReceiptPdf\(canonicalReceipt\(model\)\)/);
assert.match(receipts, /data-pdf>PDF Export/);
assert.match(receipts, /class="brm-btn danger" data-close>Cancel/);

assert.match(buyToken, /downloadReceipt, printReceipt, purchaseReceipt, viewReceipt/);
assert.match(buyToken, /function downloadResultReceipt\(\)/);
assert.match(buyToken, /async function remoteSendGeneratedToken\(\)/);
assert.match(buyToken, /async function copyToken\(\)/);
assert.match(buyToken, /purchase_order_id: result\.value\.purchaseOrder\?\.id/);
assert.match(buyToken, /\/api\/v1\/customer\/purchase\/\$\{orderId\}\/remote-send/);
assert.match(buyToken, /Token generated successfully/);
assert.match(buyToken, /Download receipt/);
assert.match(buyToken, /bw-recharge-summary/);
assert.match(buyToken, /Check remote status/);
assert.match(buyToken, /Remote send delivered/);
assert.match(buyToken, /Remote send needs manual entry/);

assert.match(routes, /fastify\.post\('\/purchase\/:purchaseOrderId\/remote-send'/);
assert.match(routes, /dispatchGeneratedCustomerToken/);

assert.match(purchases, /export async function dispatchGeneratedCustomerToken/);
assert.match(purchases, /actor_type', 'customer'/);
assert.match(purchases, /customer_id', customerId/);
assert.match(purchases, /createRemoteSendTask\(/);
assert.match(purchases, /remote_send_metadata_missing/);
assert.match(purchases, /remote_send_pending_review/);
assert.match(purchases, /pollRemoteSendStatus\(po\.remote_task_id, \{/);
assert.match(purchases, /remote_send_failed_needs_manual_entry/);
assert.match(purchases, /allowArchivedFallback: true/);
assert.match(purchases, /allowHistoricalFallback: true/);
assert.match(pkg.scripts['test:wallet'], /customer-token-generated-actions\.test\.cjs/);

console.log('customer generated-token actions contract passed');
