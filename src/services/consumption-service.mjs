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

let tariffCache = null;
let tariffCacheExpiry = 0;

const controllers = new Map();

function getController(key) {
  if (controllers.has(key)) controllers.get(key).abort();
  const controller = new AbortController();
  controllers.set(key, controller);
  return controller;
}

/**
 * @returns {[string, string]}
 */
export function currentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return [`${year}-${month}-01`, `${year}-${month}-${day}`];
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: effectiveSignal,
    });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
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
 * @returns {Promise<Array<Object>>}
 */
async function fetchAllPages(path, baseBody, pageSize = 500, signal = null) {
  const rows = [];
  let pageNumber = 1;
  let total = Infinity;

  while (rows.length < total) {
    const data = await postJSON(path, { ...baseBody, pageNumber, pageSize }, signal);
    const result = data?.result || data?.data || {};
    const pageRows = Array.isArray(result.data) ? result.data : [];

    if (pageNumber === 1) {
      const reportedTotal = Number(result.total);
      total = reportedTotal > 0 ? reportedTotal : (pageRows.length > 0 ? Infinity : 0);
    }

    if (pageRows.length === 0) break;
    rows.push(...pageRows);
    if (rows.length >= total) break;
    pageNumber++;
  }

  return rows;
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
    return await fetchAllPages("/api/token/creditTokenRecord/read", payload, 500, controller.signal);
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
  if (!stationId) throw new Error("fetchDailyMeterData: stationId is required");
  if (!from || !to) throw new Error("fetchDailyMeterData: date range is required");

  const controller = getController(`dailyMeter:${stationId}:${from}:${to}`);
  try {
    return await fetchAllPages(
      "/api/DailyDataMeter/read",
      { lang: "en", stationId, FROM: from, TO: to },
      500,
      controller.signal
    );
  } catch (error) {
    if (error.name === "AbortError") return [];
    throw error;
  }
}

/**
 * @param {string} from
 * @param {string} to
 * @param {Array<string>} stations
 * @returns {Promise<Map<string, Array<Object>>>}
 */
export async function fetchAllStationsDailyData(from, to, stations = LIVE_STATIONS) {
  const results = await Promise.allSettled(
    stations.map(async (stationId) => ({ stationId, rows: await fetchDailyMeterData(stationId, from, to) }))
  );
  const stationRows = new Map();
  for (const result of results) {
    if (result.status === "fulfilled") stationRows.set(result.value.stationId, result.value.rows);
  }
  return stationRows;
}

/**
 * @param {string|null} stationId
 * @returns {Promise<Array<Object>>}
 */
export async function fetchAccounts(stationId = null) {
  if (stationId) return fetchAllPages("/api/account/read", { stationId }, 500);
  const results = await Promise.allSettled(
    LIVE_STATIONS.map((id) => fetchAllPages("/api/account/read", { stationId: id }, 500))
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
  const { stationId, from, to, granularity = "monthly" } = filters;
  const { onKpiReady, onConsumptionReady, onChartsReady, onLedgerReady, onLedgerProgress, onError } = callbacks;

  if (!from || !to) {
    if (onError) onError(new Error("Date range is required"));
    return;
  }

  const selectedStationId = stationId ? stationId.toUpperCase() : null;
  const stations = selectedStationId ? [selectedStationId] : LIVE_STATIONS;

  try {
    const { priorFrom, priorTo } = computePriorPeriodDates(from, to);
    const [tokenRecords, priorTokenRecords, tariffMap] = await Promise.all([
      fetchTokenRecords(from, to, selectedStationId, "current"),
      fetchTokenRecords(priorFrom, priorTo, selectedStationId, "prior").catch(() => []),
      fetchTariffMap(),
    ]);

    const kpiData = buildKpiData(tokenRecords, selectedStationId, from, to);
    const priorKpi = buildKpiData(priorTokenRecords, selectedStationId, priorFrom, priorTo);
    kpiData.priorPurchasedKwh = priorKpi.purchasedKwh;
    kpiData.priorRevenue = priorKpi.totalRevenue;
    kpiData.priorRechargeCount = priorKpi.rechargeCount;
    if (onKpiReady) onKpiReady(kpiData);

    const salesStationBar = buildStationChartData(tokenRecords);
    const salesTemporal = buildTemporalChartData(tokenRecords, granularity, selectedStationId);

    const stationRows = await fetchAllStationsDailyData(from, to, stations);
    const stationDeltaMaps = buildStationDeltaMaps(stationRows);
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
    for (const result of accountResults) {
      if (result.status === "fulfilled") accountsByStation.set(result.value.stationId, result.value.accounts);
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
