"use strict";

const supabase = require("./supabase-service");
const { normalizeIntervalRow, conditionActive } = require("./abnormal-alarm-service");

// Signal columns on daily_meter_readings, in DB column -> upstream camelCase order.
// Single source of truth for the write-side (rowToRecord) and read-side
// (readDailyMeterRows/readCompactRowsFromStore) column list, so they can't drift.
const NUMERIC_SIGNAL_COLUMNS = [
  ["usage1", "usage1"],
  ["interval_demand", "intervalDemand"],
  ["power", "power"],
  ["voltage_a", "voltageA"],
  ["voltage_b", "voltageB"],
  ["voltage_c", "voltageC"],
  ["current_a", "currentA"],
  ["current_b", "currentB"],
  ["current_c", "currentC"],
];
// Boolean alarm flags. Stored as an already-resolved "is this alarm active" value
// (conditionActive() applied once, at ingestion) -- see
// abnormal-alarm-service.js's deriveAbnormalAlarmsFromResolvedFlags for why this
// must not be re-inverted on read.
const ALARM_FLAG_COLUMNS = [
  ["relay_open", "relayOpen"],
  ["battery_low", "batteryLow"],
  ["magnetic_interference", "magneticInterference"],
  ["terminal_cover_open", "terminalCoverOpen"],
  ["cover_open", "coverOpen"],
  ["current_reverse", "currentReverse"],
  ["current_unbalance", "currentUnbalance"],
];
const SIGNAL_SELECT_COLUMNS = [
  "gateway_id",
  ...NUMERIC_SIGNAL_COLUMNS.map(([col]) => col),
  "source2_activated",
  ...ALARM_FLAG_COLUMNS.map(([col]) => col),
];

function numericOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Reverse of signalColumnsFromRow: DB snake_case -> the camelCase keys
// deriveAbnormalAlarmsFromResolvedFlags (and normalizeIntervalRow) expect.
function signalColumnsToRow(dbRow) {
  const out = {
    gatewayId: dbRow.gateway_id,
    source2Activated: dbRow.source2_activated,
  };
  for (const [column, key] of NUMERIC_SIGNAL_COLUMNS) out[key] = dbRow[column];
  for (const [column, key] of ALARM_FLAG_COLUMNS) out[key] = dbRow[column];
  return out;
}

function storeEnabled() {
  if (process.env.SUPABASE_CONSUMPTION_STORE_ENABLED === "false") return false;
  return supabase.serviceConfigured();
}

