"use strict";

const axios = require("axios");
const consumptionStore = require("./consumption-store");
const supabase = require("./supabase-service");

const stations = ["TUNGA", "UMAISHA", "OGUFA", "KYAKALE", "MUSHA"];

// We default to the current local timezone date ranges, ending at 2026-05-19
const YESTERDAY = "2026-05-19";
const WEEK_START = "2026-05-13";
const MONTH_START = "2026-04-20";

function getEnvConfig() {
  const upstreamUrl = process.env.LIVE_API_BASE_URL || process.env.UPSTREAM_API_URL || "";
  const token = process.env.LIVE_API_BEARER_TOKEN || process.env.UPSTREAM_BEARER_TOKEN || "";
  return { upstreamUrl, token };
}


async function fetchPage(stationId, pageNumber, pageSize = 1000) {
  const { upstreamUrl, token } = getEnvConfig();
  if (!upstreamUrl) {
    throw new Error("Upstream API URL is not configured");
  }
  
  try {
    const res = await axios.post(`${upstreamUrl}/api/DailyDataMeter/read`, {
      stationId,
      lang: "en",
      pageNumber,
      pageSize
    }, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      timeout: 15000
    });
    return res?.data?.data || res?.data?.result?.data || [];
  } catch (err) {
    console.error(`[live-probe-engine] fetchPage failed for ${stationId} page ${pageNumber}:`, err.message);
    return [];
  }
}

// Fetches pages in small parallel batches to prevent rate limits/timeouts
async function fetchAllPagesBatched(stationId, maxPages = 75) {
  const allRows = [];
  const batchSize = 6;
  
  // Always fetch page 1 first to check if there is data
  const page1 = await fetchPage(stationId, 1);
  if (!page1.length) return [];
  allRows.push(...page1);
  
  // Fetch remainder in batches
  for (let startPage = 2; startPage <= maxPages; startPage += batchSize) {
    const promises = [];
    const endPage = Math.min(startPage + batchSize - 1, maxPages);
    for (let p = startPage; p <= endPage; p++) {
      promises.push(fetchPage(stationId, p));
    }
    const results = await Promise.all(promises);
    let emptyCount = 0;
    for (const rows of results) {
      if (rows.length) {
        allRows.push(...rows);
      } else {
        emptyCount++;
      }
    }
    // If all pages in this batch were empty, stop querying further pages
    if (emptyCount === promises.length) {
      break;
    }
  }
  return allRows;
}

// Compute deltas from a list of readings using daily delta logic
function computeDeltas(rows) {
  const byMeter = {};
  for (const row of rows) {
    const meterId = row.meterId || row.customerId;
    const rawDate = row.currentDate || row.readingDate;
    if (!meterId || !rawDate) continue;
    const date = rawDate.split(" ")[0]; // YYYY-MM-DD
    
    if (!byMeter[meterId]) byMeter[meterId] = [];
    if (!byMeter[meterId].some(r => r.date === date)) {
      byMeter[meterId].push({
        date,
        total1: Number(row.total1) || 0
      });
    }
  }

  const results = {
    yesterday: 0,
    week: 0,
    month: 0,
    allTime: 0,
    meterCount: Object.keys(byMeter).length
  };

  for (const [meterId, meterRows] of Object.entries(byMeter)) {
    meterRows.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < meterRows.length; i++) {
      const current = meterRows[i];
      const previous = meterRows[i - 1];
      const delta = Math.max(0, current.total1 - previous.total1);
      
      results.allTime += delta;
      
      if (current.date === YESTERDAY) {
        results.yesterday += delta;
      }
      if (current.date >= WEEK_START && current.date <= YESTERDAY) {
        results.week += delta;
      }
      if (current.date >= MONTH_START && current.date <= YESTERDAY) {
        results.month += delta;
      }
    }
  }

  // Format decimal values
  results.yesterday = parseFloat(results.yesterday.toFixed(2));
  results.week = parseFloat(results.week.toFixed(2));
  results.month = parseFloat(results.month.toFixed(2));
  results.allTime = parseFloat(results.allTime.toFixed(2));
  
  return results;
}

