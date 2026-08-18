"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const page = read("src/components/ArchiveReportsPage.vue");
const manifest = read("src/data/route-manifest.js");
const consumptionService = read("src/services/consumption-service.mjs");
const apiReference = read("api/reference.js");
const backendArchiveService = read("backend/src/services/reading-archive-service.js");

// 1. Component contract checks
assert.match(page, /import[\s\S]*?pageSizeOptions[\s\S]*?from\s*"..\/services\/table-helpers.mjs";/, "ArchiveReportsPage must import pageSizeOptions from table-helpers.mjs");
assert.match(page, /import[\s\S]*?pageNumbers[\s\S]*?from\s*"..\/services\/table-helpers.mjs";/, "ArchiveReportsPage must import pageNumbers from table-helpers.mjs");
assert.match(page, /import[\s\S]*?paginateRows[\s\S]*?from\s*"..\/services\/table-helpers.mjs";/, "ArchiveReportsPage must import paginateRows from table-helpers.mjs");
assert.match(page, /import[\s\S]*?totalPages[\s\S]*?from\s*"..\/services\/table-helpers.mjs";/, "ArchiveReportsPage must import totalPages from table-helpers.mjs");
assert.match(page, /pageSizeOptions,/, "ArchiveReportsPage data must include pageSizeOptions");
assert.match(page, /pageSize:\s*20,/, "Default pageSize must match a valid value in pageSizeOptions");
assert.match(page, /props:\s*\{\s*route:\s*\{\s*type:\s*Object/, "ArchiveReportsPage must accept route prop");
assert.match(page, /this\.currentPage\s*=\s*1;/, "ArchiveReportsPage must reset currentPage on load");

// 2. Manifest contract checks
assert.match(manifest, /hash:\s*"#\/prepay-report\/archive-reports"/, "Manifest must declare #/prepay-report/archive-reports route");
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
assert.match(backendArchiveService, /reportsSummary/, "backend archive service must export reportsSummary");
assert.match(backendArchiveService, /listReports/, "backend archive service must export listReports");
assert.match(backendArchiveService, /signedDownloadUrl/, "backend archive service must export signedDownloadUrl");

console.log(JSON.stringify({ status: "archive reports page contract passed" }, null, 2));
