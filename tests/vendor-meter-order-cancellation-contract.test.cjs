const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('cancellation stays atomic and bounded', () => {
  const sql = read('supabase/migrations/20260825090000_vendor_meter_order_cancellation.sql');
  assert.match(sql, /for update/i);
  assert.match(sql, /interval '6 hours'/i);
  assert.match(sql, /fn_post_ledger_entry/i);
  assert.match(sql, /'reversal_credit'/i);
  assert.match(sql, /status = 'cancelled'/i);
});

test('vendor cancellation requires ownership', () => {
  const sql = read('supabase/migrations/20260825090000_vendor_meter_order_cancellation.sql');
  assert.match(sql, /vendor_organization_id = p_vendor_organization_id/i);
  const route = read('backend/wallet/src/routes/vendor.ts');
  assert.match(route, /meter-orders\/:id\/cancel/);
});

test('portal confirms and hides cancellation', () => {
  const create = read('apps/vendor/src/views/MeterOrderCreate.vue');
  const orders = read('apps/vendor/src/views/MeterOrders.vue');
  assert.match(create, /Review meter order/);
  assert.match(create, /I verified these order details/);
  assert.match(orders, /v-if="order\.cancellation_eligible"/);
  assert.match(orders, /Cancel and refund/);
});
