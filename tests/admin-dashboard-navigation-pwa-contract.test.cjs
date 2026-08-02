const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const router = read('apps/admin/src/router/index.ts');
const auth = read('apps/admin/src/stores/auth.ts');
const dashboard = read('apps/admin/src/views/Dashboard.vue');
const reports = read('apps/admin/src/views/Reports.vue');
const tokens = read('packages/tokens/wallet.css');
const adminVite = read('apps/admin/vite.config.ts');
const crmVite = read('vite.config.mjs');
const vendorDashboard = read('apps/vendor/src/views/Dashboard.vue');
const customerDashboard = read('apps/customer/src/views/Home.vue');

assert.match(router, /void auth\.ensureFreshSession\(\)/, 'navigation must not await routine session refreshes');
assert.match(auth, /sessionRefreshPromise/, 'session refreshes must share one request');
assert.match(auth, /lastRefreshAttemptAt/, 'failed refreshes need retry backoff');
assert.match(dashboard, /WalletDataViewSwitch/, 'recent transactions need a view switch');
assert.match(dashboard, /:modes="\['grid', 'table'\]"/, 'recent transactions need grid and table modes');
assert.match(tokens, /text-overflow: ellipsis/, 'long KPI money values must clamp');
assert.match(tokens, /white-space: nowrap/, 'long KPI money values must remain single-line');
assert.match(reports, /Start date must precede end date/, 'reports must validate inverted ranges');
assert.match(reports, /requestId === loadSequence/, 'stale report responses must not replace newer data');
assert.match(vendorDashboard, /dashboardLoading/, 'vendor dashboard needs an initial loading state');
assert.match(customerDashboard, /aria-label="Loading dashboard"/, 'customer dashboard needs an initial loading state');
assert.match(adminVite, /VitePWA/, 'wallet admin must build a PWA');
assert.match(crmVite, /VitePWA/, 'CRM must build a PWA');

for (const file of [
  'apps/admin/public/pwa-192.png',
  'apps/admin/public/pwa-512.png',
  'apps/admin/public/pwa-512-maskable.png',
  'public/pwa-192.png',
  'public/pwa-512.png',
  'public/pwa-512-maskable.png',
]) {
  assert(fs.statSync(path.join(root, file)).size > 0, `${file} must exist`);
}

console.log('admin dashboard navigation PWA contract passed');
