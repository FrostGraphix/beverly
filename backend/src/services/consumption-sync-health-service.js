"use strict";

const supabase = require("./supabase-service");

function dateLagDays(day, now = new Date()) {
  const parsed = new Date(`${String(day || "").slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.max(0, Math.floor((today.getTime() - parsed.getTime()) / 86400000));
}

async function consumptionSyncHealth(stationIds = [], now = new Date()) {
  const normalized = [...new Set((Array.isArray(stationIds) ? stationIds : [stationIds])
    .map((station) => String(station || "").trim().toUpperCase())
    .filter(Boolean))];
  const query = [
    "select=station_id,last_status,last_success_at,cursor_date,source_latest_date,last_error",
    "order=station_id.asc"
  ];
  if (normalized.length === 1) query.push(`station_id=eq.${encodeURIComponent(normalized[0])}`);
  if (normalized.length > 1) query.push(`station_id=in.(${normalized.map(encodeURIComponent).join(",")})`);

  let rows;
  try {
    rows = await supabase.restRequest(`/consumption_sync_station_state?${query.join("&")}`);
  } catch (error) {
    if (/PGRST205|42P01|schema cache|does not exist/i.test(String(error?.message || error))) {
      return { available: false, stationCount: 0, healthyCount: 0, staleCount: 0, failedCount: 0, partialCount: 0, maximumLagDays: 0, stations: [] };
    }
    throw error;
  }

  const stations = (Array.isArray(rows) ? rows : []).map((row) => {
    const lagDays = dateLagDays(row.cursor_date, now);
    const stale = lagDays === null || lagDays > 1 || row.last_status !== "succeeded";
    return {
      stationId: row.station_id,
      status: row.last_status,
      lastSuccessAt: row.last_success_at,
      cursorDate: row.cursor_date,
      sourceLatestDate: row.source_latest_date,
      lagDays,
      stale,
      error: row.last_error,
    };
  });
  return {
    available: true,
    stationCount: stations.length,
    healthyCount: stations.filter((station) => !station.stale).length,
    staleCount: stations.filter((station) => station.stale).length,
    failedCount: stations.filter((station) => station.status === "failed").length,
    partialCount: stations.filter((station) => station.status === "partial").length,
    maximumLagDays: stations.reduce((maximum, station) => Math.max(maximum, station.lagDays ?? 0), 0),
    stations,
  };
}

module.exports = { consumptionSyncHealth, dateLagDays };
