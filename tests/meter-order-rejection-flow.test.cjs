const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('admin rejection uses dedicated money endpoint', () => {
  const routes = read('backend/wallet/src/routes/admin.ts');
  const policy = read('backend/wallet/src/contracts/route-policy.ts');
  const start = routes.indexOf("fastify.post('/meter-orders/:id/reject'");
  const rejectRoute = routes.slice(start, routes.indexOf("fastify.patch('/meter-orders/:id'", start));
  assert.match(routes, /post\('\/meter-orders\/:id\/reject'/);
  assert.match(rejectRoute, /reason: z\.string\(\)\.trim\(\)\.min\(10\)\.max\(500\)/);
  assert.match(rejectRoute, /scopeStations\(scopeQuery, assignedStations\)/);
  assert.match(policy, /post\('\/api\/v1\/admin\/meter-orders\/:id\/reject', \{ money: true \}\)/);
});

test('rejection refund stays atomic', () => {
  const enumSql = read('supabase/migrations/20260826085900_meter_order_rejected_status.sql');
  const sql = read('supabase/migrations/20260826090000_meter_order_rejection_flow.sql');
  assert.match(enumSql, /alter type public\.meter_order_status_enum add value if not exists 'rejected'/i);
  assert.doesNotMatch(sql, /alter type/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /status not in \('pending_payment', 'paid'\)/i);
  assert.match(sql, /fn_post_ledger_entry/i);
  assert.match(sql, /meter_order:reject:/i);
  assert.match(sql, /status = 'rejected'/i);
});

test('every portal explains rejection recovery', () => {
  const admin = read('apps/admin/src/views/MeterOrders.vue');
  const vendor = read('apps/vendor/src/views/MeterOrders.vue');
  const customer = read('apps/customer/src/views/MeterOrders.vue');
  assert.match(admin, /Reject and refund/);
  assert.match(vendor, /Rejection reason/);
  assert.match(customer, /Rejection reason/);
  assert.match(customer, /customer_wallet/);
});

test('rejection evidence reaches notices and receipts', () => {
  const notifications = read('backend/wallet/src/services/notifications.ts');
  const receipts = read('apps/vendor/src/lib/receipts.ts');
  assert.match(notifications, /refundDestination/);
  assert.match(notifications, /opts\.reason/);
  assert.match(receipts, /Rejection Reason/);
  assert.match(receipts, /Refund Destination/);
  assert.match(receipts, /Rejected At/);
});
