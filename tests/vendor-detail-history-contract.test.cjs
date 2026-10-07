const assert = require('node:assert/strict');
const fs = require('node:fs');

const view = fs.readFileSync('apps/admin/src/views/VendorDetail.vue', 'utf8');
const routes = fs.readFileSync('backend/wallet/src/routes/admin.ts', 'utf8');

assert.match(view, /async function loadAllHistory/);
assert.match(view, /while \(cursor\)/);
assert.match(view, /detailTypeFilter/);
assert.match(view, /detailDateFrom/);
assert.match(view, /:modes="\['list', 'table'\]"/);
assert.match(view, /detailView === 'table'/);
assert.match(routes, /nextCursor: entries\.length === pageSize/);

console.log('vendor detail history contract passed');
