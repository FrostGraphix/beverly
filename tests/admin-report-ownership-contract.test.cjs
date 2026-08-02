const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('apps/admin/src/views/Reports.vue');
const route = read('backend/wallet/src/routes/admin.ts');
const vite = read('apps/admin/vite.config.ts');

assert.match(page, /type ReportAudience = 'all' \| 'vendor' \| 'customer'/);
assert.match(page, /q\.set\('audience', audience\.value\)/);
assert.match(page, /q\.set\('family', selectedFamily\.value\)/);
assert.match(page, /aria-label="Report ownership"/);
assert.match(page, /Customer purchases/);
assert.match(page, /New vendors/);

assert.match(route, /reportAudienceSchema\.safeParse/);
assert.match(route, /reportFamilySchema\.safeParse/);
assert.match(route, /family === 'audit' \? readRows\('Audit logs'/);
assert.match(route, /purchasesQuery = purchasesQuery\.eq\('actor_type', audience\)/);
assert.match(route, /fundingQuery = fundingQuery\.eq\('actor_type', audience\)/);
assert.match(route, /refundsQuery = refundsQuery\.eq\('wallets\.owner_type', audience\)/);
assert.match(route, /disputesQuery = disputesQuery\.eq\('raised_by_actor_type', audience\)/);
assert.match(route, /throw new Error\(`\$\{source\} report query failed:/);
assert.match(route, /error: 'reports_unavailable'/);
assert.match(route, /vendor_organizations/);
assert.doesNotMatch(route, /from\('purchase_orders'\)\.select\('[^']*fee_minor/);
assert.match(vite, /http:\/\/127\.0\.0\.1:/);

console.log('admin report ownership contract passed');
