const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const dashboard = read('apps/admin/src/views/Dashboard.vue');
const purchases = read('apps/admin/src/views/Purchases.vue');
const routes = read('backend/wallet/src/routes/admin.ts');

assert(dashboard.includes('All Vends'), 'Dashboard must show all-time vending.');
assert(dashboard.includes('statAllSuccessfulVends'), 'Dashboard must show successful vends.');
assert(dashboard.includes('statAllFailedVends'), 'Dashboard must show failed vends.');
assert(!dashboard.includes('Vendor applications'), 'Dashboard application card must be removed.');
assert(dashboard.includes('{{ p.vendorName }}'), 'Recent transactions must show vendor names.');
assert(dashboard.includes('{{ p.vendorBusiness }}'), 'Recent transactions must show vendor businesses.');

assert(purchases.includes('purchaseFilterParams()'), 'Purchase KPI filters must share table parameters.');
assert(purchases.includes('/purchases/summary?${purchaseFilterParams()}'), 'Filtered KPI request is missing.');
assert(purchases.includes('All purchases'), 'All-time purchase KPI is missing.');
assert(purchases.includes('Total amount'), 'Total amount KPI is missing.');
assert(purchases.includes('refundedValueMinor'), 'Refund value KPI is missing.');

assert(routes.includes('totalCount:               rows.length'), 'Purchase total count is not mapped.');
assert(routes.includes('totalValueMinor:          sumMinor(rows)'), 'Purchase total amount is not mapped.');
assert(routes.includes("if (status) query = query.eq('status', status)"), 'Summary status filter is missing.');
assert(routes.includes("if (meterType) query = query.eq('meter_type', meterType)"), 'Summary meter filter is missing.');
assert(routes.includes("if (since) query = query.gte('created_at', since)"), 'Summary start filter is missing.');
assert(routes.includes("if (until) query = query.lte('created_at', until)"), 'Summary end filter is missing.');

console.log('dashboard purchase KPI contract passed');
