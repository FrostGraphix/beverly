/**
 * Contract test: Hold Active Lifecycle, Scheduler Sweeper Sync, & Admin Vending Recovery
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function read(rel) {
    return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const scheduler = read('backend/wallet/src/jobs/scheduler.ts');
const adminRoutes = read('backend/wallet/src/routes/admin.ts');
const vendingVue = read('apps/admin/src/views/Vending.vue');

// 1. Scheduler sweepExpiredHolds must sync purchase_orders status
assert.match(scheduler, /from\('purchase_orders'\)/);
assert.match(scheduler, /status:\s*'failed'/);
assert.match(scheduler, /failure_reason:\s*'hold_expired_swept'/);
assert.match(scheduler, /in\('status',\s*\['created',\s*'hold_active'\]\)/);

// 2. Scheduler scanStuckPurchases must include created and hold_active
assert.match(scheduler, /in\('status',\s*\['created',\s*'hold_active',\s*'pending'\]\)/);

// 3. Admin routes must expose manual hold release and retry routes
assert.match(adminRoutes, /POST \/purchases\/:id\/release-hold/);
assert.match(adminRoutes, /POST \/purchases\/:id\/retry-vend/);
assert.match(adminRoutes, /releaseHold\(po\.hold_id\)/);
assert.match(adminRoutes, /generateCreditToken/);

// 4. Vending UI must include 3-dot WalletRowActions menu and Actions header
assert.match(vendingVue, /Actions<\/th>/);
assert.match(vendingVue, /WalletRowActions/);
assert.match(vendingVue, /buildVendingRowActions/);
assert.match(vendingVue, /retryVendOrder/);
assert.match(vendingVue, /releaseVendHold/);
assert.match(vendingVue, /loadRecovery\(true\)/); // Silent polling check

console.log('✔ Hold Active lifecycle & recovery contract tests passed');