function collectionRowsFromPayload(payload) {
  if (Array.isArray(payload?.result?.data)) return payload.result.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeDate(value) {
  const day = String(value || "").substring(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function normalizeStation(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeMeter(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeGranularity(value) {
  const normalized = String(value || "monthly").toLowerCase();
  return ["daily", "weekly", "monthly", "yearly"].includes(normalized) ? normalized : "monthly";
}

function requestPayload(source) {
  return Array.isArray(source) ? source[0] || {} : source || {};
}

function dailyMeterPath(pathname) {
  return /\/api\/DailyDataMeter\/read$/i.test(String(pathname || ""));
}

function rowToRecord(row, requestStation = "") {
  const stationId = normalizeStation(row.stationId || row.station || requestStation);
  const meterId = normalizeMeter(row.meterId || row.customerId);
  const readingDate = normalizeDate(row.currentDate || row.readingDate || row.createDate);
  if (!stationId || !meterId || !readingDate) return null;
  return {
    station_id: stationId,
    meter_id: meterId,
    customer_id: String(row.customerId || ""),
    customer_name: String(row.customerName || row.name || ""),
    reading_date: readingDate,
    total1: Number.isFinite(Number(row.total1)) ? Number(row.total1) : null,
    remain1: Number.isFinite(Number(row.remain1)) ? Number(row.remain1) : null,
    captured_at: new Date().toISOString(),
    ...signalColumnsFromRow(row, stationId),
  };
}

// Resolves the OEM fault/electrical signal fields (via abnormal-alarm-service.js's
// own alias-matching, so ingestion-time and read-time interpretation can never
// drift) into the typed daily_meter_readings columns. Booleans are stored as an
// already-resolved "is this alarm active" value -- see ALARM_FLAG_COLUMNS above.
function signalColumnsFromRow(row, stationId) {
  const normalized = normalizeIntervalRow(row, stationId);
  const out = {
    gateway_id: normalized.gatewayId ? String(normalized.gatewayId) : null,
    source2_activated: normalized.source2Activated === undefined ? null : Boolean(normalized.source2Activated),
  };
  for (const [column, key] of NUMERIC_SIGNAL_COLUMNS) out[column] = numericOrNull(normalized[key]);
  for (const [column, key] of ALARM_FLAG_COLUMNS) {
    out[column] = normalized[key] === undefined ? null : conditionActive(normalized[key]);
  }
  return out;
}

// row_json used to carry the full raw row here too -- same dead-write pattern
// already found and fixed on daily_meter_readings and audit_logs. The only
// read of this table (countRawDuplicateRows below) selects `id` alone; nothing
// anywhere reads row_json. The column has a NOT NULL DEFAULT '{}'::jsonb, so
// simply not sending it is enough -- no trigger needed like the main table
// required (this write path is low-frequency, duplicate-detection events only).
function rowToRawDuplicate(row, { requestStation = "", duplicateIndex = 1, eventType = "duplicate", sourcePage = null, sourceRow = null } = {}) {
  const stationId = normalizeStation(row.stationId || row.station || requestStation);
  const meterId = normalizeMeter(row.meterId || row.customerId);
  const readingDate = normalizeDate(row.currentDate || row.readingDate || row.createDate);
  if (!stationId) return null;
  return {
    station_id: stationId,
    meter_id: meterId || null,
    reading_date: readingDate || null,
    duplicate_index: duplicateIndex,
    event_type: eventType,
    source_page: Number.isFinite(Number(sourcePage)) ? Number(sourcePage) : null,
    source_row: Number.isFinite(Number(sourceRow)) ? Number(sourceRow) : null,
    captured_at: new Date().toISOString(),
  };
}

async function writeDailyMeterRows({ pathname, requestPayload: payload, responsePayload }) {
  if (!storeEnabled() || !dailyMeterPath(pathname)) return { stored: 0 };
  const request = requestPayload(payload);
  const requestStation = request.stationId || request.SITE_ID || request.siteId || "";
  const rows = collectionRowsFromPayload(responsePayload);
  if (!rows.length) return { stored: 0 };

  const records = rows
    .map((row) => rowToRecord(row, requestStation))
    .filter(Boolean);
  if (!records.length) return { stored: 0 };

  for (let index = 0; index < records.length; index += 500) {
    await supabase.restRequest("/daily_meter_readings?on_conflict=station_id,meter_id,reading_date", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: records.slice(index, index + 500),
    });
  }

  return { stored: records.length };
}

async function ingestWebhookReadings(payload) {
  if (!storeEnabled()) return { status: 503, body: { error: "Consumption store not enabled" } };
  
  const rows = Array.isArray(payload) ? payload : (payload.data || payload.readings || []);
  if (!rows.length) return { status: 400, body: { error: "No readings provided in payload" } };

  const records = rows
    .map((row) => rowToRecord(row, row.stationId || row.station || ""))
    .filter(Boolean);

  if (!records.length) return { status: 400, body: { error: "No valid readings could be parsed" } };

  for (let index = 0; index < records.length; index += 500) {
    await supabase.restRequest("/daily_meter_readings?on_conflict=station_id,meter_id,reading_date", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: records.slice(index, index + 500),
    });
  }

  return { status: 200, body: { success: true, stored: records.length } };
}

async function writeRawDuplicateRows({ requestPayload: payload, duplicateRows }) {
  if (!storeEnabled()) return { stored: 0 };
  const request = requestPayload(payload);
  const requestStation = request.stationId || request.SITE_ID || request.siteId || "";
  const records = (Array.isArray(duplicateRows) ? duplicateRows : [])
    .map((entry) => rowToRawDuplicate(entry.row || entry, {
      requestStation,
      duplicateIndex: entry.duplicateIndex,
      eventType: entry.eventType,
      sourcePage: entry.sourcePage,
      sourceRow: entry.sourceRow,
    }))
    .filter(Boolean);
  if (!records.length) return { stored: 0 };

  for (let index = 0; index < records.length; index += 500) {
    await supabase.restRequest("/daily_meter_raw_duplicates?on_conflict=station_id,event_type,source_page,source_row", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: records.slice(index, index + 500),
    });
  }
  return { stored: records.length };
}

async function countRawDuplicateRows(stationId = "") {
  const station = normalizeStation(stationId);
  const filters = ["select=id"];
  if (station) filters.push(`station_id=eq.${encodeURIComponent(station)}`);
  const { response } = await supabase.restRequestWithResponse(`/daily_meter_raw_duplicates?${filters.join("&")}`, {
    headers: {
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  return totalFromContentRange(response.headers.get("content-range"), 0);
}

function totalFromContentRange(value, fallback) {
  const match = String(value || "").match(/\/(\d+)$/);
  return match ? Number(match[1]) : fallback;
}

function toIsoWeekKey(value) {
  const date = new Date(`${String(value || "").substring(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "UNKNOWN";
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function periodKey(value, granularity) {
  const day = normalizeDate(value);
  if (!day) return "UNKNOWN";
  if (granularity === "daily") return day;
  if (granularity === "weekly") return toIsoWeekKey(day);
  if (granularity === "yearly") return day.substring(0, 4);
  return day.substring(0, 7);
}

function rowsToDeltas(rows) {
  const byMeter = new Map();
  for (const row of rows) {
    const meterId = normalizeMeter(row.meterId || row.customerId);
    if (!meterId) continue;
    if (!byMeter.has(meterId)) byMeter.set(meterId, []);
    byMeter.get(meterId).push(row);
  }

  const deltas = [];
  for (const [meterId, meterRows] of byMeter.entries()) {
    const sortedRows = meterRows.slice().sort((left, right) =>
      String(left.currentDate || "").localeCompare(String(right.currentDate || ""))
    );
    for (let index = 0; index < sortedRows.length; index++) {
      const row = sortedRows[index];
      const currentTotal = Number(row.total1) || 0;
      const previousTotal = index === 0 ? currentTotal : Number(sortedRows[index - 1].total1) || 0;
      deltas.push({
        stationId: normalizeStation(row.stationId),
        meterId,
        date: normalizeDate(row.currentDate),
        delta: parseFloat(Math.max(0, currentTotal - previousTotal).toFixed(3)),
        hasReading: row.total1 != null && row.total1 !== "",
      });
    }
  }
  return deltas;
}

async function countDailyMeterRows(stationId = "") {
  const station = normalizeStation(stationId);
  const filters = ["select=id"];
  if (station) filters.push(`station_id=eq.${encodeURIComponent(station)}`);
  const { response } = await supabase.restRequestWithResponse(`/daily_meter_readings?${filters.join("&")}`, {
    headers: {
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  return totalFromContentRange(response.headers.get("content-range"), 0);
}

async function dateBoundForStation(stationId = "", direction = "asc") {
  const station = normalizeStation(stationId);
  if (!station) return null;
  const order = String(direction).toLowerCase() === "desc" ? "desc" : "asc";
  const query = [
    "select=reading_date",
    `station_id=eq.${encodeURIComponent(station)}`,
    `order=reading_date.${order}`,
    "limit=1"
  ].join("&");
  const { body } = await supabase.restRequestWithResponse(`/daily_meter_readings?${query}`, {});
  const row = Array.isArray(body) ? body[0] : null;
  return row?.reading_date || null;
}

async function dailyMeterStationStats(stations = []) {
  if (!storeEnabled()) {
    return {
      enabled: false,
      tableReady: false,
      totalRows: 0,
      stations: [],
      error: "Supabase consumption store is not configured",
    };
  }

  try {
    const stationStats = [];
    let totalRows = 0;
    for (const station of stations) {
      const rows = await countDailyMeterRows(station);
      let rawDuplicateRows = 0;
      try {
        rawDuplicateRows = await countRawDuplicateRows(station);
      } catch {
        rawDuplicateRows = 0;
      }
      const earliestReadingDate = await dateBoundForStation(station, "asc");
      const latestReadingDate = await dateBoundForStation(station, "desc");
      totalRows += rows;
      stationStats.push({ station, rows, rawDuplicateRows, logicalRawRows: rows + rawDuplicateRows, earliestReadingDate, latestReadingDate });
    }
    return {
      enabled: true,
      tableReady: true,
      totalRows,
      stations: stationStats,
    };
  } catch (error) {
    return {
      enabled: true,
      tableReady: false,
      totalRows: 0,
      stations: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function dailyMeterTableReport(stations = []) {
  const stats = await dailyMeterStationStats(stations);
  return {
    ...stats,
    stations: Array.isArray(stats.stations)
      ? stats.stations.map(({ station, rows, rawDuplicateRows, logicalRawRows }) => ({ station, rows, rawDuplicateRows, logicalRawRows }))
      : [],
  };
}

async function readDailyMeterRows({ pathname, requestPayload: payload }) {
  if (!storeEnabled() || !dailyMeterPath(pathname)) return null;
  const request = requestPayload(payload);
  const stationId = normalizeStation(request.stationId || request.SITE_ID || request.siteId);
  const from = normalizeDate(request.FROM || request.from);
  const to = normalizeDate(request.TO || request.to);
  if (!stationId || !from || !to) return null;

  const pageNumber = Math.max(1, Number(request.pageNumber || 1));
  const pageSize = Math.max(1, Math.min(Number(request.pageSize || 5000), 5000));
  const offset = (pageNumber - 1) * pageSize;
  const rangeEnd = offset + pageSize - 1;
  // row_json is no longer read. It carried the raw OEM payload, but the nightly
  // retention job blanks it after 7 days, so it was already absent from ~89% of
  // rows: a non-compact read of anything older returned zero rows and silently
  // fell through to the upstream proxy. Both modes now reconstruct from the
  // persisted scalar columns, which are populated for every row regardless of
  // age. This also removes the last reader of row_json, allowing the column to
  // be blanked and eventually dropped.
  const query = [
    `select=station_id,meter_id,customer_id,customer_name,reading_date,total1,remain1,${SIGNAL_SELECT_COLUMNS.join(",")}`,
    `station_id=eq.${encodeURIComponent(stationId)}`,
    `reading_date=gte.${encodeURIComponent(from)}`,
    `reading_date=lte.${encodeURIComponent(to)}`,
    "order=reading_date.asc,meter_id.asc",
  ].join("&");

  const { response, body } = await supabase.restRequestWithResponse(`/daily_meter_readings?${query}`, {
    headers: {
      Prefer: "count=exact",
      Range: `${offset}-${rangeEnd}`,
    },
  });
  const rows = (Array.isArray(body) ? body : [])
    .map((row) => ({
      stationId: row.station_id,
      meterId: row.meter_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      currentDate: row.reading_date,
      total1: row.total1,
      remain1: row.remain1,
      ...signalColumnsToRow(row),
    }))
    .filter((row) => row.stationId || row.meterId);
  if (!rows.length) return null;
  const total = totalFromContentRange(response.headers.get("content-range"), rows.length);
  return {
    status: 200,
    body: {
      code: 0,
      msg: "success",
      reason: "success",
      data: { total, data: rows },
      result: { total, data: rows },
      _proxy: {
        source: "supabase-consumption",
        pathname,
      },
    },
  };
}

async function readCompactRowsFromStore({ stationId, from, to }) {
  const station = normalizeStation(stationId);
  const pageSize = 1000;
  const filters = [
    `select=station_id,meter_id,customer_id,customer_name,reading_date,total1,remain1,${SIGNAL_SELECT_COLUMNS.join(",")}`,
    `reading_date=gte.${encodeURIComponent(from)}`,
    `reading_date=lte.${encodeURIComponent(to)}`,
    "order=station_id.asc,meter_id.asc,reading_date.asc",
  ];
  if (station) filters.splice(1, 0, `station_id=eq.${encodeURIComponent(station)}`);
  const query = `/daily_meter_readings?${filters.join("&")}`;

  async function fetchRange(offset, withCount = false) {
    const rangeEnd = offset + pageSize - 1;
    const { response, body } = await supabase.restRequestWithResponse(query, {
      headers: {
        ...(withCount ? { Prefer: "count=planned" } : {}),
        Range: `${offset}-${rangeEnd}`,
      },
    });
    const pageRows = Array.isArray(body) ? body : [];
    return {
      rows: pageRows,
      total: withCount ? totalFromContentRange(response.headers.get("content-range"), null) : null,
    };
  }

  const firstPage = await fetchRange(0, true);
  const rows = [...firstPage.rows];
  const total = firstPage.total;
  const offsets = [];
  for (let offset = pageSize; offset < (total ?? pageSize); offset += pageSize) offsets.push(offset);

  const concurrency = 6;
  let lastPage = firstPage;
  for (let index = 0; index < offsets.length; index += concurrency) {
    const pageResults = await Promise.all(offsets.slice(index, index + concurrency).map((offset) => fetchRange(offset)));
    for (const result of pageResults) rows.push(...result.rows);
    lastPage = pageResults[pageResults.length - 1] || lastPage;
  }

  let nextOffset = offsets.length ? offsets[offsets.length - 1] + pageSize : pageSize;
  while (lastPage.rows.length === pageSize) {
    lastPage = await fetchRange(nextOffset);
    rows.push(...lastPage.rows);
    nextOffset += pageSize;
  }

  return rows.map((row) => ({
    stationId: row.station_id,
    meterId: row.meter_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    currentDate: row.reading_date,
    total1: row.total1,
    remain1: row.remain1,
    ...signalColumnsToRow(row),
  }));
}

// ── Aggregate-backed helpers ──────────────────────────────────────────────────

/**
 * granularity → pg period_type used in meter_consumption_aggregates.
 * 'weekly' maps to 'week', etc.
 */
function aggPeriodType(granularity) {
  if (granularity === "yearly")  return "year";
  if (granularity === "monthly") return "month";
  if (granularity === "weekly")  return "week";
  return "day";
}

/**
 * Pick an efficient (and chart-readable) granularity for a given window width.
 * Fetching per-meter DAILY rows over a multi-month range pulls hundreds of
 * thousands of rows and produces an unreadable chart. Coarsen the finer choices
 * for wide windows; never coarsen below what the user picked.
 *
 * Thresholds are aligned with the page's rolling-window presets:
 *   Last 30 Days  → daily   (≤ 45 d)
 *   Last 90 Days  → weekly  (46–185 d)
 *   Last 12 Months/All Time → monthly (> 185 d)
 */
function effectiveGranularity(granularity, windowDays) {
  if (granularity === "daily") {
    if (windowDays > 185) return "monthly";
    if (windowDays > 45)  return "weekly";
  } else if (granularity === "weekly") {
    if (windowDays > 185) return "monthly";
  }
  return granularity;
}

function dateParts(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function isMonthStart(day) {
  const parts = dateParts(day);
  return !!parts && parts.day === 1;
}

function isMonthEnd(day) {
  const parts = dateParts(day);
  if (!parts) return false;
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  return parts.day === lastDay;
}

function isoWeekday(day) {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getUTCDay() || 7;
}

function isWeeklyBoundary(from, to) {
  return isoWeekday(from) === 1 && isoWeekday(to) === 7;
}

function supportsExactAggregateRange(granularity, from, to) {
  if (granularity === "monthly") return isMonthStart(from) && isMonthEnd(to);
  if (granularity === "weekly") return isWeeklyBoundary(from, to);
  if (granularity === "yearly") return /-\d{2}-\d{2}$/.test(from) && from.endsWith("-01-01") && to.endsWith("-12-31");
  return true;
}

/**
 * Convert a period_start date (ISO YYYY-MM-DD) to the display key used by the
 * existing frontend consumers (same format as periodKey()).
 */
function aggPeriodKey(periodStart, granularity) {
  const day = String(periodStart || "").substring(0, 10);
  if (!day) return "UNKNOWN";
  if (granularity === "daily")   return day;
  if (granularity === "weekly") {
    // ISO week: keep the YYYY-Www format that toIsoWeekKey produces
    return toIsoWeekKey(day);
  }
  if (granularity === "yearly")  return day.substring(0, 4);
  return day.substring(0, 7); // monthly: YYYY-MM
}

/**
 * Fetch pre-aggregated consumption rows for one or more stations.
 * Returns an array of { stationId, meterId, customerId, customerName,
 *   periodStart, kwhTotal, readingCount } covering the requested range.
 * Returns null if the aggregate table doesn't exist yet.
 */
// Paginate one station's aggregate rows. Splitting the overall fetch into
// per-station queries keeps OFFSETs shallow (PostgREST offset pagination is
// O(n) per page, so one big cross-station scan with deep offsets is far slower
// than several small per-station scans run in parallel).
async function fetchStationAggregateRows({ station, periodType, fromBound, to, pageSize }) {
  const filters = [
    "select=station_id,meter_id,customer_id,customer_name,period_type,period_start,kwh_total,reading_count,tariff_value_ngn,priced_kwh,unpriced_kwh",
    `station_id=eq.${encodeURIComponent(station)}`,
    `period_type=eq.${encodeURIComponent(periodType)}`,
    `period_start=gte.${encodeURIComponent(fromBound)}`,
    `period_start=lte.${encodeURIComponent(to)}`,
    "order=meter_id.asc,period_start.asc",
  ];
  const query = `/meter_consumption_aggregates?${filters.join("&")}`;

  // Planner counts avoid full-table count timeouts. Pagination still continues
  // through a short page, so stale estimates cannot omit rows.
  async function fetchRange(offset, withCount) {
    const headers = { Range: `${offset}-${offset + pageSize - 1}` };
    if (withCount) headers.Prefer = "count=planned";
    const { response, body } = await supabase.restRequestWithResponse(query, { headers });
    const rows = Array.isArray(body) ? body : [];
    const total = withCount
      ? totalFromContentRange(response.headers.get("content-range"), null)
      : null;
    return { rows, total: Number.isFinite(total) ? total : null };
  }

  const first = await fetchRange(0, true);
  const rows = [...first.rows];
  const total = first.total;

  let lastPage = first;
  let nextOffset = pageSize;
  if (total !== null && total > pageSize) {
    const offsets = [];
    for (let o = pageSize; o < total; o += pageSize) offsets.push(o);
    const concurrency = 6;
    for (let i = 0; i < offsets.length; i += concurrency) {
      const pages = await Promise.all(offsets.slice(i, i + concurrency).map((o) => fetchRange(o, false)));
      for (const p of pages) rows.push(...p.rows);
      lastPage = pages[pages.length - 1] || lastPage;
    }
    nextOffset = offsets[offsets.length - 1] + pageSize;
  } else if (total === null && first.rows.length === pageSize) {
    let o = pageSize;
    while (true) {
      const page = await fetchRange(o, false);
      if (!page.rows.length) break;
      rows.push(...page.rows);
      lastPage = page;
      o += pageSize;
      if (page.rows.length < pageSize) break;
    }
    nextOffset = o;
  }
  while (lastPage.rows.length === pageSize) {
    lastPage = await fetchRange(nextOffset, false);
    rows.push(...lastPage.rows);
    nextOffset += pageSize;
  }
  return rows;
}

async function readAggregatedDeltas({ stationIds = [], from, to, granularity = "daily" }) {
  const periodType = aggPeriodType(granularity);
  const fromBound = from;
  const pageSize = 1000;

  const stations = [...new Set(stationIds.map(normalizeStation).filter(Boolean))];
  if (!stations.length) return [];

  try {
    // Fetch all stations in parallel — each with its own shallow pagination.
    const perStation = await Promise.all(
      stations.map((station) => fetchStationAggregateRows({ station, periodType, fromBound, to, pageSize }))
    );
    const allRows = perStation.flat();
    if (!allRows.length) return [];
    return allRows.map((r) => {
        const hasValuation = r.tariff_value_ngn !== undefined
          && r.priced_kwh !== undefined
          && r.unpriced_kwh !== undefined;
        return {
        stationId:    r.station_id,
        meterId:      r.meter_id,
        customerId:   r.customer_id || "",
        customerName: r.customer_name || "",
        periodStart:  r.period_start,
        kwhTotal:     Number(r.kwh_total) || 0,
        readingCount: Number(r.reading_count) || 0,
        tariffValueNgn: Number(r.tariff_value_ngn) || 0,
        pricedKwh: Number(r.priced_kwh) || 0,
        unpricedKwh: hasValuation ? Number(r.unpriced_kwh) || 0 : Number(r.kwh_total) || 0,
      };
      });
  } catch (err) {
    // Table not yet created — gracefully fall back to raw-row path
    const msg = String(err?.message || err || "");
    if (msg.includes("42P01") || msg.includes("relation") || msg.includes("does not exist")) return null;
    throw err;
  }
}

async function readStationMeterReadRollups(stationId = "") {
  const filters = [
    "select=station_id,meters_with_latest,latest_odometer_kwh,latest_reading",
    "order=station_id.asc",
  ];
  if (stationId) filters.splice(1, 0, `station_id=eq.${encodeURIComponent(stationId)}`);
  try {
    const { body } = await supabase.restRequestWithResponse(`/station_meter_read_rollups?${filters.join("&")}`, {
      headers: { Range: "0-999" },
    });
    const map = new Map();
    for (const row of Array.isArray(body) ? body : []) {
      map.set(normalizeStation(row.station_id), {
        latestOdometerKwh: Number(row.latest_odometer_kwh) || 0,
        metersWithLatest: Number(row.meters_with_latest) || 0,
        latestReading: normalizeDate(row.latest_reading),
      });
    }
    return map;
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (msg.includes("42P01") || msg.includes("relation") || msg.includes("does not exist")) return new Map();
    throw err;
  }
}

/**
 * Trigger the Postgres refresh function via RPC.
 */
/**
 * Refresh aggregates station by station via the per-station RPC.
 * The full-table RPC (refresh_meter_reading_aggregates) times out on large
 * production histories via the REST API.  This calls the per-station variant
 * sequentially, each of which completes well within Supabase's statement limit.
 *
 * Falls back gracefully if the per-station function hasn't been deployed yet.
 */
async function refreshMeterReadingAggregates(stationIds = []) {
  const t0 = Date.now();
  const results = [];

  for (const station of [...new Set(stationIds.map(normalizeStation).filter(Boolean))]) {
    const { body, response } = await supabase.restRequestWithResponse(
      "/rpc/refresh_meter_reading_aggregates_for_station",
      { method: "POST", body: { p_station_id: station } }
    );

    if (response.status === 404) {
      // Per-station function not yet deployed — fall back to full-table RPC
      const full = await supabase.restRequestWithResponse("/rpc/refresh_meter_reading_aggregates", {
        method: "POST",
        body: {},
      });
      if (full.response.status >= 400) {
        throw new Error(`refresh_meter_reading_aggregates RPC failed: ${full.response.status} ${JSON.stringify(full.body)}`);
      }
      return { durationMs: Date.now() - t0, stations: ["all"], fallback: true };
    }

    if (response.status >= 400) {
      throw new Error(`refresh_for_station(${station}) failed: ${response.status} ${JSON.stringify(body)}`);
    }
    results.push(body);
  }

  return { durationMs: Date.now() - t0, stations: results };
}

// ── readDailyMeterSummary — aggregate-first with raw fallback ─────────────────

async function readDailyMeterSummary({ requestPayload: payload }) {
  if (!storeEnabled()) return null;
  const request = requestPayload(payload);
  const stationId = normalizeStation(request.stationId || request.SITE_ID || request.siteId);
  const from = normalizeDate(request.FROM || request.from);
  const to = normalizeDate(request.TO || request.to);
  const baselineFrom = normalizeDate(request.BASELINE_FROM || request.baselineFrom || from);
  const granularity = normalizeGranularity(request.granularity);
  if (!from || !to) return null;

  // ── Try aggregate table first ──────────────────────────────────────────────
  const aggRows = await readAggregatedDeltas({ stationIds: stationId ? [stationId] : [], from, to, granularity });

  if (aggRows !== null && aggRows.length > 0) {
    const byStation = new Map();
    const byPeriod = new Map();
    const meters = new Set();
    const metersWithConsumption = new Set();
    let consumedKwh = 0;
    let readingDayCount = 0;

    for (const row of aggRows) {
      consumedKwh = parseFloat((consumedKwh + row.kwhTotal).toFixed(3));
      readingDayCount += row.readingCount;
      meters.add(`${row.stationId}:${row.meterId}`);
      if (row.kwhTotal > 0) metersWithConsumption.add(`${row.stationId}:${row.meterId}`);
      byStation.set(row.stationId, parseFloat(((byStation.get(row.stationId) || 0) + row.kwhTotal).toFixed(3)));
      const key = aggPeriodKey(row.periodStart, granularity);
      byPeriod.set(key, parseFloat(((byPeriod.get(key) || 0) + row.kwhTotal).toFixed(3)));
    }

    const stationBar = Array.from(byStation.entries())
      .map(([station, totalKwh]) => ({ station, totalKwh, meterCount: 0, meterBreakdown: [] }))
      .sort((l, r) => r.totalKwh - l.totalKwh);
    const labels = Array.from(byPeriod.keys()).sort((l, r) => l.localeCompare(r));

    return {
      status: 200,
      body: {
        code: 0, msg: "success", reason: "success",
        data: {
          consumedKwh,
          stationBar,
          temporal: { labels, kwhSeries: labels.map((k) => byPeriod.get(k) || 0) },
          meta: {
            meterCount: meters.size,
            metersWithConsumption: metersWithConsumption.size,
            readingDayCount,
            sourceRows: aggRows.length,
            source: "aggregated",
          },
        },
        _proxy: { source: "supabase-consumption-summary-agg", pathname: "/api/local/consumption/summary" },
      },
    };
  }

  // ── Fallback: raw row scan (pre-migration path) ───────────────────────────
  const rows = await readCompactRowsFromStore({ stationId, from: baselineFrom, to });
  const deltas = rowsToDeltas(rows).filter((delta) => delta.date >= from && delta.date <= to);

  const byStation = new Map();
  const byPeriod = new Map();
  const meters = new Set();
  const metersWithConsumption = new Set();
  let consumedKwh = 0;
  let readingDayCount = 0;

  for (const delta of deltas) {
    consumedKwh = parseFloat((consumedKwh + delta.delta).toFixed(3));
    if (delta.hasReading) readingDayCount++;
    meters.add(`${delta.stationId}:${delta.meterId}`);
    if (delta.delta > 0) metersWithConsumption.add(`${delta.stationId}:${delta.meterId}`);
    byStation.set(delta.stationId, parseFloat(((byStation.get(delta.stationId) || 0) + delta.delta).toFixed(3)));
    const key = periodKey(delta.date, granularity);
    byPeriod.set(key, parseFloat(((byPeriod.get(key) || 0) + delta.delta).toFixed(3)));
  }

  const stationBar = Array.from(byStation.entries())
    .map(([station, totalKwh]) => ({ station, totalKwh, meterCount: 0, meterBreakdown: [] }))
    .sort((l, r) => r.totalKwh - l.totalKwh);
  const labels = Array.from(byPeriod.keys()).sort((l, r) => l.localeCompare(r));

  return {
    status: 200,
    body: {
      code: 0, msg: "success", reason: "success",
      data: {
        consumedKwh,
        stationBar,
        temporal: { labels, kwhSeries: labels.map((k) => byPeriod.get(k) || 0) },
        meta: {
          meterCount: meters.size,
          metersWithConsumption: metersWithConsumption.size,
          readingDayCount,
          sourceRows: rows.length,
          source: "raw-fallback",
        },
      },
      _proxy: { source: "supabase-consumption-summary", pathname: "/api/local/consumption/summary" },
    },
  };
}

function addDaysIso(day, offset) {
  const date = new Date(`${String(day).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

// Raw daily_meter_readings retention, kept in sync with pg_cron job 18 as last rewritten
// by supabase/migrations/20260812170000_raw_retention_120d.sql. Overridable so a
// deployment that chooses a different window does not have to patch code.
//
// If you change job 18's INTERVAL, change this too -- they are two halves of one policy,
// and a mismatch makes the drill-down either claim data is archived when it is still
// live, or silently return a short series with no explanation.
const RAW_HOT_WINDOW_DAYS = Number(process.env.RAW_HOT_WINDOW_DAYS || 120);

/**
 * Describes how much of a requested range falls outside the raw hot window.
 * Returns null when the whole range is live, so callers can treat presence as
 * "part of this answer is incomplete, and here is where the rest lives".
 */
function coldRangeNotice(from) {
  const cutoff = addDaysIso(new Date().toISOString().slice(0, 10), -RAW_HOT_WINDOW_DAYS);
  const requested = normalizeDate(from);
  if (!requested || requested >= cutoff) return null;
  return {
    hotWindowDays: RAW_HOT_WINDOW_DAYS,
    hotFrom: cutoff,
    requestedFrom: requested,
    // Daily granularity and telemetry only; monthly/yearly totals are unaffected and
    // remain queryable live from meter_consumption_aggregates.
    message: `Daily readings before ${cutoff} are archived. Download the station-month CSV from Archive Reports for ${requested} to ${cutoff}.`,
    archiveRouteHash: "#/prepay-report/archive-reports"
  };
}

function weekdayIndex(day) {
  // 0 = Monday … 6 = Sunday
  const date = new Date(`${String(day).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return 0;
  return (date.getUTCDay() + 6) % 7;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function computeSeasonalityFromDailyDeltas({ stationId, from, to }) {
  try {
    const dailyRows = await readAggregatedDeltas({ stationIds: stationId ? [stationId] : [], from, to, granularity: "daily" });
    if (dailyRows && dailyRows.length > 0) {
      const weekdaySum = new Array(7).fill(0);
      const weekdayDates = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set()];
      for (const row of dailyRows) {
        const date = normalizeDate(row.periodStart);
        if (!date) continue;
        const wd = weekdayIndex(date);
        const value = Number(row.kwhTotal) || 0;
        weekdaySum[wd] += value;
        weekdayDates[wd].add(date);
      }
      return {
        labels: WEEKDAY_LABELS,
        values: weekdaySum.map((sum, wd) => (weekdayDates[wd].size ? round3(sum / weekdayDates[wd].size) : 0)),
      };
    }
  } catch {
    // Return empty seasonality on error
  }
  return { labels: WEEKDAY_LABELS, values: new Array(7).fill(0) };
}

function round3(value) {
  return parseFloat((Number(value) || 0).toFixed(3));
}

function consumptionValuation(valueNgn, pricedKwh, unpricedKwh, totalKwh) {
  const priced = Math.max(0, Number(pricedKwh) || 0);
  const unpriced = Math.max(0, Number(unpricedKwh) || 0);
  const total = Math.max(0, Number(totalKwh) || priced + unpriced);
  return {
    valueNgn: Number((Number(valueNgn) || 0).toFixed(2)),
    pricedKwh: round3(priced),
    unpricedKwh: round3(unpriced),
    totalKwh: round3(total),
    coveragePct: total > 0 ? Number(((priced / total) * 100).toFixed(2)) : 100,
    complete: unpriced <= 0.0005,
    basis: "historical-snapshot",
  };
}

/**
 * Per-meter daily deltas of total1 that also carry station + customer identity.
 * Grouped by station:meter so meters reused across stations never collide.
 */
function rowsToDeltasWithMeta(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const stationId = normalizeStation(row.stationId);
    const meterId = normalizeMeter(row.meterId || row.customerId);
    if (!meterId) continue;
    const key = `${stationId}:${meterId}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }

  const deltas = [];
  for (const [key, meterRows] of byKey.entries()) {
    const [stationId, meterId] = key.split(":");
    const sorted = meterRows.slice().sort((left, right) =>
      String(left.currentDate || "").localeCompare(String(right.currentDate || ""))
    );
    for (let index = 0; index < sorted.length; index++) {
      const row = sorted[index];
      const currentTotal = Number(row.total1) || 0;
      const previousTotal = index === 0 ? currentTotal : Number(sorted[index - 1].total1) || 0;
      // Upstream emits -1 as a "no reading" sentinel — never count it as consumption.
      const validDelta = currentTotal >= 0 && previousTotal >= 0;
      deltas.push({
        stationId,
        meterId,
        customerId: String(row.customerId || ""),
        customerName: String(row.customerName || ""),
        date: normalizeDate(row.currentDate),
        delta: validDelta ? round3(Math.max(0, currentTotal - previousTotal)) : 0,
        hasReading: row.total1 != null && row.total1 !== "" && currentTotal >= 0,
      });
    }
  }
  return deltas;
}

/**
 * Build the full station-analytics response shape from pre-aggregated rows.
 * currentAgg and priorAgg are arrays of { stationId, meterId, customerId,
 * customerName, periodStart, kwhTotal, readingCount }.
 */
async function buildAnalyticsFromAggregates({
  currentAgg, priorAgg,
  from, to, priorFrom, priorTo,
  granularity, topLimit, windowDays,
  stationId: filterStation,
  proxySource,
}) {
  const stationAcc  = new Map();
  const meterAcc    = new Map();
  const byPeriod    = new Map();
  const byPeriodStn = new Map();
  let consumedKwh   = 0;
  let priorKwh      = 0;
  let tariffValueNgn = 0;
  let pricedKwh = 0;
  let unpricedKwh = 0;

  function stn(id) {
    if (!stationAcc.has(id)) {
      stationAcc.set(id, {
        station: id, totalKwh: 0, priorKwh: 0,
        meters: new Set(), activeMeters: new Set(),
        readingCount: 0,
      });
    }
    return stationAcc.get(id);
  }

  for (const row of currentAgg) {
    consumedKwh += row.kwhTotal;
    tariffValueNgn += row.tariffValueNgn;
    pricedKwh += row.pricedKwh;
    unpricedKwh += row.unpricedKwh;
    const s = stn(row.stationId);
    s.totalKwh += row.kwhTotal;
    s.readingCount += row.readingCount;
    const mKey = `${row.stationId}:${row.meterId}`;
    s.meters.add(mKey);
    if (row.kwhTotal > 0) s.activeMeters.add(mKey);

    const pk = aggPeriodKey(row.periodStart, granularity);
    byPeriod.set(pk, (byPeriod.get(pk) || 0) + row.kwhTotal);
    if (!byPeriodStn.has(pk)) byPeriodStn.set(pk, new Map());
    const psMap = byPeriodStn.get(pk);
    psMap.set(row.stationId, (psMap.get(row.stationId) || 0) + row.kwhTotal);

    const meterKey = `${row.stationId}:${row.meterId}`;
    if (!meterAcc.has(meterKey)) {
      meterAcc.set(meterKey, {
        meterId: row.meterId, station: row.stationId,
        customerId: row.customerId, customerName: row.customerName,
        totalKwh: 0, activePeriods: 0,
      });
    }
    const m = meterAcc.get(meterKey);
    if (!m.customerName && row.customerName) m.customerName = row.customerName;
    if (!m.customerId  && row.customerId)  m.customerId  = row.customerId;
    m.totalKwh += row.kwhTotal;
    if (row.kwhTotal > 0) m.activePeriods++;
  }

  for (const row of priorAgg) {
    priorKwh += row.kwhTotal;
    stn(row.stationId).priorKwh += row.kwhTotal;
  }

  consumedKwh = round3(consumedKwh);
  priorKwh    = round3(priorKwh);

  function growth(current, prior) {
    if (prior > 0) return round3(((current - prior) / prior) * 100);
    if (current > 0) return null;
    return 0;
  }

  const stations = Array.from(stationAcc.values())
    .filter((s) => s.totalKwh > 0 || s.meters.size > 0)
    .map((s) => {
      const meterCount  = s.meters.size;
      const readingDays = s.readingCount;
      return {
        station:          s.station,
        totalKwh:         round3(s.totalKwh),
        priorKwh:         round3(s.priorKwh),
        growthPct:        growth(s.totalKwh, s.priorKwh),
        meterCount,
        activeMeterCount: s.activeMeters.size,
        avgPerMeter:      meterCount ? round3(s.totalKwh / meterCount) : 0,
        avgDailyKwh:      readingDays ? round3(s.totalKwh / readingDays) : 0,
        readingDays,
        peakDay:          { date: null, kwh: 0 }, // not available from period aggregates
        share:            consumedKwh > 0 ? round3((s.totalKwh / consumedKwh) * 100) : 0,
      };
    })
    .sort((a, b) => b.totalKwh - a.totalKwh);

  const labels = Array.from(byPeriod.keys()).sort((a, b) => a.localeCompare(b));
  const stationKeys = stations.map((s) => s.station);
  const seriesByStation = {};
  for (const key of stationKeys) {
    seriesByStation[key] = labels.map((label) =>
      round3((byPeriodStn.get(label) || new Map()).get(key) || 0)
    );
  }

  const topMeters = Array.from(meterAcc.values())
    .sort((a, b) => b.totalKwh - a.totalKwh)
    .slice(0, topLimit)
    .map((m) => ({
      meterId:      m.meterId,
      station:      m.station,
      customerId:   m.customerId,
      customerName: m.customerName,
      totalKwh:     round3(m.totalKwh),
      activeDays:   m.activePeriods,
      avgDailyKwh:  m.activePeriods ? round3(m.totalKwh / m.activePeriods) : 0,
    }));

  const allMeters    = new Set(Array.from(meterAcc.keys()));
  const allCustomers = new Set(Array.from(meterAcc.entries()).map(([key, meter]) => meter.customerId || key));
  const activeMeters = new Set(Array.from(meterAcc.values()).filter((m) => m.totalKwh > 0).map((m) => `${m.station}:${m.meterId}`));
  const distinctDays = Array.from(byPeriod.values()).filter((v) => v > 0).length;
  let seasonality = { labels: WEEKDAY_LABELS, values: new Array(7).fill(0) };
  if (granularity === "daily") {
    const weekdaySum = new Array(7).fill(0);
    const weekdayDates = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set()];
    for (const row of currentAgg) {
      const date = normalizeDate(row.periodStart);
      if (!date) continue;
      const wd = weekdayIndex(date);
      const value = Number(row.kwhTotal) || 0;
      weekdaySum[wd] += value;
      weekdayDates[wd].add(date);
    }
    seasonality = {
      labels: WEEKDAY_LABELS,
      values: weekdaySum.map((sum, wd) => (weekdayDates[wd].size ? round3(sum / weekdayDates[wd].size) : 0)),
    };
  } else {
    seasonality = await computeSeasonalityFromDailyDeltas({ stationId: filterStation, from, to });
  }

  return {
    status: 200,
    body: {
      code: 0, msg: "success", reason: "success",
      data: {
        range: { from, to, granularity, priorFrom, priorTo, periodDays: windowDays },
        totals: {
          consumedKwh,
          priorKwh,
          growthPct:        growth(consumedKwh, priorKwh),
          meterCount:       allMeters.size,
          customerCount:    allCustomers.size,
          activeMeterCount: activeMeters.size,
          avgPerMeter:      allMeters.size ? round3(consumedKwh / allMeters.size) : 0,
          avgDailyKwh:      distinctDays ? round3(consumedKwh / distinctDays) : 0,
          readingDays:      distinctDays,
          stationCount:     stations.length,
          sourceRows:       currentAgg.length,
          source:           "aggregated",
        },
        tariffBreakdown: [],
        valuation: consumptionValuation(tariffValueNgn, pricedKwh, unpricedKwh, consumedKwh),
        stations,
        temporal: {
          labels,
          kwhSeries: labels.map((label) => round3(byPeriod.get(label) || 0)),
          seriesByStation,
        },
        seasonality,
        topMeters,
      },
      _proxy: {
        source: proxySource,
        pathname: "/api/local/consumption/station-analytics",
      },
    },
  };
}

async function readStationAnalyticsSummary(params) {
  try {
    const { body } = await supabase.restRequestWithResponse("/rpc/get_station_consumption_analytics", {
      method: "POST",
      retryable: true, // read-only analytics query — safe to retry once on a transient timeout
      body: params,
    });
    return body && Array.isArray(body.stations) && Array.isArray(body.temporal) ? body : null;
  } catch (err) {
    const message = String(err?.message || err || "");
    if (/get_station_consumption_analytics|schema cache|does not exist/i.test(message)) return null;
    throw err;
  }
}

async function buildAnalyticsFromSummary({ summary, from, to, priorFrom, priorTo, granularity, requestedGranularity, windowDays, stationId }) {
  const growth = (current, prior) => prior > 0 ? round3(((current - prior) / prior) * 100) : (current > 0 ? null : 0);
  const rollups = new Map((summary.rollups || []).map((row) => [normalizeStation(row.station_id), row]));
  const stationRows = summary.stations || [];
  const consumedKwh = round3(stationRows.reduce((sum, row) => sum + Number(row.total_kwh || 0), 0));
  const priorKwh = round3(stationRows.reduce((sum, row) => sum + Number(row.prior_kwh || 0), 0));
  let latestOdometerKwh = 0;
  let metersWithLatest = 0;

  const stations = stationRows.map((row) => {
    const station = normalizeStation(row.station_id);
    const totalKwh = round3(row.total_kwh);
    const stationPrior = round3(row.prior_kwh);
    const meterCount = Number(row.meter_count) || 0;
    const readingCount = Number(row.reading_count) || 0;
    const rollup = rollups.get(station) || {};
    const stationMeterRead = round3(rollup.latest_odometer_kwh);
    const stationLatestMeters = Number(rollup.meters_with_latest) || 0;
    latestOdometerKwh += stationMeterRead;
    metersWithLatest += stationLatestMeters;
    return {
      station,
      totalKwh,
      priorKwh: stationPrior,
      growthPct: growth(totalKwh, stationPrior),
      meterCount,
      customerCount: Number(row.customer_count) || meterCount,
      activeMeterCount: Number(row.active_meter_count) || 0,
      avgPerMeter: meterCount ? round3(totalKwh / meterCount) : 0,
      avgDailyKwh: readingCount ? round3(totalKwh / readingCount) : 0,
      readingDays: readingCount,
      peakDay: { date: null, kwh: 0 },
      share: consumedKwh > 0 ? round3((totalKwh / consumedKwh) * 100) : 0,
      latestOdometerKwh: stationMeterRead,
      metersWithLatest: stationLatestMeters,
      latestReading: normalizeDate(rollup.latest_reading),
      tariffValueNgn: Number(row.tariff_value_ngn) || 0,
      pricedKwh: round3(row.priced_kwh),
      unpricedKwh: round3(row.unpriced_kwh),
    };
  });

  const byPeriod = new Map();
  const byPeriodStation = new Map();
  for (const row of summary.temporal || []) {
    const label = aggPeriodKey(row.period_start, granularity);
    const station = normalizeStation(row.station_id);
    const value = Number(row.kwh_total) || 0;
    byPeriod.set(label, (byPeriod.get(label) || 0) + value);
    if (!byPeriodStation.has(label)) byPeriodStation.set(label, new Map());
    byPeriodStation.get(label).set(station, value);
  }
  const labels = Array.from(byPeriod.keys()).sort((left, right) => left.localeCompare(right));
  const seriesByStation = Object.fromEntries(stations.map((station) => [
    station.station,
    labels.map((label) => round3(byPeriodStation.get(label)?.get(station.station) || 0)),
  ]));
  const topMeters = (summary.topMeters || []).map((row) => ({
    meterId: row.meter_id,
    station: normalizeStation(row.station_id),
    customerId: row.customer_id || "",
    customerName: row.customer_name || "",
    tariffId: row.tariff_id || "",
    totalKwh: round3(row.total_kwh),
    activeDays: Number(row.active_periods) || 0,
    avgDailyKwh: Number(row.active_periods) ? round3(Number(row.total_kwh) / Number(row.active_periods)) : 0,
  }));
  const readingDays = labels.filter((label) => Number(byPeriod.get(label)) > 0).length;

  let seasonality = { labels: WEEKDAY_LABELS, values: new Array(7).fill(0) };
  if (granularity === "daily") {
    const weekdaySum = new Array(7).fill(0);
    const weekdayDates = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set()];
    for (const row of summary.temporal || []) {
      const date = normalizeDate(row.period_start);
      if (!date) continue;
      const wd = weekdayIndex(date);
      const value = Number(row.kwh_total) || 0;
      weekdaySum[wd] += value;
      weekdayDates[wd].add(date);
    }
    seasonality = {
      labels: WEEKDAY_LABELS,
      values: weekdaySum.map((sum, wd) => (weekdayDates[wd].size ? round3(sum / weekdayDates[wd].size) : 0)),
    };
  } else {
    seasonality = await computeSeasonalityFromDailyDeltas({ stationId, from, to });
  }

  return {
    status: 200,
    body: {
      code: 0, msg: "success", reason: "success",
      data: {
        range: {
          from, to, priorFrom, priorTo, periodDays: windowDays, granularity,
          requestedGranularity,
          granularityCoarsened: granularity !== requestedGranularity,
        },
        totals: {
          consumedKwh, priorKwh, growthPct: growth(consumedKwh, priorKwh),
          meterCount: stations.reduce((sum, row) => sum + row.meterCount, 0),
          customerCount: Number(summary.customerCount) || stations.reduce((sum, row) => sum + row.customerCount, 0),
          activeMeterCount: stations.reduce((sum, row) => sum + row.activeMeterCount, 0),
          avgPerMeter: stations.reduce((sum, row) => sum + row.meterCount, 0)
            ? round3(consumedKwh / stations.reduce((sum, row) => sum + row.meterCount, 0)) : 0,
          avgDailyKwh: readingDays ? round3(consumedKwh / readingDays) : 0,
          readingDays, stationCount: stations.length,
          sourceRows: Number(summary.sourceRows) || 0,
          source: "aggregated",
          latestOdometerKwh: round3(latestOdometerKwh),
          metersWithLatest,
        },
        tariffBreakdown: (summary.tariffBreakdown || []).map((row) => ({
          tariffId: row.tariff_id || "",
          totalKwh: round3(row.total_kwh),
        })),
        valuation: consumptionValuation(
          summary.valuation?.valueNgn,
          summary.valuation?.pricedKwh,
          summary.valuation?.unpricedKwh,
          summary.valuation?.totalKwh ?? consumedKwh
        ),
        stations,
        temporal: { labels, kwhSeries: labels.map((label) => round3(byPeriod.get(label) || 0)), seriesByStation },
        seasonality,
        topMeters,
      },
      _proxy: { source: "supabase-station-analytics-rpc", pathname: "/api/local/consumption/station-analytics" },
    },
  };
}

/**
 * Rich station-consumption analytics for the Station Consumption report.
 * Computes (server-side, from pre-aggregated meter_consumption_aggregates or
 * daily_meter_readings total1 deltas as fallback):
 *  - totals + growth vs the immediately-preceding equal-length window
 *  - per-station league table (load, meters, avg/meter, peak day, growth, share)
 *  - temporal trend per granularity (overall + per-station series)
 *  - day-of-week seasonality (load profile)
 *  - top meters/customers by consumption
 */
async function readStationConsumptionAnalytics({ requestPayload: payload }) {
  if (!storeEnabled()) return null;
  const request = requestPayload(payload);
  const stationId = normalizeStation(request.stationId || request.SITE_ID || request.siteId || "");
  const stationIds = stationId
    ? [stationId]
    : [...new Set((Array.isArray(request.stationIds) ? request.stationIds : []).map(normalizeStation).filter(Boolean))];
  const from = normalizeDate(request.FROM || request.from);
  const to = normalizeDate(request.TO || request.to);
  const granularity = normalizeGranularity(request.granularity);
  const topLimit = Math.min(Math.max(Number(request.topMeters || request.topLimit || 20), 1), 200);
  if (!from || !to) return null;

  const dayMs = 86400000;
  const windowDays = Math.max(
    1,
    Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / dayMs) + 1
  );
  const priorTo = addDaysIso(from, -1);
  const priorFrom = addDaysIso(priorTo, -(windowDays - 1));

  const chartGranularity = effectiveGranularity(granularity, windowDays);
  // Coarsen only when the selected date range exactly matches aggregate bucket
  // boundaries. Weekly/monthly aggregate rows represent whole buckets, so using
  // them for partial custom ranges would over-count outside the user's filter.
  const queryGranularity = supportsExactAggregateRange(chartGranularity, from, to) ? chartGranularity : "daily";
  const granularityCoarsened = chartGranularity !== granularity;

  const summary = await readStationAnalyticsSummary({
    p_from: from,
    p_to: to,
    p_prior_from: priorFrom,
    p_prior_to: priorTo,
    p_station_id: stationId || null,
    p_period_type: aggPeriodType(queryGranularity),
    p_top_limit: topLimit,
  });
  if (summary) {
    return await buildAnalyticsFromSummary({
      summary, from, to, priorFrom, priorTo,
      granularity: chartGranularity,
      requestedGranularity: granularity,
      windowDays, stationId,
    });
  }

  // ── Try aggregate table path ──────────────────────────────────────────────
  const [currentAggRaw, priorAggRaw] = await Promise.all([
    readAggregatedDeltas({ stationIds, from, to, granularity: queryGranularity }),
    readAggregatedDeltas({ stationIds, from: priorFrom, to: priorTo, granularity: queryGranularity }),
  ]);
  const currentAgg = currentAggRaw;
  const priorAgg = priorAggRaw;

  // If aggregates are available, build analytics from them (fast path).
  if (currentAgg !== null && currentAgg.length > 0) {
    const meterReadRollups = await readStationMeterReadRollups(stationId);
    const response = await buildAnalyticsFromAggregates({
      currentAgg, priorAgg: priorAgg || [],
      from, to, priorFrom, priorTo,
      granularity: chartGranularity, topLimit, windowDays,
      stationId,
      proxySource: "supabase-station-analytics-agg",
    });
    const data = response.body.data;
    // Tell the client which granularity was actually used (for chart axis + note).
    data.range.requestedGranularity = granularity;
    data.range.granularity = chartGranularity;
    data.range.granularityCoarsened = granularityCoarsened;
    let latestOdometerKwh = 0;
    let metersWithLatest = 0;
    data.stations = data.stations.map((station) => {
      const rollup = meterReadRollups.get(station.station) || {};
      const stationMeterRead = round3(rollup.latestOdometerKwh || 0);
      latestOdometerKwh += stationMeterRead;
      metersWithLatest += Number(rollup.metersWithLatest) || 0;
      return {
        ...station,
        latestOdometerKwh: stationMeterRead,
        metersWithLatest: Number(rollup.metersWithLatest) || 0,
        latestReading: rollup.latestReading || null,
      };
    });
    data.totals.latestOdometerKwh = round3(latestOdometerKwh);
    data.totals.metersWithLatest = metersWithLatest;
    data.totals.source = "aggregated";
    return response;
  }

  // ── Fallback: raw row scan (pre-migration path) ───────────────────────────
  const baselineFrom = addDaysIso(priorFrom, -1);
  const targetStations = stationIds;
  const rowsArrays = await Promise.all(
    targetStations.map((st) => readCompactRowsFromStore({ stationId: st, from: baselineFrom, to }).catch(() => []))
  );
  const rows = rowsArrays.flat();
  const deltas = rowsToDeltasWithMeta(rows);

  const stationAcc = new Map();
  const meterAcc = new Map();
  const latestMeterReads = new Map();
  const overallByDate = new Map();
  const byPeriod = new Map();
  const byPeriodStation = new Map();
  const allMeters = new Set();
  const activeMeters = new Set();
  let consumedKwh = 0;
  let priorKwh = 0;

  function station(stationKey) {
    if (!stationAcc.has(stationKey)) {
      stationAcc.set(stationKey, {
        station: stationKey,
        totalKwh: 0,
        priorKwh: 0,
        meters: new Set(),
        activeMeters: new Set(),
        byDay: new Map(),
        readingDays: new Set(),
      });
    }
    return stationAcc.get(stationKey);
  }

  for (const d of deltas) {
    const inCurrent = d.date >= from && d.date <= to;
    const inPrior = d.date >= priorFrom && d.date <= priorTo;
    if (!inCurrent && !inPrior) continue;
    const s = station(d.stationId);
    const meterKey = `${d.stationId}:${d.meterId}`;

    if (inPrior) {
      priorKwh += d.delta;
      s.priorKwh += d.delta;
      continue;
    }

    // current window
    consumedKwh += d.delta;
    s.totalKwh += d.delta;
    s.meters.add(meterKey);
    s.readingDays.add(d.date);
    if (d.delta > 0) {
      s.activeMeters.add(meterKey);
      activeMeters.add(meterKey);
    }
    allMeters.add(meterKey);
    s.byDay.set(d.date, (s.byDay.get(d.date) || 0) + d.delta);
    overallByDate.set(d.date, (overallByDate.get(d.date) || 0) + d.delta);

    const pk = periodKey(d.date, chartGranularity);
    byPeriod.set(pk, (byPeriod.get(pk) || 0) + d.delta);
    if (!byPeriodStation.has(pk)) byPeriodStation.set(pk, new Map());
    const psMap = byPeriodStation.get(pk);
    psMap.set(d.stationId, (psMap.get(d.stationId) || 0) + d.delta);

    if (!meterAcc.has(meterKey)) {
      meterAcc.set(meterKey, {
        meterId: d.meterId,
        station: d.stationId,
        customerId: d.customerId,
        customerName: d.customerName,
        totalKwh: 0,
        activeDays: new Set(),
      });
    }
    const m = meterAcc.get(meterKey);
    if (!m.customerName && d.customerName) m.customerName = d.customerName;
    if (!m.customerId && d.customerId) m.customerId = d.customerId;
    m.totalKwh += d.delta;
    if (d.delta > 0) m.activeDays.add(d.date);
  }

  for (const row of rows) {
    const date = normalizeDate(row.currentDate);
    const total1 = Number(row.total1);
    if (!date || date > to || !Number.isFinite(total1) || total1 < 0) continue;
    const rowStation = normalizeStation(row.stationId);
    const meterId = normalizeMeter(row.meterId || row.customerId);
    if (!meterId) continue;
    const key = `${rowStation}:${meterId}`;
    const existing = latestMeterReads.get(key);
    if (!existing || date >= existing.date) {
      latestMeterReads.set(key, { stationId: rowStation, meterId, date, total1 });
    }
  }

  const latestByStation = new Map();
  for (const read of latestMeterReads.values()) {
    if (!latestByStation.has(read.stationId)) {
      latestByStation.set(read.stationId, { latestOdometerKwh: 0, metersWithLatest: 0 });
    }
    const entry = latestByStation.get(read.stationId);
    entry.latestOdometerKwh += read.total1;
    entry.metersWithLatest += 1;
  }

  function growth(current, prior) {
    if (prior > 0) return round3(((current - prior) / prior) * 100);
    if (current > 0) return null; // no prior baseline to compare against
    return 0;
  }

  const stations = Array.from(stationAcc.values())
    .filter((s) => s.totalKwh > 0 || s.meters.size > 0)
    .map((s) => {
      let peakDay = { date: null, kwh: 0 };
      for (const [date, kwh] of s.byDay.entries()) {
        if (kwh > peakDay.kwh) peakDay = { date, kwh: round3(kwh) };
      }
      const readingDays = s.readingDays.size;
      const meterCount = s.meters.size;
      const latest = latestByStation.get(s.station) || { latestOdometerKwh: 0, metersWithLatest: 0 };
      return {
        station: s.station,
        totalKwh: round3(s.totalKwh),
        latestOdometerKwh: round3(latest.latestOdometerKwh),
        metersWithLatest: latest.metersWithLatest,
        priorKwh: round3(s.priorKwh),
        growthPct: growth(s.totalKwh, s.priorKwh),
        meterCount,
        activeMeterCount: s.activeMeters.size,
        avgPerMeter: meterCount ? round3(s.totalKwh / meterCount) : 0,
        avgDailyKwh: readingDays ? round3(s.totalKwh / readingDays) : 0,
        readingDays,
        peakDay,
        share: consumedKwh > 0 ? round3((s.totalKwh / consumedKwh) * 100) : 0,
      };
    })
    .sort((a, b) => b.totalKwh - a.totalKwh);

  const labels = Array.from(byPeriod.keys()).sort((a, b) => a.localeCompare(b));
  const stationKeys = stations.map((s) => s.station);
  const seriesByStation = {};
  for (const key of stationKeys) {
    seriesByStation[key] = labels.map((label) => round3((byPeriodStation.get(label) || new Map()).get(key) || 0));
  }

  // Day-of-week seasonality: average daily kWh per weekday across the window.
  const weekdaySum = new Array(7).fill(0);
  const weekdayDates = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set()];
  for (const [date, kwh] of overallByDate.entries()) {
    const wd = weekdayIndex(date);
    weekdaySum[wd] += kwh;
    weekdayDates[wd].add(date);
  }
  const seasonality = {
    labels: WEEKDAY_LABELS,
    values: weekdaySum.map((sum, wd) => (weekdayDates[wd].size ? round3(sum / weekdayDates[wd].size) : 0)),
  };

  const topMeters = Array.from(meterAcc.values())
    .sort((a, b) => b.totalKwh - a.totalKwh)
    .slice(0, topLimit)
    .map((m) => ({
      meterId: m.meterId,
      station: m.station,
      customerId: m.customerId,
      customerName: m.customerName,
      totalKwh: round3(m.totalKwh),
      activeDays: m.activeDays.size,
      avgDailyKwh: m.activeDays.size ? round3(m.totalKwh / m.activeDays.size) : 0,
    }));

  const distinctDays = overallByDate.size;
  const customerCount = new Set(Array.from(meterAcc.entries()).map(([key, meter]) => meter.customerId || key)).size;
  const latestOdometerKwh = Array.from(latestByStation.values()).reduce((sum, entry) => sum + entry.latestOdometerKwh, 0);
  return {
    status: 200,
    body: {
      code: 0,
      msg: "success",
      reason: "success",
      data: {
        range: { from, to, granularity: chartGranularity, requestedGranularity: granularity, granularityCoarsened, priorFrom, priorTo, periodDays: windowDays },
        totals: {
          consumedKwh: round3(consumedKwh),
          latestOdometerKwh: round3(latestOdometerKwh),
          metersWithLatest: latestMeterReads.size,
          priorKwh: round3(priorKwh),
          growthPct: growth(consumedKwh, priorKwh),
          meterCount: allMeters.size,
          customerCount,
          activeMeterCount: activeMeters.size,
          avgPerMeter: allMeters.size ? round3(consumedKwh / allMeters.size) : 0,
          avgDailyKwh: distinctDays ? round3(consumedKwh / distinctDays) : 0,
          readingDays: distinctDays,
          stationCount: stations.length,
          sourceRows: rows.length,
          source: "raw-fallback",
        },
        tariffBreakdown: [],
        valuation: consumptionValuation(0, 0, consumedKwh, consumedKwh),
        stations,
        temporal: {
          labels,
          kwhSeries: labels.map((label) => round3(byPeriod.get(label) || 0)),
          seriesByStation,
        },
        seasonality,
        topMeters,
      },
      _proxy: {
        source: "supabase-station-analytics",
        pathname: "/api/local/consumption/station-analytics",
      },
    },
  };
}

async function readMeterRowsFromStore(meterId, station, from, to) {
  const filters = [
    "select=station_id,meter_id,customer_id,customer_name,reading_date,total1,remain1",
    `meter_id=eq.${encodeURIComponent(meterId)}`,
    `reading_date=gte.${encodeURIComponent(from)}`,
    `reading_date=lte.${encodeURIComponent(to)}`,
    "order=reading_date.asc",
  ];
  if (station) filters.splice(1, 0, `station_id=eq.${encodeURIComponent(station)}`);
  const { body } = await supabase.restRequestWithResponse(`/daily_meter_readings?${filters.join("&")}`, {
    headers: { Range: "0-9999" },
  });
  return (Array.isArray(body) ? body : []).map((row) => ({
    stationId: row.station_id,
    meterId: row.meter_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    currentDate: row.reading_date,
    total1: row.total1,
    remain1: row.remain1,
  }));
}

/**
 * Per-meter consumption analysis: daily total1 deltas + remaining-balance trend
 * for a single meter. Recharge analysis is layered on the client from token
 * records. The day before `from` is included as a baseline so the first in-range
 * delta is correct.
 */
async function readMeterConsumptionAnalysis({ requestPayload: payload }) {
  if (!storeEnabled()) return null;
  const request = requestPayload(payload);
  const meterId = normalizeMeter(request.meterId || request.METER_ID || request.meter || "");
  const stationHint = normalizeStation(request.stationId || "");
  const from = normalizeDate(request.FROM || request.from);
  const to = normalizeDate(request.TO || request.to);
  if (!meterId || !from || !to) return null;

  const baselineFrom = addDaysIso(from, -1);
  const rows = await readMeterRowsFromStore(meterId, stationHint, baselineFrom, to);
  rows.sort((a, b) => String(a.currentDate || "").localeCompare(String(b.currentDate || "")));

  let station = "";
  let customerId = "";
  let customerName = "";
  let consumedKwh = 0;
  let prevTotal = null;
  let latestRemain = null;
  let peakDay = { date: null, kwh: 0 };
  const days = new Set();
  const series = [];

  for (const row of rows) {
    const date = normalizeDate(row.currentDate);
    const total = Number(row.total1) || 0;
    const remainRaw = row.remain1 == null || row.remain1 === "" ? null : Number(row.remain1);
    const remain = remainRaw != null && remainRaw >= 0 ? remainRaw : null; // -1 = no reading
    // Upstream emits -1 as a "no reading" sentinel — never count it as consumption.
    const delta = prevTotal == null || prevTotal < 0 || total < 0 ? 0 : round3(Math.max(0, total - prevTotal));
    prevTotal = total;
    if (!date || date < from || date > to) continue; // baseline row only seeds prevTotal
    if (!station) station = row.stationId;
    if (!customerName && row.customerName) customerName = row.customerName;
    if (!customerId && row.customerId) customerId = row.customerId;
    consumedKwh = round3(consumedKwh + delta);
    days.add(date);
    if (delta > peakDay.kwh) peakDay = { date, kwh: delta };
    if (remain != null) latestRemain = remain;
    series.push({ date, total1: round3(total), delta, remain1: remain });
  }

  return {
    status: 200,
    body: {
      code: 0,
      msg: "success",
      reason: "success",
      data: {
        meterId,
        station,
        customerId,
        customerName,
        range: { from, to, baselineFrom },
        // Raw readings are retained for RAW_HOT_WINDOW_DAYS (Phase 2 cut this from
        // 12 months to 90 days, gated on the month being archived first). A request
        // reaching further back is not an error and not an empty meter -- the data
        // exists as a downloadable station-month CSV on the Archive Reports page.
        // Saying so explicitly is the whole point: the old behaviour was to silently
        // return a short series and let the reader assume the meter went quiet.
        coldRange: coldRangeNotice(from),
        totals: {
          consumedKwh,
          readingDays: days.size,
          avgDailyKwh: days.size ? round3(consumedKwh / days.size) : 0,
          latestRemain,
          firstReadingDate: series.length ? series[0].date : null,
          lastReadingDate: series.length ? series[series.length - 1].date : null,
          peakDay,
        },
        series,
      },
      _proxy: {
        source: "supabase-meter-analysis",
        pathname: "/api/local/consumption/meter-analysis",
      },
    },
  };
}

module.exports = {
  collectionRowsFromPayload,
  dailyMeterStationStats,
  dailyMeterTableReport,
  ingestWebhookReadings,
  readDailyMeterSummary,
  readStationConsumptionAnalytics,
  readMeterConsumptionAnalysis,
  readDailyMeterRows,
  refreshMeterReadingAggregates,
  storeEnabled,
  writeDailyMeterRows,
  writeRawDuplicateRows,
};
