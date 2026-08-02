"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const adminRoute = read("backend/wallet/src/routes/admin.ts") + read("backend/wallet/src/routes/admin-reports.ts");
const reportsView = read("apps/admin/src/views/Reports.vue");
const reportPdf = read("apps/admin/src/lib/report-pdf.ts");

assert.match(adminRoute, /from\('funding_requests'\)\.select\('amount_minor, channel, status, created_at'\)/);
assert.match(adminRoute, /fundingByChannel/);
assert.match(adminRoute, /disputesByStatus/);
assert.match(adminRoute, /refundsByStatus/);
assert.match(adminRoute, /settlementByStatus/);
assert.match(adminRoute, /sources:\s*\{/);

assert.match(reportsView, /fundingRows: moneyRows/);
assert.match(reportsView, /disputeRows: countRows/);
assert.match(reportsView, /settlementRows: countRows/);
assert.match(reportsView, /sources: report\.value\.sources/);

assert.match(reportPdf, /Data provenance/);
assert.match(reportPdf, /No estimated fields are used in this PDF\./);
assert.match(reportPdf, /Power BI \+ Tableau \+ Grafana inspired/);
assert.match(reportPdf, /Observability board/);
assert.match(reportPdf, /Performance matrix/);
assert.doesNotMatch(reportPdf, /Staff Logs|System Logs/);
assert.doesNotMatch(reportPdf, /Math\.round\(total \* 0\.6\)/);

console.log(JSON.stringify({ status: "report pdf real data contract passed" }, null, 2));
