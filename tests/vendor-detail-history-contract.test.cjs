const assert = require('node:assert/strict');
const fs = require('node:fs');

const view = fs.readFileSync('apps/admin/src/views/VendorDetail.vue', 'utf8');
const adminRoute = fs.readFileSync('backend/wallet/src/routes/admin.ts', 'utf8');

assert.match(adminRoute, /fastify\.get\('\/vendors\/:id\/funding'[\s\S]*?from\('payment_transactions'\)[\s\S]*?from\('funding_requests'\)/,
  'Vendor funding history must combine gateway payments and bank-transfer funding requests.');
assert.match(view, /detailGatewayFilter/);
assert.match(view, /All gateways/);
assert.match(view, /succeeded: 'success'/);
assert.match(view, />Edit vendor details<\/button>/);
const routes = fs.readFileSync('backend/wallet/src/routes/admin.ts', 'utf8');

assert.match(view, /async function loadAllHistory/);
assert.match(view, /while \(cursor\)/);
assert.match(view, /detailTypeFilter/);
assert.match(view, /detailDateFrom/);
assert.match(view, /:modes="\['list', 'table'\]"/);
assert.match(view, /detailView === 'table'/);
assert.match(routes, /nextCursor: entries\.length === pageSize/);

console.log('vendor detail history contract passed');
