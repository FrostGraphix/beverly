"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const page = read("src/components/ArchiveReportsPage.vue");
const wizard = read("src/components/ArchiveExportWizard.vue");
const manifest = read("src/data/route-manifest.js");
const consumptionService = read("src/services/consumption-service.mjs");
const apiReference = read("api/reference.js");
const backendArchiveService = read("backend/src/services/reading-archive-service.js");
const archiveMigration = read("supabase/migrations/20260825130000_archive_reports_end_to_end_hardening.sql");

// 1. Component contract checks
assert.match(page, /buildArchiveSiteRows\(this\.stationOptions, this\.reports\)/, "Archive Reports must group partitions into one site row");
assert.match(page, /loadArchiveCatalogue\(fetchArchiveReports\)/, "Archive Reports must load every catalogue page");
assert.match(page, /v-for="site in filteredSites"/, "Archive Reports must render sites instead of partitions");
assert.doesNotMatch(page, /v-for="report in reports"/, "Archive Reports must not render one card per partition");
assert.match(page, /archive-mobile-list/, "Archive Reports must provide a readable mobile record layout");
assert.match(page, /@media \(max-width: 760px\)[\s\S]*?\.archive-reports__site-tools \.archive-filter:first-child \{ flex: 0 0 auto; min-width: 0; \}/, "Mobile search must not retain its desktop 280px flex basis");
assert.match(page, /--wallet-card-radius/, "Archive KPI cards must reuse the shared wallet card token");
assert.match(page, /props:\s*\{\s*route:\s*\{\s*type:\s*Object/, "ArchiveReportsPage must accept route prop");
assert.match(page, /<ArchiveExportWizard/, "Archive Reports must open the archive export wizard");
assert.match(wizard, /Choose archive sites/, "Archive wizard must provide site selection");
assert.match(wizard, /Define report coverage/, "Archive wizard must provide report options");
assert.match(wizard, /Review archive bundle/, "Archive wizard must provide review confirmation");
assert.match(wizard, /type="date"/, "Archive wizard must provide date-range controls");
assert.match(wizard, /buildArchiveBundle\(this\.matchedReports/, "Archive wizard must build the selected bundle");
assert.match(wizard, /requestDownload:\s*requestArchiveDownloadUrl/, "Archive wizard must mint signed links during export");
assert.match(wizard, /trapFocus\(event\)/, "Archive wizard must retain keyboard focus");
assert.match(wizard, /previousBodyOverflow/, "Archive wizard must restore page scrolling");
assert.match(page, /Source freshness/, "Archive Reports must surface synchronization freshness");
assert.match(page, /Coverage through/, "Archive Reports must distinguish actual coverage");
assert.match(page, /Refreshed/, "Archive Reports must distinguish refresh timestamps");
assert.match(page, /summary\.syncHealth/, "Archive Reports must consume durable sync health");
assert.match(page, /site\.refreshedAt/, "Archive Reports must show site refresh time");

// 2. Manifest contract checks
assert.match(manifest, /hash:\s*"#\/prepay-report\/archive-reports"/, "Manifest must declare #/prepay-report/archive-reports route");
assert.match(manifest, /actions:\s*\["Export archives",\s*"Refresh"\]/, "Manifest must expose the site-first archive workflow");
assert.match(manifest, /customComponent:\s*"ArchiveReportsPage"/, "Manifest must map customComponent to ArchiveReportsPage");
assert.match(manifest, /\/api\/local\/archive\/reports\/summary/, "Manifest must include summary API endpoint");
assert.match(manifest, /\/api\/local\/archive\/reports\/list/, "Manifest must include list API endpoint");
assert.match(manifest, /\/api\/local\/archive\/reports\/download/, "Manifest must include download API endpoint");

// 3. Service layer checks
assert.match(consumptionService, /export async function fetchArchiveReportsSummary/, "consumption-service must export fetchArchiveReportsSummary");
assert.match(consumptionService, /export async function fetchArchiveReports/, "consumption-service must export fetchArchiveReports");
assert.match(consumptionService, /export async function requestArchiveDownloadUrl/, "consumption-service must export requestArchiveDownloadUrl");

// 4. API reference & backend service checks
assert.match(apiReference, /pathname === "\/api\/local\/archive\/reports\/summary"/, "API reference must route summary endpoint");
assert.match(apiReference, /pathname === "\/api\/local\/archive\/reports\/list"/, "API reference must route list endpoint");
assert.match(apiReference, /pathname === "\/api\/local\/archive\/reports\/download"/, "API reference must route download endpoint");
assert.match(apiReference, /archiveReportsSummary\(\{\s*stationId:\s*archiveStationScope\(request\)\s*\|\|\s*null/s, "archive summary must enforce the authenticated station scope");
assert.match(apiReference, /stationId:\s*stationScope\s*\|\|\s*payload\.stationId\s*\|\|\s*query\.stationId\s*\|\|\s*null/, "archive listing must prefer the authenticated station scope");
assert.match(apiReference, /archiveSignedDownloadUrl\(reportId,\s*\{\s*stationScope:\s*archiveStationScope\(request\)\s*\|\|\s*null/s, "archive downloads must enforce the authenticated station scope");
assert.match(backendArchiveService, /reportsSummary/, "backend archive service must export reportsSummary");
assert.match(backendArchiveService, /listReports/, "backend archive service must export listReports");
assert.match(backendArchiveService, /signedDownloadUrl/, "backend archive service must export signedDownloadUrl");
assert.match(backendArchiveService, /restRequestWithResponse/, "archive listing must use an exact Supabase count");
assert.match(backendArchiveService, /stationScope/, "archive downloads must support enforced station scope");

// 5. Supabase catalogue/storage/retention contract checks
assert.match(archiveMigration, /add column if not exists oem_id uuid/, "archive index must persist OEM ownership");
assert.match(archiveMigration, /report_type in \('readings', 'payments'\)/, "archive schema must support both report types");
assert.match(archiveMigration, /granularity in \('monthly', 'yearly'\)/, "archive schema must support both grains");
assert.match(archiveMigration, /archive_candidate_partitions/, "readings partition discovery RPC is required");
assert.match(archiveMigration, /archive_payment_partitions/, "payments partition discovery RPC is required");
assert.match(archiveMigration, /archive_reports_summary/, "summary aggregation must execute in Supabase");
assert.match(archiveMigration, /prune_archived_daily_meter_readings/, "retention must be gated on an archive copy");
assert.match(archiveMigration, /revoke all on table public\.archive_reports from anon, authenticated/, "archive catalogue must stay behind the API");

console.log(JSON.stringify({ status: "archive reports page contract passed" }, null, 2));
