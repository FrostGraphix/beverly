/**
 * consumption-aggregator.mjs
 * Pure math functions for site consumption analytics.
 *
 * Domain rules:
 *  - DailyDataMeter.total1 is the meter odometer source of truth.
 *  - DailyDataMeter.usage1 is not trusted for consumption math.
 *  - Token totalUnit is units sold, not energy consumed.
 *  - Token totalPaid is revenue collected.
 */

/**
 * Returns ISO week key "YYYY-Www".
 *
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function toISOWeekKey(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "UNKNOWN";
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * @param {string} dateStr
 * @param {"daily"|"weekly"|"monthly"|"yearly"} granularity
 * @returns {string}
 */
export function toPeriodKey(dateStr, granularity) {
  const day = String(dateStr || "").substring(0, 10);
  switch (granularity) {
    case "daily":
      return day;
    case "weekly":
      return toISOWeekKey(day);
    case "monthly":
      return day.substring(0, 7);
    case "yearly":
      return day.substring(0, 4);
    default:
      return day;
  }
}

/**
 * @param {Array<Object>} rows
 * @returns {Array<Object>}
 */
export function deriveDailyDeltas(rows) {
  return rows.map((row, index) => {
    const currentTotal = Number(row.total1) || 0;
    const previousTotal = index === 0 ? currentTotal : (Number(rows[index - 1].total1) || 0);
    const delta = Math.max(0, currentTotal - previousTotal);
    const hasReading = row.total1 != null && row.total1 !== "";
    return {
      date: String(row.currentDate || "").substring(0, 10),
      delta: parseFloat(delta.toFixed(3)),
      total1: currentTotal,
      remain1: Number(row.remain1) || 0,
      tamper: !!(row.terminalCoverOpen || row.magneticInterference || row.currentReverse),
      relayOpen: !!row.relayOpen,
      hasReading,
    };
  });
}

/**
 * @param {number|string|null|undefined} baselineTotal1
 * @param {number|string|null|undefined} endTotal1
 * @returns {number}
 */
export function boundaryConsumption(baselineTotal1, endTotal1) {
  return parseFloat(Math.max(0, (Number(endTotal1) || 0) - (Number(baselineTotal1) || 0)).toFixed(3));
}

/**
 * @param {Array<Object>} meterRows
 * @returns {Map<string, Array<Object>>}
 */
export function buildMeterDeltaMap(meterRows) {
  const byMeter = new Map();
  for (const row of meterRows) {
    const meterId = String(row.meterId || row.customerId || "").toUpperCase();
    if (!meterId) continue;
    if (!byMeter.has(meterId)) byMeter.set(meterId, []);
    byMeter.get(meterId).push(row);
  }

  const deltaMap = new Map();
  for (const [meterId, rows] of byMeter) {
    const sortedRows = rows.slice().sort((left, right) =>
      String(left.currentDate || "").localeCompare(String(right.currentDate || ""))
    );
    deltaMap.set(meterId, deriveDailyDeltas(sortedRows));
  }
  return deltaMap;
}

/**
 * @param {Map<string, Array<Object>>} deltaMap
 * @param {"daily"|"weekly"|"monthly"|"yearly"} granularity
 * @returns {Record<string, number>}
 */
export function aggregateDeltasByPeriod(deltaMap, granularity = "daily") {
  const totals = {};
  for (const deltas of deltaMap.values()) {
    for (const delta of deltas) {
      const key = toPeriodKey(delta.date, granularity);
      totals[key] = parseFloat(((totals[key] || 0) + (Number(delta.delta) || 0)).toFixed(3));
    }
  }
  return Object.fromEntries(Object.entries(totals).sort(([left], [right]) => left.localeCompare(right)));
}

/**
 * @param {Map<string, Array<Object>>} deltaMap
 * @returns {Record<string, number>}
 */
export function summarizeDeltaMap(deltaMap) {
  let consumedKwh = 0;
  let meterCount = 0;
  let metersWithConsumption = 0;
  let readingDayCount = 0;

  for (const deltas of deltaMap.values()) {
    meterCount++;
    let meterTotal = 0;
    for (const delta of deltas) {
      meterTotal += Number(delta.delta) || 0;
      if (delta.hasReading) readingDayCount++;
    }
    if (meterTotal > 0) metersWithConsumption++;
    consumedKwh += meterTotal;
  }

  return {
    consumedKwh: parseFloat(consumedKwh.toFixed(3)),
    meterCount,
    metersWithConsumption,
    readingDayCount,
  };
}

/**
 * @param {Record<string, Map<string, Array<Object>>>|Map<string, Map<string, Array<Object>>>} stationDeltaMaps
 * @returns {Map<string, Array<Object>>}
 */
