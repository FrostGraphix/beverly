"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const route = read("backend/wallet/src/routes/admin-reports.ts");
const adminRoute = read("backend/wallet/src/routes/admin.ts");
const page = read("apps/admin/src/views/Reports.vue");
const pdf = read("apps/admin/src/lib/report-pdf.ts");
const migration = read("supabase/migrations/20260901120000_wallet_report_entity_breakdowns.sql");

assert.match(migration, /wallet_report_purchase_breakdown/);
assert.match(migration, /p_group_by text default 'site'/);
assert.match(migration, /p_site_id text default null/);
assert.match(migration, /p_station_ids text\[\] default null/);
assert.match(migration, /when p_group_by = 'vendor' then f\.actor_id/);
assert.match(migration, /when p_group_by = 'customer' then f\.customer_id/);
assert.match(migration, /left join public\.vendor_organizations/);
assert.match(migration, /left join public\.customers/);
assert.match(migration, /count\(distinct f\.customer_id\)/);
assert.match(migration, /direct_purchase_count/);
assert.match(migration, /vendor_purchase_count/);
assert.match(migration, /security definer/);
assert.match(migration, /revoke all on function/);
assert.match(migration, /to service_role/);

assert.match(route, /reportGroupingSchema/);
assert.match(route, /site_forbidden/);
assert.match(route, /station_required/);
assert.match(route, /readOwnerScope/);
assert.match(route, /entityPerformance/);
assert.match(route, /\/reports\/power-bi\.csv/);
assert.match(adminRoute, /'GET \/reports\/power-bi\.csv': 'wallet\.dashboard\.view'/);
assert.match(route, /revenue_naira/);
assert.match(route, /minorToMajorString/);
assert.match(route, /revenueMinorExact/);
assert.match(route, /return `\\uFEFF\$\{csv\}`/);
assert.match(route, /Dates must use YYYY-MM-DD/);
assert.match(route, /Reporting periods cannot exceed ten years/);
assert.match(route, /\^\[\\t\\r \]\*\[=\+\\-@\]/);

assert.match(page, /Step 3 · Group performance/);
assert.match(page, /SiteID filter/);
assert.match(page, /Vendors split by SiteID/);
assert.match(page, /Customers split by SiteID/);
assert.match(page, /Power BI CSV/);
assert.match(page, /entityPerformance/);
assert.match(page, /Search breakdown/);
assert.match(page, /Performance breakdown pages/);
assert.match(page, /aria-label="Report start date"/);
assert.match(page, /aria-label="Report end date"/);

assert.match(pdf, /entityBreakdowns/);
assert.match(pdf, /performance by SiteID/);

console.log("wallet report breakdown contract passed");
