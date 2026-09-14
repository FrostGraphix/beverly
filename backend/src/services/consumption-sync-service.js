"use strict";

const crypto = require("crypto");
const supabase = require("./supabase-service");
const {
  collectionRowsFromPayload,
  dailyMeterStationStats,
  dailyMeterTableReport,
  refreshMeterReadingAggregates,
  writeDailyMeterRows,
} = require("./consumption-store");
const dailyMeterPath = "/api/DailyDataMeter/read";
const stationPath = "/api/station/read";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value, fallback = "") {
  const day = String(value || fallback).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function normalizeStations(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const stations = raw
    .map((station) => String(station || "").trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(stations));
}

function positiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function addDays(day, offset) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
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
  const retries = positiveInteger(options.retries, positiveInteger(process.env.CONSUMPTION_SYNC_RETRIES, 4));
  const timeoutMs = positiveInteger(options.timeoutMs, positiveInteger(process.env.CONSUMPTION_SYNC_TIMEOUT_MS, 45000));
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
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
      if (!response.ok) {
        throw new Error(body.reason || body.msg || body.error || `Live request failed: ${response.status}`);
      }
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(15000, attempt * attempt * 1000)));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("Live request failed");
}

async function resolveStations(value, options = {}) {
  const requested = normalizeStations(value);
  if (requested.length) return requested;
  const payload = await postLive(stationPath, { pageNumber: 1, pageSize: 500 }, options);
  const stations = normalizeStations(collectionRowsFromPayload(payload)
    .map((row) => row?.stationId || row?.station_id || row?.siteId || row?.id));
  if (!stations.length) throw new Error("Live station directory returned no stations");
  return stations;
}

function rowsDateBounds(rows) {
  let earliest = null;
  let latest = null;
  for (const row of rows) {
    const day = normalizeDate(row.currentDate || row.readingDate || row.createDate);
    if (!day) continue;
    if (!earliest || day < earliest) earliest = day;
    if (!latest || day > latest) latest = day;
  }
  return { earliest, latest };
}

function boundedPercent(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 100 ? numeric : fallback;
}

async function createSyncRun(stationId, mode) {
  const id = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await supabase.restRequest("/consumption_sync_runs", {
    method: "POST",
    prefer: "return=minimal",
    body: {
      id,
      station_id: stationId,
      mode,
      status: "running",
      started_at: startedAt,
    },
  });
  return { id, startedAt };
}

