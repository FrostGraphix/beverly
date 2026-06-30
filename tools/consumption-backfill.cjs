"use strict";

const fs = require("fs");
const path = require("path");
const { loadEnvFile } = require("./env-loader.cjs");
const {
  filterRowsByRange,
  numberArg,
  pageRows,
  postLive,
  stringArg,
} = require("./consumption-live-dataset.cjs");

loadEnvFile();

process.env.SUPABASE_CONSUMPTION_STORE_ENABLED = process.env.SUPABASE_CONSUMPTION_STORE_ENABLED || "true";

const { writeDailyMeterRows, dailyMeterTableReport } = require("../backend/src/services/consumption-store");
const { stations } = require("../backend/src/services/refresh-targets");

const root = path.resolve(__dirname, "..");
const progressPath = path.join(root, "tmp", "consumption-backfill-progress.json");
const failurePath = path.join(root, "tmp", "consumption-backfill-failures.json");
const runLogPath = path.join(root, "tmp", "consumption-backfill-run.log");
const pageSize = numberArg("--page-size", Number(process.env.CONSUMPTION_BACKFILL_PAGE_SIZE || 500));
const maxPages = numberArg("--max-pages", Number(process.env.CONSUMPTION_BACKFILL_MAX_PAGES || 0));
const stationArg = stringArg("--station", "");
const force = process.argv.includes("--force");
const ignoreRunLog = process.argv.includes("--ignore-run-log");
const from = stringArg("--from", process.env.CONSUMPTION_BACKFILL_FROM || "2025-01-01");
const to = stringArg("--to", new Date().toISOString().slice(0, 10));
const timeoutMs = numberArg("--timeout-ms", Number(process.env.CONSUMPTION_BACKFILL_TIMEOUT_MS || 45000));
const maxRetries = numberArg("--retries", Number(process.env.CONSUMPTION_BACKFILL_RETRIES || 4));
const stopAfterEmptyPages = numberArg("--stop-after-empty-pages", Number(process.env.CONSUMPTION_BACKFILL_STOP_AFTER_EMPTY_PAGES || 5));

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(progressPath, "utf8"));
  } catch {
    return { stations: {} };
  }
}

function saveProgress(progress) {
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  const tmpPath = `${progressPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(progress, null, 2)}\n`);
  fs.renameSync(tmpPath, progressPath);
}

function saveFailures(failures) {
  fs.mkdirSync(path.dirname(failurePath), { recursive: true });
  const tmpPath = `${failurePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(failures, null, 2)}\n`);
  fs.renameSync(tmpPath, failurePath);
}

function progressCompleteForRange(progress, stationId) {
  const state = progress.stations?.[stationId];
  return Boolean(state?.complete && state.from === from && state.to === to);
}

function parseRunLog(logPath) {
  let text = "";
  try {
    text = fs.readFileSync(logPath, "utf8");
  } catch {
    return { failed: [], completed: [] };
  }

  const completed = [...text.matchAll(/^\s*-\s+([A-Z0-9_-]+): .*detect=full_backfill/gm)]
    .map((match) => String(match[1] || "").trim().toUpperCase())
    .filter(Boolean);

  const marker = "[failures]";
  const start = text.indexOf(marker);
  const end = start >= 0 ? text.indexOf("\n[after]", start) : -1;
  let failed = [];
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start + marker.length, end).trim());
      failed = parsed.map((item) => String(item?.stationId || "").trim().toUpperCase()).filter(Boolean);
    } catch {
      failed = [];
    }
  }

  return {
    failed: [...new Set(failed)],
    completed: [...new Set(completed)],
  };
}

function selectedStationsFromArgs() {
  if (stationArg) {
    return stationArg.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  }

  if (!force && !ignoreRunLog) {
    const plan = parseRunLog(runLogPath);
    const progress = loadProgress();
    if (plan.failed.length) {
      const resumableFailures = plan.failed.filter((stationId) => !progressCompleteForRange(progress, stationId));
      console.log(JSON.stringify({
        mode: "resume_failed_from_log",
        failedStations: resumableFailures,
        alreadyCompleteStations: plan.failed.filter((stationId) => progressCompleteForRange(progress, stationId)),
        skippedCompletedStations: plan.completed,
      }));
      if (resumableFailures.length) return resumableFailures;
    }
    if (plan.completed.length) {
      const completed = new Set(plan.completed);
      const remaining = stations.filter((stationId) => !completed.has(stationId) && !progressCompleteForRange(progress, stationId));
      console.log(JSON.stringify({
        mode: "skipped_completed_from_log",
        skippedCompletedStations: plan.completed,
        remainingStations: remaining,
      }));
      return remaining;
    }
  }

  return stations;
}

