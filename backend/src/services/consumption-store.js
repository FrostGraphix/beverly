"use strict";

const supabase = require("./supabase-service");

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
    row_json: {
      ...row,
      stationId,
      meterId,
      currentDate: readingDate,
    },
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

function totalFromContentRange(value, fallback) {
  const match = String(value || "").match(/\/(\d+)$/);
  return match ? Number(match[1]) : fallback;
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

async function dailyMeterStationStats(stations = ["TUNGA", "UMAISHA", "OGUFA", "KYAKALE", "MUSHA"]) {
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
      const earliestReadingDate = await dateBoundForStation(station, "asc");
      const latestReadingDate = await dateBoundForStation(station, "desc");
      totalRows += rows;
      stationStats.push({ station, rows, earliestReadingDate, latestReadingDate });
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

async function dailyMeterTableReport(stations = ["TUNGA", "UMAISHA", "OGUFA", "KYAKALE", "MUSHA"]) {
  const stats = await dailyMeterStationStats(stations);
  return {
    ...stats,
    stations: Array.isArray(stats.stations)
      ? stats.stations.map(({ station, rows }) => ({ station, rows }))
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
  const compact = request.compact === true || request.compact === "true";
  const offset = (pageNumber - 1) * pageSize;
  const rangeEnd = offset + pageSize - 1;
  const query = [
    compact
      ? "select=station_id,meter_id,customer_id,customer_name,reading_date,total1,remain1"
      : "select=row_json",
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
    .map((row) => {
      if (!compact) return row.row_json || {};
      return {
        stationId: row.station_id,
        meterId: row.meter_id,
        customerId: row.customer_id,
        customerName: row.customer_name,
        currentDate: row.reading_date,
        total1: row.total1,
        remain1: row.remain1,
      };
    })
    .filter((row) => Object.keys(row).length);
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

module.exports = {
  collectionRowsFromPayload,
  dailyMeterStationStats,
  dailyMeterTableReport,
  readDailyMeterRows,
  storeEnabled,
  writeDailyMeterRows,
};
