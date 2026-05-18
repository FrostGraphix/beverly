/**
 * consumption-service.mjs
 * Orchestrates sales, consumption, and fraud data for the site page.
 */

import {
  buildConsumptionStationComparison,
  buildConsumptionTemporalSeries,
  buildCustomerRechargeHistory,
  buildMeterDeltaMap,
  buildStationComparison,
  buildTariffMap,
  buildTemporalSeries,
  combineStationDeltaMaps,
  computeSiteKpis,
  splitRevenueGap,
  summarizeDeltaMap,
} from "./consumption-aggregator.mjs";
import { buildSuspectLedger } from "./fraud-engine.mjs";

export const LIVE_STATIONS = ["TUNGA", "UMAISHA", "OGUFA", "KYAKALE", "MUSHA"];
export const LEDGER_STEPS_PER_STATION = 2;
export const SITE_CONSUMPTION_FIRST_DATA_DATE = "2025-01-01";
export const DAILY_METER_PAGE_SIZE = 1000;
export const DAILY_METER_MAX_ROWS = 0;

let tariffCache = null;
let tariffCacheExpiry = 0;

function readCookie(name) {
  if (typeof document === "undefined") return "";
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${encodeURIComponent(name)}=`))
    ?.split("=")[1] || "";
}

function authenticatedHeaders() {
  const token = readCookie("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${decodeURIComponent(token)}` } : {}),
  };
}

function getController(key) {
  return new AbortController();
}

/**
 * @returns {[string, string]}
 */
export function currentMonthRange() {
  const range = periodRange("month");
  return [range.from, range.to];
}

/**
 * @param {Date|string|number} baseDate
 * @returns {string}
 */