async function finishSyncRun(id, stationId, mode, result, error, attempts, startedAt) {
  const finishedAt = new Date().toISOString();
  const status = error ? "failed" : result?.complete ? "succeeded" : "partial";
  await supabase.restRequest(`/consumption_sync_runs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: {
      status,
      finished_at: finishedAt,
      attempts,
      from_date: result?.from || null,
      to_date: result?.to || null,
      pages_fetched: Number(result?.pagesFetched || 0),
      fetched_rows: Number(result?.fetchedRows || 0),
      stored_rows: Number(result?.storedRows || 0),
      source_earliest_date: result?.sourceEarliestReadingDate || null,
      source_latest_date: result?.sourceLatestReadingDate || null,
      stop_reason: result?.stopReason || null,
      error_message: error ? String(error.message || error) : null,
    },
  });
  await supabase.restRequest("/consumption_sync_station_state?on_conflict=station_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      station_id: stationId,
      last_mode: mode,
      last_status: status,
      last_started_at: startedAt,
      last_finished_at: finishedAt,
      ...(status === "succeeded" ? { last_success_at: finishedAt } : {}),
      cursor_date: result?.storedThrough || result?.latestReadingDate || null,
      source_latest_date: result?.sourceLatestReadingDate || null,
      last_fetched_rows: Number(result?.fetchedRows || 0),
      last_stored_rows: Number(result?.storedRows || 0),
      last_error: error ? String(error.message || error) : null,
      updated_at: finishedAt,
    },
  });
}

async function databaseQuotaState(input, mode) {
  const quotaMb = Number(input.databaseQuotaMb || process.env.DATABASE_QUOTA_MB);
  if (!Number.isFinite(quotaMb) || quotaMb <= 0) {
    throw new Error("DATABASE_QUOTA_MB must be configured");
  }
  const usage = await supabase.restRequest("/rpc/consumption_database_usage", {
    method: "POST",
    retryable: true,
    body: {},
  });
  const usageRow = Array.isArray(usage) ? usage[0] : usage;
  const reportedBytes = Number(usageRow?.bytes);
  const reportedMebibytes = Number(usageRow?.megabytes);
  const usedBytes = Number.isFinite(reportedBytes)
    ? reportedBytes
    : reportedMebibytes * 1048576;
  if (!Number.isFinite(usedBytes) || usedBytes < 0) {
    throw new Error("Database usage measurement unavailable");
  }
  const usedMb = usedBytes / 1000000;
  const usedPercent = (usedBytes / (quotaMb * 1000000)) * 100;
  const warnPercent = boundedPercent(input.quotaWarnPercent || process.env.DATABASE_QUOTA_WARN_PERCENT, 70);
  const backfillPausePercent = boundedPercent(input.quotaBackfillPausePercent || process.env.DATABASE_QUOTA_BACKFILL_PAUSE_PERCENT, 75);
  const hardStopPercent = boundedPercent(input.quotaHardStopPercent || process.env.DATABASE_QUOTA_HARD_STOP_PERCENT, 80);
  const quotaPaused = usedPercent >= hardStopPercent || (mode === "backfill" && usedPercent >= backfillPausePercent);
  return {
    quotaMb,
    usedMb: Math.round(usedMb * 100) / 100,
    usedBytes,
    usedPercent: Math.round(usedPercent * 100) / 100,
    warning: usedPercent >= warnPercent,
    quotaPaused,
    reason: usedPercent >= hardStopPercent ? "hard_stop" : quotaPaused ? "backfill_paused" : null,
    thresholds: { warnPercent, backfillPausePercent, hardStopPercent },
  };
}

async function recordQuotaPause(stationIds, mode, quota) {
  const measuredAt = new Date().toISOString();
  const rows = (stationIds.length ? stationIds : ["AUTO"]).map((stationId) => ({
    id: crypto.randomUUID(),
    station_id: stationId,
    mode,
    status: "quota_paused",
    started_at: measuredAt,
    finished_at: measuredAt,
    attempts: 1,
    stop_reason: quota.reason,
    error_message: `Database usage ${quota.usedPercent}% reached ${quota.reason}`,
  }));
  await supabase.restRequest("/consumption_sync_runs", {
    method: "POST",
    prefer: "return=minimal",
    body: rows.length === 1 ? rows[0] : rows,
  });
}

function maxPagesForMode(mode, input) {
  const explicit = Number(input.maxPagesPerStation ?? input.maxPages);
  if (Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit);
  const envName = mode === "backfill" ? "CONSUMPTION_SYNC_BACKFILL_MAX_PAGES" : "CONSUMPTION_SYNC_INCREMENTAL_MAX_PAGES";
  const fallback = mode === "backfill" ? 8 : 20;
  return positiveInteger(process.env[envName], fallback);
}

function stationAttemptsForMode(mode, input) {
  const explicit = Number(input.stationAttempts ?? input.stationRetries);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  const envName = mode === "backfill" ? "CONSUMPTION_SYNC_BACKFILL_STATION_ATTEMPTS" : "CONSUMPTION_SYNC_STATION_ATTEMPTS";
  return positiveInteger(process.env[envName], mode === "backfill" ? 3 : 1);
}

function syncWindow(mode, stationStats, input) {
  const to = normalizeDate(input.to, today());
  const retentionDays = positiveInteger(
    input.hotRetentionDays,
    positiveInteger(process.env.CONSUMPTION_HOT_RETENTION_DAYS, 90)
  );
  const retentionFloor = addDays(to, -retentionDays);
  const retentionFrom = `${retentionFloor.slice(0, 7)}-01`;
  if (mode === "backfill") {
    const requestedFrom = normalizeDate(input.from, retentionFrom);
    return {
      from: requestedFrom > retentionFrom ? requestedFrom : retentionFrom,
      to,
      reason: "hot_backfill",
    };
  }
  const latest = normalizeDate(stationStats?.latestReadingDate);
  const lookbackDays = Math.max(0, positiveInteger(input.lookbackDays, positiveInteger(process.env.CONSUMPTION_SYNC_LOOKBACK_DAYS, 0)));
  const requestedFrom = latest
    ? addDays(latest, -lookbackDays)
    : normalizeDate(input.from, retentionFrom);
  return {
    from: requestedFrom > retentionFrom ? requestedFrom : retentionFrom,
    to,
    reason: latest ? "latest_reading" : "empty_station",
    latestReadingDate: latest || null,
  };
}

async function syncStation(stationId, stationStats, options) {
  const pageSize = Math.min(500, positiveInteger(options.pageSize, positiveInteger(process.env.CONSUMPTION_SYNC_PAGE_SIZE, 500)));
  const maxPages = maxPagesForMode(options.mode, options);
  const window = syncWindow(options.mode, stationStats, options);
  let pageNumber = 1;
  let fetchedRows = 0;
  let storedRows = 0;
  let pagesFetched = 0;
  let rawTotal = 0;
  let earliest = null;
  let latest = null;
  let storedThrough = null;
  let stopReason = null;

  while (true) {
    if (maxPages > 0 && pagesFetched >= maxPages) break;
    const payload = {
      lang: "en",
      stationId,
      FROM: window.from,
      TO: window.to,
      pageNumber,
      pageSize,
    };
    const responsePayload = await postLive(dailyMeterPath, payload, options);
    const rows = collectionRowsFromPayload(responsePayload);
    if (!rows.length) break;

    const eligibleRows = rows.filter((row) => {
      const day = normalizeDate(row.currentDate || row.readingDate || row.createDate);
      const rowStation = normalizeStations(row.stationId || row.station || row.siteId)[0] || stationId;
      return rowStation === stationId && day && day >= window.from && day <= window.to;
    });
    const pageDates = rows
      .map((row) => normalizeDate(row.currentDate || row.readingDate || row.createDate))
      .filter(Boolean);
    for (const row of eligibleRows) {
      const day = normalizeDate(row.currentDate || row.readingDate || row.createDate);
      if (day && (!storedThrough || day > storedThrough)) storedThrough = day;
    }
    const descendingDates = pageDates.every((day, index) => index === 0 || pageDates[index - 1] >= day);

    const bounds = rowsDateBounds(rows);
    if (bounds.earliest && (!earliest || bounds.earliest < earliest)) earliest = bounds.earliest;
    if (bounds.latest && (!latest || bounds.latest > latest)) latest = bounds.latest;

    const stored = eligibleRows.length
      ? await writeDailyMeterRows({
        pathname: dailyMeterPath,
        requestPayload: payload,
        responsePayload: { result: { data: eligibleRows } },
      })
      : { stored: 0 };

    fetchedRows += rows.length;
    storedRows += Number(stored.stored || 0);
    pagesFetched += 1;
    rawTotal = Number(responsePayload?.result?.total ?? responsePayload?.data?.total ?? rawTotal) || rawTotal;

    if (descendingDates && pageDates.some((day) => day < window.from)) {
      stopReason = "cursor_crossed";
      break;
    }
    if (rows.length < pageSize) break;
    if (rawTotal && pageNumber * pageSize >= rawTotal) break;
    pageNumber += 1;
  }

  return {
    stationId,
    mode: options.mode,
    from: window.from,
    to: window.to,
    detection: window.reason,
    latestReadingDate: window.latestReadingDate || null,
    pagesFetched,
    fetchedRows,
    storedRows,
    rawTotal,
    stopReason,
    complete: maxPages === 0 ? fetchedRows >= rawTotal : !rawTotal || fetchedRows >= rawTotal || pagesFetched < maxPages,
    sourceEarliestReadingDate: earliest,
    sourceLatestReadingDate: latest,
    storedThrough,
  };
}

async function runConsumptionSync(input = {}) {
  const mode = input.mode === "backfill" || input.full === true ? "backfill" : "incremental";
  const requestedStations = normalizeStations(input.stations || input.stationId || process.env.CONSUMPTION_SYNC_STATIONS);
  const quota = await databaseQuotaState(input, mode);
  if (quota.quotaPaused) {
    await recordQuotaPause(requestedStations, mode, quota);
    return {
      ok: true,
      mode,
      quotaPaused: true,
      reason: quota.reason,
      quota,
      stationCount: requestedStations.length,
      syncedStations: 0,
      failedStations: 0,
      fetchedRows: 0,
      storedRows: 0,
      stations: [],
      failures: [],
    };
  }
  let stationIds = await resolveStations(requestedStations, input);
  if (!requestedStations.length) {
    const claimed = await supabase.restRequest("/rpc/claim_consumption_sync_station", {
      method: "POST",
      retryable: true,
      body: { p_station_ids: stationIds },
    });
    const claimedStation = normalizeStations(Array.isArray(claimed) ? claimed[0] : claimed)[0];
    if (!claimedStation || !stationIds.includes(claimedStation)) {
      throw new Error("No consumption station could be claimed");
    }
    stationIds = [claimedStation];
  }
  const before = await dailyMeterStationStats(stationIds);
  if (!before.tableReady) throw new Error(before.error || "Supabase daily_meter_readings is not ready");

  const statsByStation = new Map(before.stations.map((station) => [station.station, station]));
  const stations = [];
  const failures = [];
  for (const stationId of stationIds) {
    const attempts = stationAttemptsForMode(mode, input);
    const run = await createSyncRun(stationId, mode);
    let attemptsUsed = 0;
    let stationResult = null;
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      attemptsUsed = attempt;
      try {
        stationResult = await syncStation(stationId, statsByStation.get(stationId), { ...input, mode });
        if (stationResult.storedRows > 0) {
          stationResult.aggregateRefresh = await refreshMeterReadingAggregates([stationId]);
        }
        break;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(30000, attempt * attempt * 5000)));
        }
      }
    }
    if (stationResult) {
      await finishSyncRun(run.id, stationId, mode, stationResult, null, attemptsUsed, run.startedAt);
      stations.push(stationResult);
    } else {
      await finishSyncRun(run.id, stationId, mode, null, lastError, attemptsUsed, run.startedAt);
      failures.push({
        stationId,
        mode,
        attempts: attemptsUsed,
        error: lastError instanceof Error ? lastError.message : String(lastError),
      });
    }
  }

  const after = await dailyMeterTableReport(stationIds);
  const partialStations = stations.filter((station) => !station.complete).length;
  return {
    ok: failures.length === 0 && partialStations === 0,
    mode,
    stationCount: stationIds.length,
    syncedStations: stations.length,
    failedStations: failures.length,
    partialStations,
    fetchedRows: stations.reduce((sum, station) => sum + station.fetchedRows, 0),
    storedRows: stations.reduce((sum, station) => sum + station.storedRows, 0),
    before,
    after,
    stations,
    failures,
    quota,
  };
}

module.exports = {
  databaseQuotaState,
  runConsumptionSync,
  stationAttemptsForMode,
  syncWindow,
};