export function combineStationDeltaMaps(stationDeltaMaps) {
  const combined = new Map();
  const entries = stationDeltaMaps instanceof Map
    ? Array.from(stationDeltaMaps.entries())
    : Object.entries(stationDeltaMaps || {});

  for (const [, deltaMap] of entries) {
    if (!(deltaMap instanceof Map)) continue;
    for (const [meterId, deltas] of deltaMap.entries()) {
      combined.set(meterId, deltas);
    }
  }
  return combined;
}

/**
 * @param {Array<Object>} records
 * @param {string} granularity
 * @returns {Record<string, Object>}
 */
export function groupRevenueByStation(records, granularity = "monthly") {
  const grouped = {};
  for (const record of records) {
    const stationId = record.stationId || "UNKNOWN";
    const period = toPeriodKey(record.createDate, granularity);
    const key = `${stationId}|${period}`;
    if (!grouped[key]) {
      grouped[key] = { station: stationId, period, count: 0, totalPaid: 0, totalUnits: 0 };
    }
    grouped[key].count++;
    grouped[key].totalPaid = parseFloat((grouped[key].totalPaid + (Number(record.totalPaid) || 0)).toFixed(2));
    grouped[key].totalUnits = parseFloat((grouped[key].totalUnits + (Number(record.totalUnit) || 0)).toFixed(3));
  }
  return grouped;
}

/**
 * @param {Array<Object>} records
 * @param {string} granularity
 * @returns {Record<string, Object>}
 */
export function buildCustomerRechargeHistory(records, granularity = "monthly") {
  const result = {};
  for (const record of records) {
    const key = toPeriodKey(record.createDate, granularity);
    if (!result[key]) {
      result[key] = { period: key, count: 0, totalPaid: 0, totalUnits: 0, tariffs: new Set() };
    }
    result[key].count++;
    result[key].totalPaid = parseFloat((result[key].totalPaid + (Number(record.totalPaid) || 0)).toFixed(2));
    result[key].totalUnits = parseFloat((result[key].totalUnits + (Number(record.totalUnit) || 0)).toFixed(3));
    result[key].tariffs.add(record.tariffId || "");
  }

  for (const value of Object.values(result)) {
    value.tariffs = [...value.tariffs].filter(Boolean);
    value.avgPaid = value.count > 0 ? parseFloat((value.totalPaid / value.count).toFixed(2)) : 0;
  }

  return result;
}

/**
 * @param {Array<Object>} tariffRows
 * @returns {Map<string, { price: number, tax: number, effectivePrice: number }>}
 */
export function buildTariffMap(tariffRows) {
  const tariffMap = new Map();
  for (const tariff of tariffRows) {
    const tariffId = String(tariff.tariffId || "").toUpperCase();
    if (!tariffId) continue;
    const price = Number(tariff.price) || 0;
    const tax = Number(tariff.tax) || 0;
    tariffMap.set(tariffId, {
      price,
      tax,
      effectivePrice: parseFloat((price * (1 + tax / 100)).toFixed(4)),
    });
  }
  return tariffMap;
}

/**
 * @param {string} tariffId
 * @param {Map<string, { effectivePrice: number }>} tariffMap
 * @returns {number}
 */
export function resolveEffectivePrice(tariffId, tariffMap) {
  return tariffMap.get(String(tariffId || "").toUpperCase())?.effectivePrice ?? 350;
}

/**
 * @param {number} consumedKwh
 * @param {number} effectivePrice
 * @param {number} actualPaid
 * @returns {number}
 */
export function revenueGap(consumedKwh, effectivePrice, actualPaid) {
  const expected = (Number(consumedKwh) || 0) * (Number(effectivePrice) || 0);
  const actual = Number(actualPaid) || 0;
  return parseFloat((expected - actual).toFixed(2));
}

/**
 * @param {number} netGap
 * @returns {{ netGap: number, shortfallGap: number, creditGap: number }}
 */
export function splitRevenueGap(netGap) {
  const numericGap = parseFloat((Number(netGap) || 0).toFixed(2));
  return {
    netGap: numericGap,
    shortfallGap: parseFloat(Math.max(0, numericGap).toFixed(2)),
    creditGap: parseFloat(Math.max(0, -numericGap).toFixed(2)),
  };
}

/**
 * @param {Array<Object>} records
 * @param {string|null} stationId
 * @returns {{ totalKwh: number, totalRevenue: number, rechargeCount: number, avgKwhPerRecharge: number }}
 */
export function computeSiteKpis(records, stationId = null) {
  const filteredRecords = stationId
    ? records.filter((record) => String(record.stationId || "").toUpperCase() === String(stationId).toUpperCase())
    : records;

  let totalUnits = 0;
  let totalRevenue = 0;
  let rechargeCount = 0;

  for (const record of filteredRecords) {
    totalUnits += Number(record.totalUnit) || 0;
    totalRevenue += Number(record.totalPaid) || 0;
    rechargeCount++;
  }

  return {
    totalKwh: parseFloat(totalUnits.toFixed(3)),
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    rechargeCount,
    avgKwhPerRecharge: rechargeCount > 0 ? parseFloat((totalUnits / rechargeCount).toFixed(3)) : 0,
  };
}

