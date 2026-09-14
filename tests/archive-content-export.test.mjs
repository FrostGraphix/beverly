import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import fs from "node:fs";
import {
  archiveCsvFilename,
  buildArchiveBundle,
  buildArchiveSiteRows,
  canExpandArchive,
  createArchiveTar,
  fetchArchiveCsv,
  loadArchiveCatalogue,
  selectArchiveReports,
} from "../src/services/archive-content-export.mjs";

const siteRows = buildArchiveSiteRows(
  [
    { value: "OFEMILI", label: "OFEMILI · Calinmeter" },
    { value: "EMPTY", label: "EMPTY · Calinmeter" },
  ],
  [
    {
      stationId: "OFEMILI",
      oemSlug: "calinmeter",
      reportType: "readings",
      granularity: "monthly",
      rowCount: 40,
      byteSize: 400,
      coversFrom: "2026-07-01",
      coversTo: "2026-07-31",
      refreshedAt: "2026-09-14T08:00:00Z",
    },
    {
      stationId: "OFEMILI",
      oemSlug: "calinmeter",
      reportType: "readings",
      granularity: "yearly",
      rowCount: 40,
      byteSize: 500,
      coversFrom: "2026-07-01",
      coversTo: "2026-07-31",
      refreshedAt: "2026-09-14T09:00:00Z",
    },
  ],
);
assert.equal(siteRows.length, 2);
assert.deepEqual(siteRows.map((row) => row.stationId), ["EMPTY", "OFEMILI"]);
assert.equal(siteRows[0].state, "empty");
assert.equal(siteRows[1].reportCount, 2);
assert.equal(siteRows[1].rowCount, 40);
assert.equal(siteRows[1].byteSize, 900);
assert.deepEqual(siteRows[1].reportTypes, ["readings"]);
assert.equal(buildArchiveSiteRows([], [{ stationId: "YEARLY", granularity: "yearly", rowCount: 12 }])[0].rowCount, 12);
assert.equal(buildArchiveSiteRows([], [
  { stationId: "MIXED", reportType: "readings", granularity: "monthly", rowCount: 40 },
  { stationId: "MIXED", reportType: "readings", granularity: "yearly", rowCount: 40 },
  { stationId: "MIXED", reportType: "payments", granularity: "yearly", rowCount: 12 },
  { stationId: "MIXED", reportType: "payments", granularity: "yearly", rowCount: 8 },
])[0].rowCount, 60);

const selectedReports = selectArchiveReports([
  { id: "june", stationId: "OFEMILI", reportType: "readings", granularity: "monthly", coversFrom: "2026-06-01", coversTo: "2026-06-30" },
  { id: "july", stationId: "OFEMILI", reportType: "readings", granularity: "monthly", coversFrom: "2026-07-01", coversTo: "2026-07-31" },
  { id: "payments", stationId: "OFEMILI", reportType: "payments", granularity: "monthly", coversFrom: "2026-07-01", coversTo: "2026-07-31" },
  { id: "other", stationId: "BONDU", reportType: "readings", granularity: "monthly", coversFrom: "2026-07-01", coversTo: "2026-07-31" },
], {
  stationIds: ["OFEMILI"],
  reportTypes: ["readings"],
  granularity: "monthly",
  from: "2026-06-20",
  to: "2026-07-04",
});
assert.deepEqual(selectedReports.map((report) => report.id), ["june", "july"]);

const tar = createArchiveTar([
  { filename: "ofemili-june.csv.gz", bytes: new Uint8Array([1, 2, 3]) },
  { filename: "ofemili-july.csv.gz", bytes: new Uint8Array([4, 5]) },
]);
const tarBytes = new Uint8Array(await tar.arrayBuffer());
const tarText = new TextDecoder().decode(tarBytes);
assert.equal(tar.type, "application/x-tar");
assert.equal(tarBytes.byteLength % 512, 0);
assert.match(tarText, /ofemili-june\.csv\.gz/);
assert.match(tarText, /ofemili-july\.csv\.gz/);

const bundle = await buildArchiveBundle([
  { id: "one", stationId: "OFEMILI", byteSize: 3, filename: "one.csv.gz", coversFrom: "2026-06-01", coversTo: "2026-06-30" },
  { id: "two", stationId: "OFEMILI", byteSize: 2, filename: "two.csv.gz", coversFrom: "2026-07-01", coversTo: "2026-07-31" },
], {
  requestDownload: async (id) => ({ url: `https://example.test/${id}`, filename: `${id}.csv.gz` }),
  fetchImpl: async (url) => new Response(url.endsWith("one") ? new Uint8Array([1, 2, 3]) : new Uint8Array([4, 5])),
});
assert.equal(bundle.fileCount, 2);
assert.equal(bundle.filename, "beverly-archive-ofemili-2026-06-01-to-2026-07-31.tar");
assert.equal(bundle.blob.type, "application/x-tar");
await assert.rejects(
  buildArchiveBundle(Array.from({ length: 101 }, (_, index) => ({ id: String(index) })), {
    requestDownload: async () => ({ url: "https://example.test/archive" }),
  }),
  /support 100 files/,
);

const catalogueCalls = [];
const catalogue = await loadArchiveCatalogue(async ({ page, pageSize }) => {
  catalogueCalls.push({ page, pageSize });
  return page === 1
    ? { reports: [{ id: "one" }], pageCount: 2, totalCount: 2 }
    : { reports: [{ id: "two" }], pageCount: 2, totalCount: 2 };
});
assert.deepEqual(catalogue.map((report) => report.id), ["one", "two"]);
assert.deepEqual(catalogueCalls, [{ page: 1, pageSize: 100 }, { page: 2, pageSize: 100 }]);
await assert.rejects(
  loadArchiveCatalogue(async ({ page }) => ({
    reports: Array.from({ length: 100 }, (_, index) => ({ id: `${page}-${index}` })),
    pageCount: 2,
  }), {}, { maxReports: 100 }),
  /exceeds 100 files/,
);

assert.equal(archiveCsvFilename("station/readings.csv.gz"), "readings.csv");
assert.equal(canExpandArchive({ byteSize: 1024 }), true);
assert.equal(canExpandArchive({ byteSize: 26 * 1024 * 1024 }), false);

const csv = 'meter_id,reading_date,total1\n"M,1",2026-09-13,7.5\n';
const compressed = gzipSync(csv);
const report = { byteSize: compressed.length, filename: "station-readings.csv.gz" };
const result = await fetchArchiveCsv("https://example.test/archive", report, async () => new Response(compressed));
assert.equal(result.filename, "station-readings.csv");
assert.deepEqual([...new Uint8Array(await result.blob.arrayBuffer()).slice(0, 3)], [0xef, 0xbb, 0xbf]);
assert.equal(await result.blob.text(), csv);
await assert.rejects(fetchArchiveCsv("https://example.test/archive", report, async () => new Response(null, { status: 403 })), /failed/);

const page = fs.readFileSync(new URL("../src/components/ArchiveReportsPage.vue", import.meta.url), "utf8");
const wizard = fs.readFileSync(new URL("../src/components/ArchiveExportWizard.vue", import.meta.url), "utf8");
assert.match(page, /<ArchiveExportWizard/);
assert.match(wizard, /requestDownload: requestArchiveDownloadUrl/);
assert.match(wizard, /Download \$\{matchedReports\.length\} files/);
console.log("archive content export passed");
