"use strict";

const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const ExcelJS = require("exceljs");
const {
  exportDateRange,
  exportPageBatches,
  streamIntervalXlsx,
} = require("../backend/src/services/interval-export-service");

class MockResponse extends PassThrough {
  constructor() {
    super();
    this.headers = {};
    this.chunks = [];
    this.on("data", (chunk) => this.chunks.push(Buffer.from(chunk)));
  }

  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = String(value);
  }

  flushHeaders() {}
}

const now = new Date("2026-07-14T12:00:00.000Z");
assert.deepEqual(exportDateRange("all", now), { from: "0001-01-01T00:00:00.000Z", to: "2026-07-14T12:00:00.000Z" });
assert.equal(exportDateRange("1d", now).from, "2026-07-13T00:00:00.000Z");
assert.equal(exportDateRange("7d", now).from, "2026-07-07T00:00:00.000Z");
assert.equal(exportDateRange("30d", now).from, "2026-06-14T00:00:00.000Z");
assert.equal(exportDateRange("1y", now).from, "2025-07-14T00:00:00.000Z");

for (const total of [428668, 428711, 1000003]) {
  const batches = exportPageBatches(total, 500, 6);
  const pages = batches.flat();
  const pageCount = Math.ceil(total / 500);
  assert.equal(pages.length, pageCount - 1);
  assert.equal(pages[0], 2);
  assert.equal(pages.at(-1), pageCount);
  assert.equal(new Set(pages).size, pageCount - 1);
  assert.equal(batches.every((batch) => batch.length <= 6), true);
}
assert.equal(exportDateRange("all", new Date("2027-08-19T12:00:00.000Z")).to, "2027-08-19T12:00:00.000Z");

(async () => {
  const response = new MockResponse();
  const attempts = new Map();
  const rows = [
    { meterId: "M-1", gatewayId: "=SUM(A1:A2)", customerName: `Alpha ${"Long customer name ".repeat(5)}`, currentDate: "2026-07-14", relayOpen: false },
    { meterId: "M-2", customerName: "Beta", currentDate: "2026-07-14", relayOpen: true },
    { meterId: "M-3", customerName: "Alpha Two", currentDate: "2026-07-13", relayOpen: false },
  ];
  const fetchPage = async (payload) => {
    assert.deepEqual(payload.currentDateRange, ["2026-07-07T00:00:00.000Z", "2026-07-14T12:00:00.000Z"]);
    assert.equal(payload.searchTerm, "alpha");
    assert.equal("FROM" in payload, false);
    attempts.set(payload.pageNumber, (attempts.get(payload.pageNumber) || 0) + 1);
    if (payload.pageNumber === 2 && attempts.get(2) === 1) return { status: 503, body: { reason: "retry" } };
    const pageRows = payload.pageNumber === 1 ? rows.slice(0, 2) : rows.slice(2);
    return { status: 200, body: { result: { total: 3, data: pageRows } } };
  };

  const summary = await streamIntervalXlsx({
    response,
    fetchPage,
    range: "7d",
    searchTerm: "alpha",
    now,
    pageSize: 5000,
    concurrency: 2,
    retries: 2,
    retryDelayMs: 1,
    maxSheetRows: 1,
  });
  assert.equal(response.writableEnded, true);
  assert.match(response.headers["content-type"], /spreadsheetml/);
  assert.match(response.headers["content-disposition"], /interval_data_7d_2026-07-14\.xlsx/);
  assert.equal(attempts.get(2), 2);
  assert.equal(summary.sourceRows, 3);
  assert.equal(summary.exportedRows, 2);
  const workbook = await new ExcelJS.Workbook().xlsx.load(Buffer.concat(response.chunks));
  const sheet = workbook.worksheets[0];
  const overflowSheet = workbook.worksheets[1];
  assert.equal(summary.sheetCount, 2);
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.getCell("A2").value, "M-1");
  assert.equal(sheet.getCell("B2").value, "=SUM(A1:A2)");
  assert.equal(sheet.getCell("B2").type, ExcelJS.ValueType.String);
  assert.equal(overflowSheet.getCell("A2").value, "M-3");
  assert.equal(sheet.getCell("A2").alignment.horizontal, "center");
  assert.equal(sheet.getCell("A2").alignment.vertical, "middle");
  assert.equal(sheet.getCell("A2").alignment.wrapText, true);
  assert.equal(sheet.getCell("A2").alignment.shrinkToFit, true);
  assert.equal(sheet.getRow(2).height > 20, true);
  assert.equal(sheet.getCell("A1").alignment.horizontal, "center");
  assert.equal(sheet.getColumn(1).width, 18);
  assert.equal(sheet.getColumn(5).width, 32);

  const cancelledResponse = new MockResponse();
  let cancelledFetches = 0;
  await assert.rejects(
    streamIntervalXlsx({
      response: cancelledResponse,
      fetchPage: async () => {
        cancelledFetches += 1;
        cancelledResponse.destroy();
        return { status: 200, body: { result: { total: 2, data: rows.slice(0, 1) } } };
      },
      now,
    }),
    (error) => error.code === "EXPORT_CANCELLED",
  );
  assert.equal(cancelledFetches, 1);

  console.log("interval-export-service ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