async function backfillStation(stationId, progress) {
  const state = force ? {} : (progress.stations[stationId] || {});
  if (state.complete) {
    console.log(JSON.stringify({ stationId, skipped: true, reason: "already complete" }));
    return;
  }

  let pageNumber = Number(state.nextPage || 1);
  let storedRows = Number(state.storedRows || 0);
  let fetchedRows = Number(state.fetchedRows || 0);
  let filteredTotal = Number(state.filteredRows || 0);
  let rawTotalRows = Number(state.rawTotalRows || 0);
  let pagesThisRun = 0;
  let emptyPagesAfterMatch = 0;

  console.log(JSON.stringify({ stationId, mode: "resume_page", pageNumber }));

  while (true) {
    if (maxPages && pagesThisRun >= maxPages) break;

    const requestPayload = {
      lang: "en",
      stationId,
      FROM: from,
      TO: to,
      pageNumber,
      pageSize,
    };
    const responsePayload = await postLive("/api/DailyDataMeter/read", requestPayload, {
      timeoutMs,
      maxRetries,
      onRetry: ({ payload, attempt, error, maxRetries: totalAttempts }) => {
        const delayMs = Math.min(15000, 1000 * attempt * attempt);
        console.warn(JSON.stringify({
          stationId: payload.stationId,
          pageNumber: payload.pageNumber,
          attempt,
          error,
          retryInMs: attempt < totalAttempts ? delayMs : 0,
        }));
      },
    });

    const rows = pageRows(responsePayload);
    rawTotalRows = Number(responsePayload?.result?.total ?? responsePayload?.data?.total ?? rows.length) || rawTotalRows;
    const filteredRows = filterRowsByRange(rows, from, to);
    filteredTotal += filteredRows.length;
    if (filteredRows.length) emptyPagesAfterMatch = 0;
    else if (filteredTotal > 0) emptyPagesAfterMatch++;
    const storedResponsePayload = filteredRows.length === rows.length
      ? responsePayload
      : {
          ...responsePayload,
          result: {
            ...(responsePayload?.result || {}),
            total: filteredRows.length,
            data: filteredRows,
          },
        };
    const stored = await writeDailyMeterRows({
      pathname: "/api/DailyDataMeter/read",
      requestPayload,
      responsePayload: storedResponsePayload,
    });
    storedRows += Number(stored.stored || 0);
    fetchedRows += rows.length;
    pagesThisRun++;

    const complete = rows.length === 0 ||
      rows.length < pageSize ||
      (rawTotalRows > 0 && pageNumber * pageSize >= rawTotalRows) ||
      emptyPagesAfterMatch >= stopAfterEmptyPages;
    progress.stations[stationId] = {
      stationId,
      from,
      to,
      pageSize,
      nextPage: complete ? pageNumber : pageNumber + 1,
      lastPage: pageNumber,
      totalRows: rawTotalRows,
      storedRows,
      fetchedRows,
      fetchedThrough: pageNumber * pageSize,
      rawTotalRows,
      filteredRows: filteredTotal,
      sourceRangeTrusted: false,
      complete,
      stoppedAfterEmptyPages: emptyPagesAfterMatch >= stopAfterEmptyPages,
      updatedAt: new Date().toISOString(),
    };
    saveProgress(progress);

    console.log(JSON.stringify({
      stationId,
      pageNumber,
      rows: rows.length,
      filteredRows: filteredRows.length,
      rawTotalRows,
      storedRows,
      complete,
      mode: "page-stored",
    }));

    if (complete) break;
    pageNumber++;
  }

  console.log(JSON.stringify({
    stationId,
    rawTotalRows,
    fetchedRows,
    storedRows,
    pagesThisRun,
    complete: Boolean(progress.stations[stationId]?.complete),
    mode: "resumable-backfill",
  }));
}

(async () => {
  const report = await dailyMeterTableReport();
  if (!report.tableReady) {
    throw new Error(`Supabase daily_meter_readings is not ready: ${report.error || "unknown error"}`);
  }

  const progress = loadProgress();
  const selectedStations = selectedStationsFromArgs();
  const failures = [];
  for (const stationId of selectedStations) {
    try {
      await backfillStation(stationId, progress);
    } catch (error) {
      const state = progress.stations?.[stationId] || null;
      const failure = {
        stationId,
        from,
        to,
        pageSize,
        nextPage: state?.nextPage || 1,
        lastPage: state?.lastPage || null,
        error: error instanceof Error ? error.message : String(error),
        failedAt: new Date().toISOString(),
      };
      failures.push(failure);
      progress.stations[stationId] = {
        ...(state || { stationId, from, to, pageSize }),
        complete: false,
        failed: true,
        failure,
        updatedAt: failure.failedAt,
      };
      saveProgress(progress);
      console.error(JSON.stringify({ mode: "station-failed", ...failure }));
    }
  }

  const finalReport = await dailyMeterTableReport();
  saveFailures(failures);
  if (failures.length) {
    console.error(`[failures] ${JSON.stringify(failures, null, 2)}`);
    process.exitCode = 1;
  }
  console.log(JSON.stringify({ status: failures.length ? "backfill run partial" : "backfill run complete", failures, report: finalReport }, null, 2));
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
