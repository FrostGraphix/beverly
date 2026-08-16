"use strict";

const ExcelJS = require("exceljs");

const EXPORT_COLUMNS = [
  ["Meter Id", "meterId", null, 18],
  ["Gateway Id", "gatewayId", null, 24],
  ["Collection Date", "currentDate", null, 22],
  ["Customer Id", "customerId", null, 18],
  ["Customer Name", "customerName", null, 32],
  ["Station Id", "stationId", null, 16],
  ["Total Energy", "total1", null, 16],
  ["Last Hour Usage", "usage1", null, 18],
  ["Credit Balance", "remain1", null, 18],
  ["Maximum Demand", "intervalDemand", null, 18],
  ["Power", "power", null, 14],
  ["Relay Status", "relayOpen", intervalHealthText, 16],
  ["Battery Status", "batteryLow", intervalHealthText, 16],
  ["Magnetic Status", "magneticInterference", intervalHealthText, 18],
  ["Terminal Cover", "terminalCoverOpen", intervalHealthText, 18],
  ["Upper Open", "coverOpen", intervalHealthText, 16],
  ["Current Reverse", "currentReverse", intervalHealthText, 18],
  ["Current Unbalance", "currentUnbalance", intervalHealthText, 20],
  ["Update Time", "updateDate", null, 22],
];

const NORMAL_VALUES = new Set(["normal", "closed", "false", "0", "no", "ok", "okay", "off", "inactive"]);
const ALL_TIME_START = "0001-01-01T00:00:00.000Z";
const MAX_SHEET_DATA_ROWS = 1_048_575;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function collectionRows(payload) {
  if (Array.isArray(payload?.result?.data)) return payload.result.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function collectionTotal(payload, fallback = 0) {
  return Number(payload?.result?.total ?? payload?.data?.total ?? payload?.total ?? fallback) || fallback;
}

function intervalHealthText(value) {
  if (value === null || value === undefined || value === "") return "Check";
  if (typeof value === "boolean") return value ? "Normal" : "Check";
  if (typeof value === "number") return value === 0 ? "Check" : "Normal";
  const text = String(value).trim().toLowerCase();
  if (!text || NORMAL_VALUES.has(text)) return "Check";
  const number = Number(text);
  if (Number.isFinite(number)) return number === 0 ? "Check" : "Normal";
  return "Normal";
}

function normalizeRow(row = {}) {
  return {
    meterId: row.meterId || row.serialNumber || "",
    gatewayId: row.gatewayId || row.gateway || "",
    currentDate: row.currentDate || row.collectionDate || row.timestamp || row.createDate || "",
    customerId: row.customerId || row.customerAccountId || "",
    customerName: row.customerName || row.name || "",
    stationId: row.stationId || row.station || row.siteId || "",
    total1: row.total1 ?? row.totalEnergy ?? row.energyReadingKwh ?? "",
    usage1: row.usage1 ?? row.lastHourUsage ?? row.energyConsumptionKwh ?? "",
    remain1: row.remain1 ?? row.creditBalance ?? row.energyBalanceKwh ?? "",
    intervalDemand: row.intervalDemand ?? row.maximumDemand ?? "",
    power: row.power ?? "",
    relayOpen: row.relayOpen ?? row.relayStatus,
    batteryLow: row.batteryLow ?? row.batteryStatus,
    magneticInterference: row.magneticInterference ?? row.magneticStatus,
    terminalCoverOpen: row.terminalCoverOpen ?? row.terminalCover,
    coverOpen: row.coverOpen ?? row.upperOpen,
    currentReverse: row.currentReverse,
    currentUnbalance: row.currentUnbalance,
    updateDate: row.updateDate || row.updateTime || row.createDate || row.timestamp || "",
  };
}

function rowMatchesSearch(row, searchTerm) {
  const query = String(searchTerm || "").trim().toLowerCase();
  if (!query) return true;
  return [row.meterId, row.gatewayId, row.currentDate, row.customerId, row.customerName, row.stationId]
    .some((value) => String(value ?? "").toLowerCase().includes(query));
}

function exportDateRange(range, now = new Date()) {
  const end = new Date(now);
  const normalizedRange = ["1d", "7d", "30d", "1y", "all"].includes(range) ? range : "all";
  if (normalizedRange === "all") return { from: ALL_TIME_START, to: end.toISOString() };
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const days = normalizedRange === "1y" ? 365 : Number(normalizedRange.replace("d", ""));
  // The live API treats currentDateRange's lower boundary as exclusive.
  start.setUTCDate(start.getUTCDate() - days);
  return { from: start.toISOString(), to: end.toISOString() };
}

function exportPageBatches(total, pageSize, concurrency) {
  const pageCount = Math.ceil(Math.max(0, Number(total) || 0) / Math.max(1, Number(pageSize) || 1));
  const batchSize = Math.max(1, Number(concurrency) || 1);
  const pages = Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => index + 2);
  const batches = [];
  for (let index = 0; index < pages.length; index += batchSize) batches.push(pages.slice(index, index + batchSize));
  return batches;
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function exportCancelled(response) {
  return response.destroyed || response.writableEnded;
}

function assertExportActive(response) {
  if (!exportCancelled(response)) return;
  const error = new Error("Interval export cancelled");
  error.code = "EXPORT_CANCELLED";
  throw error;
}

async function fetchPageWithRetry(fetchPage, payload, retries, retryDelayMs) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const result = await fetchPage(payload);
      if (!result || Number(result.status) >= 400) {
        const reason = result?.body?.reason || result?.body?.msg || `Upstream returned ${result?.status || "no response"}`;
        throw new Error(reason);
      }
      return result.body || result;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await wait(retryDelayMs * attempt);
    }
  }
  throw lastError || new Error("Interval export page failed");
}

