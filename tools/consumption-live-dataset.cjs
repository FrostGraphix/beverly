"use strict";

const { collectionRowsFromPayload } = require("../backend/src/services/consumption-store");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function stringArg(name, fallback = "") {
  const value = argumentValue(name);
  return value === undefined ? fallback : String(value);
}

function numberArg(name, fallback = 0) {
  const numeric = Number(argumentValue(name));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function rowDay(row = {}) {
  const day = String(row.currentDate || row.readingDate || row.createDate || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function rowKey(stationId, row = {}) {
  const station = String(row.stationId || row.station || stationId || "").trim().toUpperCase();
  const meter = String(row.meterId || row.customerId || "").trim().toUpperCase();
  return `${station}|${meter}|${rowDay(row)}`;
}

function dedupeRows(stationId, rows = []) {
  const unique = new Map();
  for (const row of rows) {
    const day = rowDay(row);
    const meter = String(row.meterId || row.customerId || "").trim();
    if (!day || !meter) continue;
    const key = rowKey(stationId, row);
    if (!unique.has(key)) unique.set(key, row);
  }
  return Array.from(unique.values()).sort((left, right) =>
    rowDay(left).localeCompare(rowDay(right)) || rowKey(stationId, left).localeCompare(rowKey(stationId, right))
  );
}

function filterRowsByRange(rows = [], from, to, stationId = "") {
  const station = String(stationId || "").trim().toUpperCase();
  return rows.filter((row) => {
    const day = rowDay(row);
    const rowStation = String(row.stationId || row.station || station || "").trim().toUpperCase();
    return day && day >= from && day <= to && (!station || rowStation === station);
  });
}

function summarizeRows(rows = []) {
  const dates = rows.map(rowDay).filter(Boolean).sort();
  return {
    earliestReadingDate: dates[0] || null,
    latestReadingDate: dates[dates.length - 1] || null,
  };
}

function pageRows(payload) {
  return collectionRowsFromPayload(payload);
}

function liveBaseUrl() {
  return String(process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || "").replace(/\/+$/, "");
}

function liveHeaders() {
  const token = process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "";
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function postLive(pathname, payload, options = {}) {
  const baseUrl = liveBaseUrl();
  if (!baseUrl) throw new Error("LIVE_API_BASE_URL or UPSTREAM_API_URL is required");
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 45000));
  const maxRetries = Math.max(1, Number(options.maxRetries || 4));
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: liveHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.reason || body.msg || body.error || `Live request failed: ${response.status}`);
      return body;
    } catch (error) {
      lastError = error;
      if (typeof options.onRetry === "function") {
        options.onRetry({ payload, attempt, error: String(error?.message || error), maxRetries });
      }
      if (attempt < maxRetries) await new Promise((resolve) => setTimeout(resolve, Math.min(15000, attempt * attempt * 1000)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("Live request failed");
}

module.exports = {
  dedupeRows,
  filterRowsByRange,
  numberArg,
  pageRows,
  postLive,
  rowDay,
  rowKey,
  stringArg,
  summarizeRows,
};
