const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('paid meter rejection creates an approved refund record atomically', () => {
  const sql = read('supabase/migrations/20260828090000_meter_rejection_refund_records.sql');
  const functionStart = sql.indexOf('create or replace function public.fn_reject_meter_order');
  const functionEnd = sql.indexOf('$$;', functionStart);
  const rejectionFunction = sql.slice(functionStart, functionEnd);

  assert.match(rejectionFunction, /fn_post_ledger_entry/i);
  assert.match(rejectionFunction, /insert into public\.refund_requests/i);
  assert.match(rejectionFunction, /'meter_order_rejection'/i);
  assert.match(rejectionFunction, /'approved'/i);
  assert.match(rejectionFunction, /v_entry\.id/i);
  assert.match(rejectionFunction, /source_id/i);
});

test('existing rejected meter refunds are backfilled from ledger evidence', () => {
  const sql = read('supabase/migrations/20260828090000_meter_rejection_refund_records.sql');

  assert.match(sql, /insert into public\.refund_requests[\s\S]*from public\.meter_purchase_orders/i);
  assert.match(sql, /wallet_ledger_entries[\s\S]*rejection_refund_entry_id/i);
  assert.match(sql, /on conflict \(source_type, source_id\)/i);
});

test('refund API exposes meter-rejection records and summary counts', () => {
  const service = read('backend/wallet/src/services/refunds.ts');
  const routes = read('backend/wallet/src/routes/admin.ts');

  assert.match(service, /source\?: RefundSource/);
  assert.match(service, /query = query\.eq\('source_type', opts\.source\)/);
  assert.match(service, /meter_rejection:/);
  assert.match(service, /Could not load refunds/);
  assert.match(routes, /source: source as RefundSource/);
});

test('admin refunds show meter rejection credits by default', () => {
  const page = read('apps/admin/src/views/Refunds.vue');

  assert.match(page, /const statusFilter = ref<RefundStatus \| ''>\(''\)/);
  assert.match(page, /Filter refunds by source/);
  assert.match(page, /Meter rejection/);
  assert.match(page, /source_type/);
  assert.match(page, /Meter refunds/);
});

test('meter rejection refund records keep source traceability', () => {
  const page = read('apps/admin/src/views/Refunds.vue');
  const receipts = read('apps/admin/src/lib/receipts.ts');

  assert.match(page, /Automatic meter refunds/);
  assert.match(receipts, /field\('Source',/);
  assert.match(receipts, /field\('Source Reference',/);
});

test('refund pagination uses server totals', () => {
  const service = read('backend/wallet/src/services/refunds.ts');
  const routes = read('backend/wallet/src/routes/admin.ts');
  const page = read('apps/admin/src/views/Refunds.vue');

  assert.match(service, /count: 'exact'/);
  assert.match(service, /\.range\(from, to\)/);
  assert.match(routes, /page_size/);
  assert.match(page, /params\.set\('page_size'/);
  assert.match(page, /:total-items="totalRefunds"/);
  assert.match(page, /@change="load"/);
});

test('manual refund decisions notify owners safely', () => {
  const service = read('backend/wallet/src/services/refunds.ts');
  const notifications = read('backend/wallet/src/services/notifications.ts');

  assert.match(service, /notifyRefundOwner/);
  assert.match(service, /\.eq\('status', 'pending'\)/);
  assert.match(service, /Could not reject refund/);
  assert.match(notifications, /notifyRefundUpdate/);
  assert.match(notifications, /'refund_update'/);
});