/**
 * @param {Array<Object>} records
 * @returns {Array<Object>}
 */
export function buildStationComparison(records) {
  const byStation = {};
  for (const record of records) {
    const stationId = record.stationId || "UNKNOWN";
    if (!byStation[stationId]) {
      byStation[stationId] = {
        station: stationId,
        totalKwh: 0,
        totalRevenue: 0,
        rechargeCount: 0,
        byTariff: {},
      };
    }
    const station = byStation[stationId];
    station.totalKwh = parseFloat((station.totalKwh + (Number(record.totalUnit) || 0)).toFixed(3));
    station.totalRevenue = parseFloat((station.totalRevenue + (Number(record.totalPaid) || 0)).toFixed(2));
    station.rechargeCount++;

    const tariffId = record.tariffId || "UNKNOWN";
    if (!station.byTariff[tariffId]) {
      station.byTariff[tariffId] = { tariff: tariffId, totalKwh: 0, totalRevenue: 0, count: 0 };
    }
    station.byTariff[tariffId].totalKwh = parseFloat((station.byTariff[tariffId].totalKwh + (Number(record.totalUnit) || 0)).toFixed(3));
    station.byTariff[tariffId].totalRevenue = parseFloat((station.byTariff[tariffId].totalRevenue + (Number(record.totalPaid) || 0)).toFixed(2));
    station.byTariff[tariffId].count++;
  }

  return Object.values(byStation)
    .map((station) => ({
      ...station,
      tariffBreakdown: Object.values(station.byTariff).sort((left, right) => right.totalKwh - left.totalKwh),
    }))
    .sort((left, right) => right.totalKwh - left.totalKwh);
}

/**
 * @param {Map<string, Map<string, Array<Object>>>|Record<string, Map<string, Array<Object>>>} stationDeltaMaps
 * @returns {Array<Object>}
 */
export function buildConsumptionStationComparison(stationDeltaMaps) {
  const entries = stationDeltaMaps instanceof Map
    ? Array.from(stationDeltaMaps.entries())
    : Object.entries(stationDeltaMaps || {});

  return entries
    .map(([stationId, deltaMap]) => {
      const summary = summarizeDeltaMap(deltaMap instanceof Map ? deltaMap : new Map());
      const meterBreakdown = Array.from((deltaMap instanceof Map ? deltaMap : new Map()).entries())
        .map(([meterId, deltas]) => ({
          meterId,
          totalKwh: parseFloat(deltas.reduce((sum, delta) => sum + (Number(delta.delta) || 0), 0).toFixed(3)),
        }))
        .sort((left, right) => right.totalKwh - left.totalKwh);

      return {
        station: stationId,
        totalKwh: summary.consumedKwh,
        meterCount: summary.meterCount,
        meterBreakdown,
      };
    })
    .sort((left, right) => right.totalKwh - left.totalKwh);
}

/**
 * @param {Array<Object>} records
 * @param {"daily"|"weekly"|"monthly"|"yearly"} granularity
 * @param {string|null} stationId
 * @returns {{ labels: string[], kwhSeries: number[], revenueSeries: number[], countSeries: number[] }}
 */
export function buildTemporalSeries(records, granularity = "monthly", stationId = null) {
  const filteredRecords = stationId
    ? records.filter((record) => String(record.stationId || "").toUpperCase() === String(stationId).toUpperCase())
    : records;

  const grouped = {};
  for (const record of filteredRecords) {
    const key = toPeriodKey(record.createDate, granularity);
    if (!grouped[key]) grouped[key] = { kwh: 0, revenue: 0, count: 0 };
    grouped[key].kwh = parseFloat((grouped[key].kwh + (Number(record.totalUnit) || 0)).toFixed(3));
    grouped[key].revenue = parseFloat((grouped[key].revenue + (Number(record.totalPaid) || 0)).toFixed(2));
    grouped[key].count++;
  }

  const sortedEntries = Object.entries(grouped).sort(([left], [right]) => left.localeCompare(right));
  return {
    labels: sortedEntries.map(([key]) => key),
    kwhSeries: sortedEntries.map(([, value]) => value.kwh),
    revenueSeries: sortedEntries.map(([, value]) => value.revenue),
    countSeries: sortedEntries.map(([, value]) => value.count),
  };
}

/**
 * @param {Map<string, Array<Object>>} deltaMap
 * @param {"daily"|"weekly"|"monthly"|"yearly"} granularity
 * @returns {{ labels: string[], kwhSeries: number[] }}
 */
export function buildConsumptionTemporalSeries(deltaMap, granularity = "monthly") {
  const grouped = aggregateDeltasByPeriod(deltaMap, granularity);
  const labels = Object.keys(grouped);
  return {
    labels,
    kwhSeries: labels.map((label) => grouped[label]),
  };
}
