"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/migrations/20260812140000_customer_meter_link_history.sql");
const purchase = read("backend/wallet/src/services/customer-purchase.ts");
const customerRoutes = read("backend/wallet/src/routes/customer.ts");
const adminRoutes = read("backend/wallet/src/routes/admin-meter-approvals.ts");
const notifications = read("backend/wallet/src/services/notifications.ts");
const worker = read("backend/wallet/src/worker.ts");
const adminPage = read("apps/admin/src/views/MeterApprovals.vue");
const metersPage = read("apps/customer/src/views/Meters.vue");
const notificationsPage = read("apps/customer/src/views/Notifications.vue");

assert.match(migration, /create table if not exists public\.customer_meter_link_history/);
assert.match(migration, /event_type text not null[\s\S]*submitted[\s\S]*approved[\s\S]*rejected[\s\S]*unlinked/);
assert.match(migration, /alter table public\.customer_meter_link_history enable row level security/);
assert.match(migration, /alter table public\.customer_meter_link_history force row level security/);
assert.match(migration, /revoke insert, update, delete, truncate, references, trigger[\s\S]*from authenticated/);
assert.match(migration, /grant select on public\.customer_meter_link_history to authenticated/);
assert.match(migration, /grant all on public\.customer_meter_link_history to service_role/);
assert.match(migration, /insert into public\.customer_meter_link_history/);
assert.match(migration, /from public\.wallet_audit_log wal/);
assert.match(migration, /customer_meter\.reject/);
assert.match(migration, /create or replace function private\.record_customer_meter_link_history/);
assert.match(migration, /after insert or update of status or delete on public\.customer_meters/);

assert.match(purchase, /select\('id, status/);
assert.match(purchase, /existing\?\.status === 'rejected'/);
assert.match(purchase, /status: 'pending'[\s\S]*reviewed_by: null[\s\S]*reviewed_at: null[\s\S]*rejection_reason: null/);
assert.match(purchase, /export async function listCustomerMeterLinkHistory/);
assert.match(purchase, /\.from\('customer_meter_link_history'\)/);
assert.match(purchase, /\.not\('status', 'eq', 'rejected'\)/);

assert.match(customerRoutes, /fastify\.get\('\/meters\/history'/);
assert.match(customerRoutes, /listCustomerMeterLinkHistory/);
assert.match(migration, /when new\.status = 'approved' then 'approved'/);
assert.match(migration, /else 'rejected'/);
assert.match(migration, /'unlinked'/);
assert.match(adminRoutes, /rejectedHistoryResult/);

assert.match(notifications, /writeInAppForCustomer/);
assert.match(notifications, /inAppWritten: true/);
assert.match(notifications, /path: '\/meters#link-history'/);
assert.match(worker, /inAppWritten\?: boolean/);
assert.match(worker, /includeInApp: !payload\.inAppWritten/);

assert.match(adminPage, /aria-label="Refresh queue"/);
assert.match(adminPage, /counts\.rejectedHistory/);
assert.match(metersPage, /\/api\/v1\/customer\/meters\/history/);
assert.match(metersPage, /id="link-history"/);
assert.match(metersPage, /Linking history/);
assert.match(notificationsPage, /meter_link_update/);
assert.match(notificationsPage, /Meter link decisions/);

console.log(JSON.stringify({
  status: "meter link lifecycle contract passed",
  seams: ["reapplication", "decision notifications", "history", "admin totals"],
}, null, 2));