function styleHeader(row) {
  row.height = 30;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF14532D" } } };
  });
}

function styleDataRow(row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true, shrinkToFit: true };
    cell.border = { bottom: { style: "hair", color: { argb: "FFD1D5DB" } } };
  });
}

function fitRowHeight(row) {
  const lines = EXPORT_COLUMNS.reduce((maximum, [, key, , width]) => {
    const text = String(row.getCell(key).value ?? "");
    const required = text.split(/\r?\n/).reduce((count, line) => count + Math.max(1, Math.ceil(line.length / Math.max(1, width - 2))), 0);
    return Math.max(maximum, required);
  }, 1);
  row.height = Math.min(409, Math.max(20, lines * 15));
}

async function streamIntervalXlsx(options) {
  const {
    response,
    fetchPage,
    range = "all",
    searchTerm = "",
    sortDirection = "desc",
    stationId = "",
    now = new Date(),
  } = options;
  const pageSize = Math.min(5000, positiveInteger(options.pageSize, 5000));
  const concurrency = Math.min(10, positiveInteger(options.concurrency, 10));
  const retries = Math.min(5, positiveInteger(options.retries, 3));
  const retryDelayMs = Math.min(5000, positiveInteger(options.retryDelayMs, 500));
  const maxSheetRows = Math.min(MAX_SHEET_DATA_ROWS, positiveInteger(options.maxSheetRows, MAX_SHEET_DATA_ROWS));
  const normalizedRange = ["1d", "7d", "30d", "1y", "all"].includes(range) ? range : "all";
  const dates = exportDateRange(normalizedRange, now);
  const direction = String(sortDirection).toLowerCase() === "asc" ? "asc" : "desc";
  const basePayload = {
    lang: "en",
    pageNumber: 1,
    pageSize,
    currentDateRange: [dates.from, dates.to],
    orderBy: `currentDate ${direction}`,
    ...(searchTerm ? { searchTerm } : {}),
    ...(stationId ? { stationId } : {}),
  };
  const firstPayload = await fetchPageWithRetry(fetchPage, basePayload, retries, retryDelayMs);
  assertExportActive(response);
  const firstRows = collectionRows(firstPayload);
  const total = collectionTotal(firstPayload, firstRows.length);
  const effectivePageSize = firstRows.length && firstRows.length < pageSize ? firstRows.length : pageSize;
  const fileName = `interval_data_${normalizedRange}_${dates.to.slice(0, 10)}.xlsx`;

  response.statusCode = 200;
  response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  response.setHeader("X-Export-Source-Rows", String(total));
  response.flushHeaders?.();

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: response, useStyles: true, useSharedStrings: false });
  workbook.creator = "Beverly";
  workbook.created = new Date(now);
  let worksheet = null;
  let worksheetRows = 0;
  let sheetCount = 0;
  let exportedRows = 0;
  let sourceRowsFetched = firstRows.length;

  const createWorksheet = () => {
    if (worksheet) worksheet.commit();
    sheetCount += 1;
    worksheetRows = 0;
    worksheet = workbook.addWorksheet(`Interval Data ${sheetCount}`, {
      views: [{ state: "frozen", ySplit: 1 }],
      properties: { defaultRowHeight: 20 },
    });
    worksheet.columns = EXPORT_COLUMNS.map(([header, key, , width]) => ({ header, key, width }));
    styleHeader(worksheet.getRow(1));
    worksheet.getRow(1).commit();
  };

  createWorksheet();
  const writeRows = async (rows) => {
    for (const sourceRow of rows) {
      const normalized = normalizeRow(sourceRow);
      if (!rowMatchesSearch(normalized, searchTerm)) continue;
      assertExportActive(response);
      if (worksheetRows >= maxSheetRows) createWorksheet();
      const values = Object.fromEntries(EXPORT_COLUMNS.map(([, key, format]) => [key, format ? format(normalized[key]) : normalized[key]]));
      const row = worksheet.addRow(values);
      styleDataRow(row);
      fitRowHeight(row);
      row.commit();
      worksheetRows += 1;
      exportedRows += 1;
    }
  };
  await writeRows(firstRows);

  for (const pageNumbers of exportPageBatches(total, effectivePageSize, concurrency)) {
    assertExportActive(response);
    const payloads = await Promise.all(pageNumbers.map((nextPage) => fetchPageWithRetry(
      fetchPage,
      { ...basePayload, pageNumber: nextPage },
      retries,
      retryDelayMs,
    )));
    assertExportActive(response);
    for (const payload of payloads) {
      const rows = collectionRows(payload);
      sourceRowsFetched += rows.length;
      await writeRows(rows);
    }
  }

  if (sourceRowsFetched !== total) throw new Error(`Interval export incomplete: received ${sourceRowsFetched} of ${total} rows`);

  worksheet.commit();
  await workbook.commit();
  return { exportedRows, sourceRows: total, sheetCount, fileName, from: dates.from, to: dates.to };
}

module.exports = {
  EXPORT_COLUMNS,
  exportDateRange,
  exportPageBatches,
  fetchPageWithRetry,
  normalizeRow,
  rowMatchesSearch,
  streamIntervalXlsx,
};