export function formatDate(baseDate = new Date()) {
  const date = new Date(baseDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * @param {"all"|"day"|"today"|"month"|"year"} key
 * @param {Date|string|number} baseDate
 * @returns {{ from: string, to: string, granularity: "daily"|"monthly" }}
 */
export function periodRange(key, baseDate = new Date()) {
  const now = new Date(baseDate);
  const today = formatDate(now);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  if (key === "day" || key === "today") {
    return { from: today, to: today, granularity: "daily" };
  }

  if (key === "month") {
    return { from: `${year}-${month}-01`, to: today, granularity: "daily" };
  }

  if (key === "year") {
    return { from: `${year}-01-01`, to: today, granularity: "monthly" };
  }

  return {
    from: SITE_CONSUMPTION_FIRST_DATA_DATE,
    to: today,
    granularity: "monthly",
  };
}

/**
 * @param {string} from
 * @param {string} to
 * @returns {{ priorFrom: string, priorTo: string }}
 */
function computePriorPeriodDates(from, to) {
  const pad = (value) => String(value).padStart(2, "0");
  const format = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const daySpan = Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
  const priorTo = new Date(from);
  priorTo.setDate(priorTo.getDate() - 1);
  const priorFrom = new Date(priorTo);
  priorFrom.setDate(priorFrom.getDate() - daySpan + 1);
  return { priorFrom: format(priorFrom), priorTo: format(priorTo) };
}

function previousDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  date.setDate(date.getDate() - 1);
  return formatDate(date);
}

function rowDate(row) {
  return String(row.currentDate || row.readingDate || "").substring(0, 10);
}

function filterRowsByRange(rows, from, to) {
  return rows.filter((row) => {
    const day = rowDate(row);
    return day >= from && day <= to;
  });
}

function filterDeltaMapByRange(deltaMap, from, to) {
  const filtered = new Map();
  for (const [meterId, deltas] of deltaMap.entries()) {
    const nextDeltas = deltas.filter((delta) => delta.date >= from && delta.date <= to);
    if (nextDeltas.length) filtered.set(meterId, nextDeltas);
  }
  return filtered;
}

/**
 * @param {string} path
 * @param {Object} body
 * @param {AbortSignal|null} signal
 * @returns {Promise<any>}
 */
async function postJSON(path, body, signal) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30000);
  const effectiveSignal = signal
    ? (typeof AbortSignal.any === "function"
      ? AbortSignal.any([signal, timeoutController.signal])
      : signal)
    : timeoutController.signal;

  try {
    const response = await fetch(path, {
      method: "POST",
      headers: authenticatedHeaders(),
      body: JSON.stringify(body),
      signal: effectiveSignal,
    });
    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body?.reason || body?.msg || "";
      } catch {
        detail = "";
      }
      if (response.status === 401) {
        throw new Error(`${path} returned 401. Sign in again, then refresh.`);
      }
      throw new Error(`${path} returned ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * @param {string} path
 * @param {Object} baseBody
 * @param {number} pageSize
 * @param {AbortSignal|null} signal
 * @param {{ maxRows?: number, maxPages?: number, returnPartialOnError?: boolean }} options
 * @returns {Promise<Array<Object>>}
 */
async function fetchAllPages(path, baseBody, pageSize = 500, signal = null, options = {}) {
  const result = await fetchAllPagesDetailed(path, baseBody, pageSize, signal, options);
  return result.rows;
}

async function fetchAllPagesDetailed(path, baseBody, pageSize = 500, signal = null, options = {}) {
  const rows = [];
  let total = Infinity;
  const maxRows = Number(options.maxRows) > 0 ? Number(options.maxRows) : Infinity;
  const maxPages = Number(options.maxPages) > 0 ? Number(options.maxPages) : Infinity;
  const concurrency = Math.max(1, Math.min(Number(options.concurrency || 1), 8));
  let partial = false;
  let source = "unknown";
  let warning = "";

  async function fetchPage(pageNumber) {
    const data = await postJSON(path, { ...baseBody, pageNumber, pageSize }, signal);
    const result = data?.result || data?.data || {};
    const pageRows = Array.isArray(result.data) ? result.data : [];
    const reportedTotal = Number(result.total);
    source = data?._proxy?.source || source;
    return {
      pageNumber,
      rows: pageRows,
      total: reportedTotal > 0 ? reportedTotal : null,
    };
  }

  let firstPage;
  try {
    firstPage = await fetchPage(1);
  } catch (error) {
    if (options.returnPartialOnError && rows.length > 0) {
      console.warn(`[consumption-service] Partial ${path} read returned ${rows.length} rows before ${error?.message || error}`);
      partial = true;
      warning = `${path} returned partial rows before ${error?.message || error}`;
      return { rows, total: rows.length, partial, source, warning };
    }
    throw error;
  }

  total = firstPage.total || (firstPage.rows.length > 0 ? Infinity : 0);
  rows.push(...firstPage.rows.slice(0, maxRows));
  if (!firstPage.rows.length || rows.length >= total || rows.length >= maxRows || maxPages <= 1) {
    return { rows, total: Number.isFinite(total) ? total : rows.length, partial, source, warning };
  }

  if (!Number.isFinite(total) || concurrency === 1) {
    let pageNumber = 2;
    while (rows.length < total && rows.length < maxRows && pageNumber <= maxPages) {
      let page;
      try {
        page = await fetchPage(pageNumber);
      } catch (error) {
        if (options.returnPartialOnError && rows.length > 0) {
          console.warn(`[consumption-service] Partial ${path} read returned ${rows.length} rows before ${error?.message || error}`);
          partial = true;
          warning = `${path} returned partial rows before ${error?.message || error}`;
          break;
        }
        throw error;
      }
      if (!page.rows.length) break;
      const remainingRows = maxRows - rows.length;
      rows.push(...page.rows.slice(0, remainingRows));
      pageNumber++;
    }
    return { rows, total: Number.isFinite(total) ? total : rows.length, partial, source, warning };
  }

  const boundedTotal = Math.min(total, maxRows);
  const totalPages = Math.min(Math.ceil(boundedTotal / pageSize), maxPages);
  for (let startPage = 2; startPage <= totalPages && rows.length < maxRows; startPage += concurrency) {
    const pageNumbers = Array.from(
      { length: Math.min(concurrency, totalPages - startPage + 1) },
      (_, index) => startPage + index
    );
    const pageResults = await Promise.allSettled(pageNumbers.map((pageNumber) => fetchPage(pageNumber)));
    let shouldStop = false;
    for (const result of pageResults) {
      if (result.status === "rejected") {
        if (options.returnPartialOnError && rows.length > 0) {
          console.warn(`[consumption-service] Partial ${path} read returned ${rows.length} rows before ${result.reason?.message || result.reason}`);
          partial = true;
          warning = `${path} returned partial rows before ${result.reason?.message || result.reason}`;
          shouldStop = true;
          break;
        }
        throw result.reason;
      }
      if (!result.value.rows.length) {
        shouldStop = true;
        break;
      }
      const remainingRows = maxRows - rows.length;
      rows.push(...result.value.rows.slice(0, remainingRows));
    }
    if (shouldStop) break;
  }

  return { rows, total: Number.isFinite(total) ? total : rows.length, partial, source, warning };
}

/**
 * @returns {Promise<Map<string, { price: number, tax: number, effectivePrice: number }>>}
 */
export async function fetchTariffMap() {
  if (tariffCache && Date.now() < tariffCacheExpiry) return tariffCache;
  const tariffRows = await fetchAllPages("/api/tariff/read", {}, 50);
  tariffCache = buildTariffMap(tariffRows);
  tariffCacheExpiry = Date.now() + (10 * 60 * 1000);
  return tariffCache;
}

/**
 * @param {string} from
 * @param {string} to
 * @param {string|null} stationId
 * @param {string} requestKey
 * @returns {Promise<Array<Object>>}
 */
export async function fetchTokenRecords(from, to, stationId = null, requestKey = "current") {
  if (!from || !to) throw new Error("fetchTokenRecords: from and to are required");
  const controller = getController(`tokenRecords:${requestKey}:${stationId || "ALL"}`);
  const payload = { FROM: from, TO: to };
  if (stationId) payload.stationId = stationId;
  try {
    return await fetchAllPages("/api/token/creditTokenRecord/read", payload, 5000, controller.signal);
  } catch (error) {
    if (error.name === "AbortError") return [];
    throw error;
  }
}

/**
 * @param {string} stationId
 * @param {string} from
 * @param {string} to
 * @returns {Promise<Array<Object>>}
 */
export async function fetchDailyMeterData(stationId, from, to) {
  const result = await fetchDailyMeterDataset(stationId, from, to);
  return result.rows;
}

export async function fetchDailyMeterDataset(stationId, from, to) {
  if (!stationId) throw new Error("fetchDailyMeterData: stationId is required");
  if (!from || !to) throw new Error("fetchDailyMeterData: date range is required");

  const controller = getController(`dailyMeter:${stationId}:${from}:${to}`);
  return fetchAllPagesDetailed(
    "/api/DailyDataMeter/read",
    { lang: "en", stationId, FROM: from, TO: to, compact: true },
    DAILY_METER_PAGE_SIZE,
    controller.signal,
    { maxRows: DAILY_METER_MAX_ROWS, returnPartialOnError: true, concurrency: 6 }
  );
}

/**
 * @param {string} from
 * @param {string} to
 * @param {Array<string>} stations
 * @returns {Promise<Map<string, Array<Object>>>}
 */
export async function fetchAllStationsDailyData(from, to, stations = LIVE_STATIONS) {
  const result = await fetchAllStationsDailyDataDetailed(from, to, stations);
  return result.stationRows;
}

export async function fetchAllStationsDailyDataDetailed(from, to, stations = LIVE_STATIONS) {
  const results = await Promise.allSettled(
    stations.map(async (stationId) => ({ stationId, dataset: await fetchDailyMeterDataset(stationId, from, to) }))
  );
  const stationRows = new Map();
  const stationMeta = new Map();
  const failures = [];
  const warnings = [];
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (result.status === "fulfilled") {
      stationRows.set(result.value.stationId, result.value.dataset.rows);
      stationMeta.set(result.value.stationId, {
        partial: !!result.value.dataset.partial,
        source: result.value.dataset.source || "unknown",
        total: result.value.dataset.total || result.value.dataset.rows.length,
      });
      if (result.value.dataset.warning) {
        warnings.push(`${result.value.stationId}: ${result.value.dataset.warning}`);
      }
    } else {
      failures.push(result.reason);
      warnings.push(`Station ${stations[index] || "unknown"} meter reads failed.`);
    }
  }
  if (!stationRows.size && failures.length) {
    const reason = failures[0] instanceof Error ? failures[0].message : String(failures[0]);
    throw new Error(`Meter reading data failed to load: ${reason}`);
  }
  return { stationRows, stationMeta, warnings };
}

export async function fetchConsumptionAudit() {
  const response = await fetch("/api/system/consumption-audit", {
    headers: authenticatedHeaders(),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Consumption audit returned 401. Sign in again, then refresh.");
    throw new Error(`Consumption audit failed with status ${response.status}`);
  }
  const payload = await response.json();
  return payload?.result || payload?.data || payload;
}

export async function fetchConsumptionSummary({ stationId = null, from, to, granularity = "monthly" }) {
  if (!from || !to) throw new Error("fetchConsumptionSummary: date range is required");
  const payload = {
    FROM: from,
    TO: to,
    BASELINE_FROM: previousDate(from),
    granularity,
  };
  if (stationId) payload.stationId = stationId;
  const data = await postJSON("/api/local/consumption/summary", payload);
  return data?.result || data?.data || data;
}

/**
 * @param {string|null} stationId
 * @returns {Promise<Array<Object>>}
 */
export async function fetchAccounts(stationId = null) {
  if (stationId) return fetchAllPages("/api/account/read", { stationId }, 5000);
  const results = await Promise.allSettled(
    LIVE_STATIONS.map((id) => fetchAllPages("/api/account/read", { stationId: id }, 5000))
  );
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

/**
 * @param {Array<Object>} tokenRecords
 * @param {string|null} stationId
 * @param {string|null} from
 * @param {string|null} to
 * @returns {Object}
 */
export function buildKpiData(tokenRecords, stationId = null, from = null, to = null) {
  const filteredRecords = stationId
    ? tokenRecords.filter((record) => String(record.stationId || "").toUpperCase() === stationId.toUpperCase())
    : tokenRecords;
  const sales = computeSiteKpis(filteredRecords);
  const periodDays = (from && to)
    ? Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1)
    : Math.max(1, new Set(filteredRecords.map((record) => String(record.createDate || "").substring(0, 10))).size);

  return {
    periodDays,
    purchasedKwh: sales.totalKwh,
    totalRevenue: sales.totalRevenue,
    rechargeCount: sales.rechargeCount,
    avgSoldKwhPerRecharge: sales.avgKwhPerRecharge,
    avgDailySoldKwh: parseFloat((sales.totalKwh / periodDays).toFixed(3)),
    consumedKwh: null,
    avgDailyConsumedKwh: null,
    revenueShortfall: null,
    netRevenueGap: null,
    creditBalance: null,
    highRiskCount: null,
    matchedMeters: null,
    unmatchedMeters: null,
  };
}

/**
 * @param {Array<Object>} tokenRecords
 * @returns {Array<Object>}
 */
export function buildStationChartData(tokenRecords) {
  return buildStationComparison(tokenRecords);
}

/**
 * @param {Array<Object>} tokenRecords
 * @param {"daily"|"weekly"|"monthly"|"yearly"} granularity
 * @param {string|null} stationId
 * @returns {{ labels: string[], kwhSeries: number[], revenueSeries: number[], countSeries: number[] }}
 */
export function buildTemporalChartData(tokenRecords, granularity, stationId = null) {
  return buildTemporalSeries(tokenRecords, granularity, stationId);
}

/**
 * @param {Object} params
 * @param {string} params.stationId
 * @param {Array<Object>} params.tokenRecords
 * @param {Map<string, { effectivePrice: number }>} params.tariffMap
 * @param {Array<Object>} params.prefetchedAccounts
 * @param {Map<string, Array<Object>>} params.prefetchedDeltaMap
 * @returns {Array<Object>}
 */
export function buildSuspectLedgerForStation({ stationId, tokenRecords, tariffMap, prefetchedAccounts, prefetchedDeltaMap }) {
  const stationTokens = tokenRecords.filter(
    (record) => String(record.stationId || "").toUpperCase() === stationId.toUpperCase()
  );
  return buildSuspectLedger({
    accounts: prefetchedAccounts || [],
    deltaMap: prefetchedDeltaMap || new Map(),
    tokenRecords: stationTokens,
    tariffMap,
  });
}

/**
 * @param {Map<string, Array<Object>>} stationRows
 * @returns {Map<string, Map<string, Array<Object>>>}
 */
function buildStationDeltaMaps(stationRows) {
  const stationDeltaMaps = new Map();
  for (const [stationId, rows] of stationRows.entries()) {
    stationDeltaMaps.set(stationId, buildMeterDeltaMap(rows));
  }
  return stationDeltaMaps;
}

function filterStationDeltaMapsByRange(stationDeltaMaps, from, to) {
  const filtered = new Map();
  for (const [stationId, deltaMap] of stationDeltaMaps.entries()) {
    filtered.set(stationId, filterDeltaMapByRange(deltaMap, from, to));
  }
  return filtered;
}

/**
 * @param {Array<Object>} tokenRecords
 * @param {Map<string, Array<Object>>} stationRows
 * @param {string} fallback
 * @returns {string}
 */
export function resolveFirstDataDate(tokenRecords = [], stationRows = new Map(), fallback = SITE_CONSUMPTION_FIRST_DATA_DATE) {
  const dates = [];

  for (const record of tokenRecords) {
    const day = String(record.createDate || "").substring(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) dates.push(day);
  }

  for (const rows of stationRows.values()) {
    for (const row of rows) {
      const day = String(row.currentDate || "").substring(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) dates.push(day);
    }
  }

  return dates.length ? dates.sort()[0] : fallback;
}

/**
 * @param {Map<string, Array<Object>>} stationRows
 * @param {Map<string, Map<string, Array<Object>>>} stationDeltaMaps
 * @param {string|null} stationId
 * @param {string} granularity
 * @param {number} periodDays
 * @returns {{ kpiUpdate: Object, charts: Object }}
 */
function buildConsumptionArtifacts(stationRows, stationDeltaMaps, stationId, granularity, periodDays) {
  const selectedDeltaMaps = stationId
    ? new Map([[stationId.toUpperCase(), stationDeltaMaps.get(stationId.toUpperCase()) || new Map()]])
    : stationDeltaMaps;
  const combinedDeltaMap = combineStationDeltaMaps(selectedDeltaMaps);
  const summary = summarizeDeltaMap(combinedDeltaMap);
  const stationBar = buildConsumptionStationComparison(selectedDeltaMaps);
  const temporal = buildConsumptionTemporalSeries(combinedDeltaMap, granularity);

  return {
    kpiUpdate: {
      consumedKwh: summary.consumedKwh,
      avgDailyConsumedKwh: parseFloat((summary.consumedKwh / Math.max(1, periodDays)).toFixed(3)),
    },
    charts: {
      stationBar,
      temporal,
      meta: {
        meterCount: summary.meterCount,
        metersWithConsumption: summary.metersWithConsumption,
        readingDayCount: summary.readingDayCount,
      },
    },
  };
}

/**
 * @param {Map<string, Array<Object>>} stationRows
 * @param {Map<string, Array<Object>>} accountsByStation
 * @returns {{ matchedMeters: number, unmatchedMeters: number }}
 */
function buildCoverageMetrics(stationRows, accountsByStation) {
  const matched = new Set();
  const unmatched = new Set();

  for (const [stationId, rows] of stationRows.entries()) {
    const accounts = accountsByStation.get(stationId) || [];
    const knownMeters = new Set(
      accounts
        .map((account) => String(account.meterId || account.customerId || "").toUpperCase())
        .filter(Boolean)
    );

    for (const row of rows) {
      const meterId = String(row.meterId || row.customerId || "").toUpperCase();
      if (!meterId) continue;
      if (knownMeters.has(meterId)) matched.add(`${stationId}:${meterId}`);
      else unmatched.add(`${stationId}:${meterId}`);
    }
  }

  return {
    matchedMeters: matched.size,
    unmatchedMeters: unmatched.size,
  };
}

/**
 * @param {Array<string>} stations
 * @param {Function|undefined} onProgress
 * @returns {(stationId: string, step: number) => void}
 */
function createLedgerProgressReporter(stations, onProgress) {
  const progressByStation = new Map(stations.map((stationId) => [stationId, 0]));
  return (stationId, step) => {
    const previous = progressByStation.get(stationId) || 0;
    const next = Math.max(previous, step);
    progressByStation.set(stationId, next);
    const completed = Array.from(progressByStation.values()).reduce((sum, value) => sum + value, 0);
    if (onProgress) onProgress(completed, stations.length * LEDGER_STEPS_PER_STATION, stationId);
  };
}

/**
 * @param {Object} filters
 * @param {Object} callbacks
 * @returns {Promise<void>}
 */
export async function loadConsumptionData(filters, callbacks) {
  const { stationId, from, to, granularity = "monthly", skipLedger = false } = filters;
  const { onKpiReady, onConsumptionReady, onChartsReady, onLedgerReady, onLedgerProgress, onRangeReady, onError, onWarning } = callbacks;

  if (!from || !to) {
    if (onError) onError(new Error("Date range is required"));
    return;
  }

  const selectedStationId = stationId ? stationId.toUpperCase() : null;
  const stations = selectedStationId ? [selectedStationId] : LIVE_STATIONS;

  try {
    const { priorFrom, priorTo } = computePriorPeriodDates(from, to);
    const isAllDataRange = from === SITE_CONSUMPTION_FIRST_DATA_DATE;
    const [tokenRecords, priorTokenRecords, tariffMap] = await Promise.all([
      fetchTokenRecords(from, to, selectedStationId, "current"),
      isAllDataRange ? [] : fetchTokenRecords(priorFrom, priorTo, selectedStationId, "prior").catch(() => []),
      fetchTariffMap(),
    ]);

    const firstTokenDate = isAllDataRange
      ? resolveFirstDataDate(tokenRecords, new Map(), from)
      : from;
    const kpiData = buildKpiData(tokenRecords, selectedStationId, firstTokenDate, to);
    const priorKpi = buildKpiData(priorTokenRecords, selectedStationId, priorFrom, priorTo);
    kpiData.priorPurchasedKwh = priorKpi.purchasedKwh;
    kpiData.priorRevenue = priorKpi.totalRevenue;
    kpiData.priorRechargeCount = priorKpi.rechargeCount;
    if (onKpiReady) onKpiReady(kpiData);

    const salesStationBar = buildStationChartData(tokenRecords);
    const salesTemporal = buildTemporalChartData(tokenRecords, granularity, selectedStationId);
    if (onChartsReady) {
      onChartsReady({
        sales: { stationBar: salesStationBar, temporal: salesTemporal },
        consumption: {
          stationBar: [],
          temporal: { labels: [], kwhSeries: [] },
          meta: { meterCount: 0, metersWithConsumption: 0, readingDayCount: 0 },
        },
      });
    }

    const summaryPromise = fetchConsumptionSummary({
      stationId: selectedStationId,
      from,
      to,
      granularity,
    }).catch((error) => {
      if (onWarning) onWarning(`Supabase consumption summary failed: ${error?.message || error}`);
      return null;
    });

    const summary = await summaryPromise;
    if (summary) {
      const avgDailyConsumedKwh = parseFloat(((Number(summary.consumedKwh) || 0) / Math.max(1, kpiData.periodDays)).toFixed(3));
      if (onConsumptionReady) {
        onConsumptionReady({
          consumedKwh: Number(summary.consumedKwh) || 0,
          avgDailyConsumedKwh,
        });
      }
      if (onChartsReady) {
        onChartsReady({
          sales: { stationBar: salesStationBar, temporal: salesTemporal },
          consumption: {
            stationBar: summary.stationBar || [],
            temporal: summary.temporal || { labels: [], kwhSeries: [] },
            meta: summary.meta || { meterCount: 0, metersWithConsumption: 0, readingDayCount: 0 },
          },
        });
      }
    }
    if (skipLedger && summary) {
      if (onLedgerReady) {
        onLedgerReady({
          ledger: [],
          kpiUpdate: {
            revenueShortfall: null,
            netRevenueGap: null,
            creditBalance: null,
            highRiskCount: null,
            matchedMeters: null,
            unmatchedMeters: null,
          },
          accountCounts: {},
        });
      }
      return;
    }

    const meterFrom = from === SITE_CONSUMPTION_FIRST_DATA_DATE ? from : previousDate(from);
    const { stationRows: stationRowsWithBaseline, warnings: meterWarnings } = await fetchAllStationsDailyDataDetailed(meterFrom, to, stations);
    meterWarnings.forEach((message) => onWarning && onWarning(message));
    const stationRows = new Map(
      Array.from(stationRowsWithBaseline.entries()).map(([station, rows]) => [station, filterRowsByRange(rows, from, to)])
    );
    const resolvedFrom = isAllDataRange
      ? resolveFirstDataDate(tokenRecords, stationRows, firstTokenDate)
      : from;
    if (resolvedFrom !== from && onRangeReady) onRangeReady({ from: resolvedFrom, to });
    if (resolvedFrom !== firstTokenDate) {
      const refreshedKpi = buildKpiData(tokenRecords, selectedStationId, resolvedFrom, to);
      kpiData.periodDays = refreshedKpi.periodDays;
      kpiData.avgDailySoldKwh = refreshedKpi.avgDailySoldKwh;
      if (onKpiReady) onKpiReady(kpiData);
    }
    const stationDeltaMaps = filterStationDeltaMapsByRange(buildStationDeltaMaps(stationRowsWithBaseline), from, to);
    const consumptionArtifacts = buildConsumptionArtifacts(
      stationRows,
      stationDeltaMaps,
      selectedStationId,
      granularity,
      kpiData.periodDays
    );

    if (onConsumptionReady) onConsumptionReady(consumptionArtifacts.kpiUpdate);
    if (onChartsReady) {
      onChartsReady({
        sales: { stationBar: salesStationBar, temporal: salesTemporal },
        consumption: consumptionArtifacts.charts,
      });
    }

    const reportProgress = createLedgerProgressReporter(stations, onLedgerProgress);
    const accountResults = await Promise.allSettled(
      stations.map(async (currentStationId) => {
        const accounts = await fetchAccounts(currentStationId);
        reportProgress(currentStationId, 1);
        return { stationId: currentStationId, accounts };
      })
    );

    const accountsByStation = new Map();
    for (let index = 0; index < accountResults.length; index++) {
      const result = accountResults[index];
      if (result.status === "fulfilled") accountsByStation.set(result.value.stationId, result.value.accounts);
      else onWarning && onWarning(`Account coverage failed for ${stations[index]}.`);
    }

    const ledgerResults = await Promise.allSettled(
      stations.map(async (currentStationId) => {
        const ledger = buildSuspectLedgerForStation({
          stationId: currentStationId,
          tokenRecords,
          tariffMap,
          prefetchedAccounts: accountsByStation.get(currentStationId) || [],
          prefetchedDeltaMap: stationDeltaMaps.get(currentStationId) || new Map(),
        });
        reportProgress(currentStationId, 2);
        return ledger;
      })
    );

    const ledger = [];
    for (let index = 0; index < ledgerResults.length; index++) {
      const result = ledgerResults[index];
      if (result.status === "fulfilled") {
        ledger.push(...result.value);
      } else {
        console.warn(`[consumption-service] Ledger failed for ${stations[index]}:`, result.reason?.message);
        if (onWarning) onWarning(`Ledger build failed for ${stations[index]}.`);
      }
    }
    ledger.sort((left, right) => right.riskScore - left.riskScore || right.shortfallGap - left.shortfallGap);

    const stationAccountCounts = {};
    for (const station of stations) {
      stationAccountCounts[station] = (accountsByStation.get(station) || []).length;
    }

    const coverage = buildCoverageMetrics(stationRows, accountsByStation);
    const netRevenueGap = parseFloat(ledger.reduce((sum, row) => sum + (Number(row.netGap) || 0), 0).toFixed(2));
    const gapSplit = splitRevenueGap(netRevenueGap);
    const highRiskCount = ledger.filter((row) => row.riskScore >= 70).length;

    if (onLedgerReady) {
      onLedgerReady({
        ledger,
        kpiUpdate: {
          revenueShortfall: gapSplit.shortfallGap,
          netRevenueGap: gapSplit.netGap,
          creditBalance: gapSplit.creditGap,
          highRiskCount,
          matchedMeters: coverage.matchedMeters,
          unmatchedMeters: coverage.unmatchedMeters,
        },
        accountCounts: stationAccountCounts,
      });
    }
  } catch (error) {
    if (error.name !== "AbortError" && onError) onError(error);
  }
}

export { buildCustomerRechargeHistory };
