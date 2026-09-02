"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const route = read("backend/wallet/src/routes/admin-reports.ts");
const page = read("apps/admin/src/views/Reports.vue");
const pdf = read("apps/admin/src/lib/report-pdf.ts");
const migration = read("supabase/migrations/20260901120000_wallet_report_entity_breakdowns.sql");

assert.match(route, /const REPORT_PAGE_SIZE = 1000/);
assert.match(route, /for \(let from = 0; ; from \+= REPORT_PAGE_SIZE\)/);
assert.match(route, /query\.range\(from, from \+ REPORT_PAGE_SIZE - 1\)/);
assert.match(route, /if \(page\.length < REPORT_PAGE_SIZE\) return rows/);
assert.match(route, /approved_amount_minor \?\? r\.amount_minor/);
assert.match(route, /const settledBatches = d\.settlements\.filter\(\(b\) => b\.status === 'settled'\)/);
assert.match(route, /const mismatchedRuns = .*status === 'mismatch'/);
assert.match(route, /for \(const p of d\.purchases\)/);
assert.match(route, /if \(p\.status === 'delivered'\)/);
assert.match(route, /purchaseStationScope: effectiveStations \? 'event_station_id'/);
assert.match(route, /relatedFinancialStationScope: effectiveStations \? 'current_owner_assignment'/);
assert.match(route, /'audit_logs_count', 'security_events_count'/);
assert.match(route, /return `\\uFEFF\$\{csv\}`/);

assert.match(migration, /p_transaction_status text default 'all'/);
assert.match(migration, /p_entity_id text default null/);
assert.match(migration, /p_transaction_status = 'successful' and po\.status = 'delivered'/);
assert.match(migration, /p_transaction_status = 'failed' and po\.status = 'failed'/);
assert.match(migration, /p_group_by = 'vendor' and po\.actor_id::text = p_entity_id/);
assert.match(migration, /p_group_by = 'customer'.*p_entity_id/s);

assert.match(page, /const FAMILY_METRICS/);
assert.match(page, /const reportKpiCards/);
assert.match(page, /Approved funding channels/);
assert.match(page, /Audit actions/);
assert.match(page, /Dispute states/);
assert.match(page, /Purchases use recorded event StationIDs/);
assert.match(page, /Related financial activity uses current owner assignments/);
assert.match(page, /if \(siteId\.value\) q\.set\('site_id', siteId\.value\)/);

assert.match(pdf, /Approved refunds by day/);
assert.match(pdf, /Successful funding by day/);
assert.match(pdf, /Case outcomes/);
assert.match(pdf, /Actual approved amounts|Approved refunds/);

console.log("wallet report accuracy contract passed");
