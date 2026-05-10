"use strict";

const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

function stringArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function numberArg(name, fallback) {
  const value = stringArg(name, "");
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function liveBaseUrl() {
  const value = process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || "";
  if (!value) throw new Error("LIVE_API_BASE_URL or UPSTREAM_API_URL is required");
  return value.replace(/\/+$/, "");
}

function authHeaders() {
  const token = process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function pageRows(payload) {
  if (Array.isArray(payload?.result?.data)) return payload.result.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

function rowDay(row) {
  return String(row?.currentDate || row?.readingDate || row?.createDate || "").slice(0, 10);
}

function rowKey(stationId, row) {
  return [
    String(stationId || "").trim().toUpperCase(),
    String(row?.meterId || row?.customerId || "").trim().toUpperCase(),
    rowDay(row),
  ].join("|");
}

function rowInRange(row, from, to) {
  const day = rowDay(row);
  return Boolean(day && day >= from && day <= to);
}

async function postLive(pathname, payload, options = {}) {
  const timeoutMs = Number(options.timeoutMs || process.env.CONSUMPTION_BACKFILL_TIMEOUT_MS || 45000);
  const maxRetries = Number(options.maxRetries || process.env.CONSUMPTION_BACKFILL_RETRIES || 4);
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${liveBaseUrl()}${pathname}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.reason || body.msg || `Live request failed: ${response.status}`);
      return body;
    } catch (error) {
      lastError = error;
      if (typeof options.onRetry === "function") {
        options.onRetry({
          attempt,
          error: error instanceof Error ? error.message : String(error),
          payload,
          maxRetries,
        });
      }
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(15000, 1000 * attempt * attempt)));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("Live request failed");
}

function summarizeRows(rows) {
  let earliestReadingDate = null;
  let latestReadingDate = null;
  for (const row of rows) {
    const day = rowDay(row);
    if (!day) continue;
    if (!earliestReadingDate || day < earliestReadingDate) earliestReadingDate = day;
    if (!latestReadingDate || day > latestReadingDate) latestReadingDate = day;
  }
  return { earliestReadingDate, latestReadingDate };
}

function dedupeRows(stationId, rows) {
  const map = new Map();
  for (const row of rows) {
    const key = rowKey(stationId, row);
    const day = rowDay(row);
    if (!day || !String(key).includes("|")) continue;
    if (!String(row?.meterId || row?.customerId || "").trim()) continue;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((left, right) => {
    const leftDay = rowDay(left);
    const rightDay = rowDay(right);
    if (leftDay !== rightDay) return String(leftDay).localeCompare(String(rightDay));
    return String(left?.meterId || left?.customerId || "").localeCompare(String(right?.meterId || right?.customerId || ""));
  });
}

function filterRowsByRange(rows, from, to) {
  return rows.filter((row) => rowInRange(row, from, to));
}

async function fetchStationDataset(stationId, options = {}) {
  const normalizedStation = String(stationId || "").trim().toUpperCase();
  const pageSize = Number(options.pageSize || process.env.CONSUMPTION_BACKFILL_PAGE_SIZE || 500);
  const requestedFrom = String(options.from || process.env.CONSUMPTION_BACKFILL_FROM || "2025-01-01");
  const requestedTo = String(options.to || new Date().toISOString().slice(0, 10));
  let pageNumber = 1;
  let rawTotal = 0;
  const allRows = [];

  while (true) {
    const payload = {
      lang: "en",
      stationId: normalizedStation,
      FROM: requestedFrom,
      TO: requestedTo,
      pageNumber,
      pageSize,
    };
    const responsePayload = await postLive("/api/DailyDataMeter/read", payload, options);
    const rows = pageRows(responsePayload);
    rawTotal = Number(responsePayload?.result?.total ?? responsePayload?.data?.total ?? rows.length) || rawTotal;
    if (!rows.length) break;
    allRows.push(...rows);
    if (typeof options.onPage === "function") {
      options.onPage({
        stationId: normalizedStation,
        pageNumber,
        rows: rows.length,
        rawTotal,
      });
    }
    if (rows.length < pageSize || pageNumber * pageSize >= rawTotal) break;
    pageNumber++;
  }

  const uniqueRows = dedupeRows(normalizedStation, allRows);
  const summary = summarizeRows(uniqueRows);
  return {
    stationId: normalizedStation,
    requestedFrom,
    requestedTo,
    rawTotal,
    fetchedRows: allRows.length,
    uniqueRows,
    uniqueTotal: uniqueRows.length,
    pagesFetched: pageNumber,
    ...summary,
  };
}

module.exports = {
  dedupeRows,
  fetchStationDataset,
  filterRowsByRange,
  numberArg,
  pageRows,
  postLive,
  rowDay,
  rowInRange,
  rowKey,
  stringArg,
  summarizeRows,
};
