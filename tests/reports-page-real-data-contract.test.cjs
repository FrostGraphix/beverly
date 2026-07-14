"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const page = read("src/components/ReportsPage.vue");
const service = read("src/services/report-service.mjs");
const toolbar = read("src/components/base/ExportToolbar.vue");
const referenceApi = read("api/reference.js");
const backendReportService = read("backend/src/services/report-service.js");

assert.match(page, /selectedType: "financial"/);
assert.match(page, /reportData: null/);
assert.match(page, /activePreset: "7d"/);
assert.match(page, /v-model="stationId"/);
assert.match(page, /Filter reports by station/);
assert.match(page, /fetcher\(dateRange, filters\)/);
assert.match(page, /beverly-\$\{this\.selectedType\}-\$\{station\}-report/);
assert.match(page, /filename: `\$\{this\.exportFilename\}-\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}\.pdf`/);
assert.match(page, /:disabled="loading \|\| !reportData"/);
assert.match(page, /min-height: 112px/);
assert.match(page, /\.report-type-card \{[\s\S]*?white-space: normal;/);
assert.match(page, /\.report-type-desc \{[\s\S]*?overflow-wrap: anywhere;/);
assert.match(page, /<BaseTableShell v-else class="report-table-shell">/);
assert.match(page, /v-for="\(row, ri\) in pagedRows"/);
assert.match(page, /class="pagination"/);
assert.match(page, /class="ops-drawer-overlay" @click\.self="closeDrawer"/);
assert.match(page, /aria-label="Close row detail"/);
assert.match(page, /event\.key === "Escape"/);
assert.match(page, /\{ label: "1 Day", value: "1d" \}/);
assert.doesNotMatch(page, /90 Days|report-date-filter|applyCustomRange/);
assert.match(page, /:allowed-formats="\['csv', 'excel', 'pdf'\]"/);
assert.match(page, /--report-accent: var\(--primary\)/);
assert.match(page, /MutationObserver/);
assert.doesNotMatch(page, /#2563eb|37, 99, 235|#0ea5e9|#8b5cf6/);

assert.match(service, /function fetchOverviewReport/);
assert.doesNotMatch(service, /\/api\/v1\/admin\/reports\/overview/);
assert.match(service, /return requestReport\(fallback, dateRange, filters\)/);
assert.match(service, /transactions: "\/api\/reports\/transactions"/);
assert.match(service, /disputes: "\/api\/reports\/disputes"/);
assert.match(service, /result\?\.data \|\| result\?\.result/);
assert.match(service, /light: \{ text:/);
assert.match(service, /executive: \{ text:/);
assert.match(service, /contrast: \{ text:/);
assert.match(service, /label: "Meters"/);
assert.match(service, /label: "Active Stations"/);
assert.doesNotMatch(service, /label: "Active Meters"/);
assert.doesNotMatch(service, /#0ea5e9|#8b5cf6/);
assert.doesNotMatch(service, /generateDemo[A-Za-z]*Report/);
assert.doesNotMatch(service, /Math\.random/);

assert.match(toolbar, /!rows\.length && !pdfExporter/);
assert.match(toolbar, /format === "pdf" && this\.pdfExporter/);
assert.match(toolbar, /visibleFormats/);
assert.match(toolbar, /allowedFormats\.includes\(format\.id\)/);

assert.doesNotMatch(referenceApi, /if \(pathname === "\/api\/v1\/admin\/reports\/overview"\)[\s\S]{0,300}dispatchLocalDatabaseAction/);
assert.match(referenceApi, /authUserFromAccessToken\(token\)\.catch\(\(\) => null\)/);
assert.match(referenceApi, /pathname === "\/api\/reports\/transactions"/);
assert.match(referenceApi, /pathname === "\/api\/reports\/disputes"/);

assert.match(backendReportService, /l\.createdAt \|\| l\.created_at/);
assert.match(backendReportService, /mv_token_daily_summary/);
assert.match(backendReportService, /token_transactions/);
assert.match(backendReportService, /\/api\/token\/creditTokenRecord\/readMore/);
assert.match(backendReportService, /usesShortLiveRange/);
assert.match(backendReportService, /liveTokenPayments/);
assert.match(backendReportService, /reportStations/);
assert.match(backendReportService, /url\.searchParams\.set\("SITE_ID", stationId\)/);
assert.match(backendReportService, /reportStationId: stationId/);
assert.match(backendReportService, /payment\.meterId \|\| payment\.serialNumber/);
assert.match(backendReportService, /activeStations: activeStations\.size/);
assert.match(backendReportService, /site_id: reportStationDatabaseId\(filters\.stationId\)/);
assert.match(backendReportService, /value\[0\]\.toUpperCase\(\)/);
assert.match(backendReportService, /Object\.entries\(equals\)/);
assert.match(backendReportService, /String\(row\.site_code \|\| row\.site_id \|\| "-"\)\.toUpperCase\(\)/);
assert.match(backendReportService, /`\$\{row\.station\}:\$\{row\.meter\}`/);
assert.match(backendReportService, /readDailyMeterSummary/);
assert.match(backendReportService, /audit_logs\?select=/);
assert.doesNotMatch(backendReportService, /customerCount \|\| 10/);

console.log(JSON.stringify({ status: "reports page real data contract passed" }, null, 2));
