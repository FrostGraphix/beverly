const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const vendView = read('apps/vendor/src/views/Vend.vue');
const receipts = read('apps/vendor/src/lib/receipts.ts');
const routes = read('backend/wallet/src/routes/vendor.ts');
const vending = read('backend/wallet/src/services/vending.ts');
const pkg = JSON.parse(read('package.json'));

assert.match(receipts, /export function downloadReceipt\(model: ReceiptModel\): void/);
assert.match(receipts, /downloadCanonicalReceiptPdf\(canonicalReceipt\(model\)\)/);
assert.match(receipts, /data-pdf>PDF Export/);
assert.match(receipts, /class="brm-btn danger" data-close>Cancel/);

assert.match(vendView, /downloadReceipt, printReceipt, purchaseReceipt, viewReceipt/);
assert.match(vendView, /function downloadResultReceipt\(\)/);
assert.match(vendView, /function remoteSendGeneratedToken\(\)/);
assert.match(vendView, /const flowSteps = computed/);
assert.match(vendView, /const canRemoteSendToken = computed/);
assert.match(vendView, /purchase_order_id: result\.value\.purchaseOrder\?\.id/);
assert.match(vendView, /remoteState\.replace\(/);
assert.match(vendView, /\/api\/v1\/vendor\/vend\/\$\{orderId\}\/remote-send/);
assert.match(vendView, /Token generated successfully/);
assert.match(vendView, /Download receipt/);
assert.match(vendView, /bw-recharge-summary/);
assert.match(vendView, /Remote send/);
assert.match(vendView, /Remote send delivered/);
assert.match(vendView, /Remote send needs manual entry/);

assert.match(routes, /fastify\.post\('\/vend\/:purchaseOrderId\/remote-send'/);
assert.match(routes, /dispatchGeneratedVendorToken/);
assert.match(routes, /energy_amount_minor: purchase\.energy_amount_minor/);
assert.match(routes, /vat_amount_minor: purchase\.vat_amount_minor/);
assert.match(vending, /export async function dispatchGeneratedVendorToken/);
assert.match(vending, /createRemoteSendTask\(/);
assert.match(vending, /remote_send_metadata_missing/);
assert.match(vending, /remote_send_pending_review/);
assert.match(vending, /pollRemoteSendStatus\(row\.remote_task_id!, \{/);
assert.match(vending, /remote_send_failed_needs_manual_entry/);
assert.doesNotMatch(vending, /status:\s*'dispatching'/);
assert.match(pkg.scripts['test:wallet'], /vendor-vend-generated-token-actions\.test\.cjs/);

console.log('vendor vend generated-token actions contract passed');
