"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/migrations/20260805090000_customer_meters_approval_workflow.sql");
const tableMigration = read("supabase/migrations/20260525133000_customer_meters_phase_table.sql");
const routes = read("backend/wallet/src/routes/admin-meter-approvals.ts");
const purchases = read("backend/wallet/src/services/customer-purchase.ts");
const notifications = read("backend/wallet/src/services/notifications.ts");
const routePolicy = read("backend/wallet/src/contracts/route-policy.ts");
const page = read("apps/admin/src/views/MeterApprovals.vue");

assert.match(migration, /status text not null default 'pending'/);
assert.match(migration, /review_note text/);
assert.match(migration, /create unique index if not exists customer_meters_one_approved_owner_idx[\s\S]*where status = 'approved'/);
for (const sql of [migration, tableMigration]) {
  assert.match(sql, /alter table public\.customer_meters force row level security/);
  assert.match(sql, /revoke insert, update, delete, truncate, references, trigger[\s\S]*from authenticated/);
  assert.match(sql, /grant select on public\.customer_meters to authenticated/);
  assert.match(sql, /grant all on public\.customer_meters to service_role/);
}

assert.match(routes, /meterStatusSchema = z\.enum/);
assert.match(routes, /rejectSchema = z\.object\(\{ reason: z\.string\(\)\.trim\(\)\.min\(10\)\.max\(500\)/);
assert.match(routes, /scopeStations\(currentQuery, stationIds\)/);
assert.match(routes, /\.eq\('status', 'pending'\)[\s\S]*\.select\('\*'\)[\s\S]*\.maybeSingle\(\)/);
assert.match(routes, /meter_already_approved/);
assert.match(routes, /auditFromRequest\(req\)/);
assert.match(routes, /notifyMeterLinkUpdate/);
assert.match(routes, /meter_approval_schema_missing/);
assert.match(routes, /fastify\.post\('\/customer-meters\/:id\/unlink'/);
assert.match(routes, /unlinkSchema = z\.object\(\{ reason: z\.string\(\)\.trim\(\)\.min\(10\)\.max\(500\)/);
assert.match(routes, /action: 'customer_meter\.unlink'/);
assert.match(routes, /status: 'unlinked'/);
assert.match(routes, /listStatusSchema = z\.enum\(\['all', 'pending', 'approved', 'rejected'\]\)/);
assert.match(routes, /if \(status !== 'all'\) rowsQuery = rowsQuery\.eq\('status', status\)/);

assert.match(purchases, /const \{ data: link, error \} = await adminClient/);
assert.match(purchases, /meter_approval_unavailable/);
assert.match(purchases, /if \(status !== 'approved'\)/);

assert.match(notifications, /\| 'meter_link_update'/);
assert.match(notifications, /export function notifyMeterLinkUpdate/);
assert.match(notifications, /in_app:[\s\S]*meter_link_update: true/);

assert.match(routePolicy, /\/api\/v1\/admin\/customer-meters\/:id\/approve/);
assert.match(routePolicy, /\/api\/v1\/admin\/customer-meters\/:id\/reject/);
assert.match(routePolicy, /\/api\/v1\/admin\/customer-meters\/:id\/unlink/);

assert.match(page, /ownershipConfirmed/);
assert.match(page, /Verification note \*/);
assert.match(page, /setTimeout\([\s\S]*300\)/);
assert.match(page, /bw-kpi-grid bw-mobile-kpi-grid/);
assert.match(page, /meter-card-list/);
assert.match(page, /meter-pagination/);
assert.match(page, /Registered to:/);
assert.match(page, /Names differ — verify evidence/);
assert.match(page, /cancel-label="Keep pending"/);
assert.match(page, /The review service is temporarily unavailable/);
assert.match(page, /WalletDataViewSwitch/);
assert.match(page, /bw-kpi-grid bw-mobile-kpi-grid/);
assert.match(page, /Unlink meter from customer\?/);
assert.match(page, /\/unlink`, \{ reason:/);

console.log(JSON.stringify({
  status: "meter approval flow contract passed",
  coverage: ["schema", "authorization", "race safety", "purchase gate", "audit", "notifications", "responsive UI"],
}, null, 2));