// Reads local consumption statistics from Supabase to construct comparison stats
async function getLocalStats(stationId) {
  if (!consumptionStore.storeEnabled()) {
    return { yesterday: 0, week: 0, month: 0, allTime: 0, rowCount: 0 };
  }
  
  try {
    // Yesterday
    const resYesterday = await supabase.restRequest(`/daily_meter_readings?station_id=eq.${stationId}&reading_date=eq.${YESTERDAY}`, {});
    const yesterdayRows = resYesterday.body || [];
    
    // Week
    const resWeek = await supabase.restRequest(`/daily_meter_readings?station_id=eq.${stationId}&reading_date=gte.${WEEK_START}&reading_date=lte.${YESTERDAY}`, {});
    const weekRows = resWeek.body || [];
    
    // Month
    const resMonth = await supabase.restRequest(`/daily_meter_readings?station_id=eq.${stationId}&reading_date=gte.${MONTH_START}&reading_date=lte.${YESTERDAY}`, {});
    const monthRows = resMonth.body || [];

    // All Time (count total rows)
    const countRes = await supabase.restRequest(`/daily_meter_readings?select=id&station_id=eq.${stationId}`, {
      headers: { Prefer: "count=exact", Range: "0-0" }
    });
    const totalContentRange = countRes.response.headers.get("content-range") || "";
    const totalRows = Number((totalContentRange.match(/\/(\d+)$/) || [])[1] || 0);

    // Compute deltas local side
    const localDeltasYesterday = computeLocalDeltas(yesterdayRows);
    const localDeltasWeek = computeLocalDeltas(weekRows);
    const localDeltasMonth = computeLocalDeltas(monthRows);
    
    return {
      yesterday: localDeltasYesterday,
      week: localDeltasWeek,
      month: localDeltasMonth,
      allTime: 0, // Incomplete delta sync makes local all-time sum inaccurate
      rowCount: totalRows
    };
  } catch (err) {
    console.error(`[live-probe-engine] getLocalStats failed for ${stationId}:`, err.message);
    return { yesterday: 0, week: 0, month: 0, allTime: 0, rowCount: 0 };
  }
}

function computeLocalDeltas(dbRows) {
  // Convert dbRows to the layout required by computeDeltas
  const rows = dbRows.map(r => ({
    meterId: r.meter_id,
    currentDate: r.reading_date,
    total1: r.total1
  }));
  const results = computeDeltas(rows);
  return results.allTime; // Since we filtered query by specific range, allTime represents the sum of the range
}

async function runLiveProbe() {
  const results = [];
  let grandTotalLive = { yesterday: 0, week: 0, month: 0, allTime: 0 };
  let grandTotalLocal = { yesterday: 0, week: 0, month: 0, allTime: 0 };

  for (const stationId of stations) {
    const rawRows = await fetchAllPagesBatched(stationId, 75);
    const liveStats = computeDeltas(rawRows);
    const localStats = await getLocalStats(stationId);

    results.push({
      stationId,
      live: liveStats,
      local: localStats,
      rowsFetched: rawRows.length
    });

    grandTotalLive.yesterday += liveStats.yesterday;
    grandTotalLive.week += liveStats.week;
    grandTotalLive.month += liveStats.month;
    grandTotalLive.allTime += liveStats.allTime;

    grandTotalLocal.yesterday += localStats.yesterday;
    grandTotalLocal.week += localStats.week;
    grandTotalLocal.month += localStats.month;
  }

  // Format grand totals
  for (const key of ["yesterday", "week", "month", "allTime"]) {
    grandTotalLive[key] = parseFloat(grandTotalLive[key].toFixed(2));
    grandTotalLocal[key] = parseFloat(grandTotalLocal[key].toFixed(2));
  }

  return {
    stations: results,
    grandTotalLive,
    grandTotalLocal,
    timestamp: new Date().toISOString()
  };
}

async function runSync(stationId = null) {
  const targets = stationId ? [stationId.toUpperCase()] : stations;
  const syncResults = [];

  for (const targetStation of targets) {
    if (!stations.includes(targetStation)) {
      throw new Error(`Invalid station ID: ${targetStation}`);
    }

    try {
      console.log(`[live-probe-engine] Starting sync for station: ${targetStation}`);
      const rawRows = await fetchAllPagesBatched(targetStation, 75);
      if (rawRows.length > 0) {
        const dbResult = await consumptionStore.writeDailyMeterRows({
          pathname: "/api/DailyDataMeter/read",
          requestPayload: { stationId: targetStation },
          responsePayload: { data: rawRows }
        });
        syncResults.push({
          stationId: targetStation,
          status: "success",
          rowsSynced: dbResult?.stored || 0
        });
      } else {
        syncResults.push({
          stationId: targetStation,
          status: "no_data",
          rowsSynced: 0
        });
      }
    } catch (err) {
      console.error(`[live-probe-engine] Sync failed for ${targetStation}:`, err.message);
      syncResults.push({
        stationId: targetStation,
        status: "error",
        error: err.message
      });
    }
  }

  return {
    success: syncResults.some(r => r.status === "success"),
    results: syncResults,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  runLiveProbe,
  fetchAllPagesBatched,
  runSync
};

