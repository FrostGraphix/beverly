"use strict";

/**
 * Cold-storage archive for raw meter readings.
 *
 * Exports closed months of `daily_meter_readings` to Supabase Storage as one gzipped
 * CSV per (station, month), and indexes each object in `archive_reports`. This is what
 * lets the hot retention window shrink without losing daily-granularity drill-down or
 * telemetry: Storage is a separate free-tier quota (1 GB) from the Postgres 500 MB cap.
 *
 * SHAPE BORROWED FROM SPARKMETER, GRAIN DELIBERATELY NOT.
 * SparkMeter pre-generates reports keyed by (org, service_area, site, date, type,
 * granularity) and serves them by direct key lookup -- no query engine over cold data.
 * We copy that: partition key in the path, retrieval by key, never a transparent
 * fallback behind a live query. We do NOT copy their day grain -- see the migration
 * 20260811110000_archive_reports.sql header for the measured reasoning (their 15-minute
 * heartbeat makes a site-day 7.06 MB; our once-daily odometer makes a station-MONTH
 * about 1 MB raw).
 *
 * SAFETY: this module never deletes anything. Retention deletion stays with pg_cron
 * job 18. The sweep only considers months that closed at least ARCHIVE_GRACE_DAYS ago,
 * so archival always runs far ahead of the deletion boundary and the two cannot race.
 */

const crypto = require("crypto");
const zlib = require("zlib");
const supabase = require("./supabase-service");
const { DEFAULT_OEM_SLUG } = require("./oem-registry-service");

const BUCKET = process.env.ARCHIVE_BUCKET || "archives";
const REPORT_TYPE = "readings";
const GRANULARITY = "monthly";

/**
 * Source definitions per report type. Everything that differs between readings and
 * payments lives here so the sweep, the extractor and the CSV writer stay generic.
 *
 * The station key is the awkward part and is not guesswork: daily_meter_readings stores
 * station_id upper-case ("UMAISHA"), while token_transactions has no station column at
 * all and instead carries site_code lower-case ("umaisha"). Verified live -- all five
 * populated site_codes map to a real station under upper(). So payments filter on the
 * lower-cased station and are re-labelled upward on the way out.
 */
const SOURCES = {
  readings: {
    table: "daily_meter_readings",
    // Column the partition's date range is filtered on, and whether it is a plain date
    // or a timestamptz (which needs a half-open upper bound rather than <=).
    dateColumn: "reading_date",
    dateIsTimestamp: false,
    stationColumn: "station_id",
    stationFilterValue: (station) => station,
    partitionRpc: "archive_candidate_partitions",
    orderBy: "meter_id.asc,reading_date.asc"
  },
  payments: {
    table: "token_transactions",
    dateColumn: "transaction_at",
    dateIsTimestamp: true,
    stationColumn: "site_code",
    stationFilterValue: (station) => String(station).toLowerCase(),
    partitionRpc: "archive_payment_partitions",
    orderBy: "transaction_at.asc,meter_sn.asc"
  }
};

/**
 * token_transactions minus raw_payload. The jsonb column is excluded deliberately: the
 * only keys observed in it are accountNo and customerName, both of which are already
 * first-class columns here, so archiving it would duplicate content for bulk.
 */
const PAYMENT_COLUMNS = [
  "id", "site_code", "site_id", "meter_sn", "meter_id", "customer_id", "customer_name",
  "account_no", "amount", "kwh", "tariff_rate",
  "transaction_at", "transaction_ts", "ingested_at",
  "upstream_id", "upstream_transaction_id", "source", "created_at"
];

function columnsFor(reportType) {
  return reportType === "payments" ? PAYMENT_COLUMNS : ARCHIVE_COLUMNS;
}

// Only archive months that closed this many days ago. Late-arriving corrections are
// real in this system -- the backfill tools intentionally re-touch historical
// reading_date rows -- so we let a month settle before freezing it. Well inside the
// 90-day retention floor Phase 2 introduces.
const ARCHIVE_GRACE_DAYS = Number(process.env.ARCHIVE_GRACE_DAYS || 35);

// PostgREST page size for reading extraction. Matches consumption-store.js.
const PAGE_SIZE = 1000;

// Signed download URLs are short-lived: the catalogue is browsable by any signed-in
// user, but a leaked URL should not be a durable data exfil path.
const SIGNED_URL_TTL_SECONDS = Number(process.env.ARCHIVE_SIGNED_URL_TTL || 300);

/**
 * Every column of daily_meter_readings except the surrogate `id` dropped in
 * 20260811100000. Telemetry columns (voltage/current/power) and the tamper/state
 * booleans are included deliberately -- telemetry is one of the two things that cannot
 * be reconstructed from the aggregate rollups, so an archive without it would be
 * useless for retrospective alarm investigation.
 */
const ARCHIVE_COLUMNS = [
  "station_id", "meter_id", "customer_id", "customer_name", "reading_date",
  "total1", "remain1", "usage1", "interval_demand", "power",
  "voltage_a", "voltage_b", "voltage_c",
  "current_a", "current_b", "current_c",
  "gateway_id", "captured_at", "created_at", "updated_at",
  "source2_activated", "relay_open", "battery_low", "magnetic_interference",
  "terminal_cover_open", "cover_open", "current_reverse", "current_unbalance"
];

// ── date helpers ──────────────────────────────────────────────────────────────

function monthStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date, count) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

/** Last calendar day of the month that `date` falls in. */
function monthEnd(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function addDays(date, count) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + count);
  return next;
}

/** First / last calendar day of the year that `date` falls in. */
function yearStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function yearEnd(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31));
}

/** Period bounds for a partition, given its granularity. */
function periodBounds(granularity, periodStartIso) {
  const start = new Date(`${periodStartIso}T00:00:00Z`);
  return granularity === "yearly"
    ? { from: isoDate(yearStart(start)), to: isoDate(yearEnd(start)) }
    : { from: isoDate(start), to: isoDate(monthEnd(start)) };
}

/**
 * The newest month eligible for archival: the last month that closed at least
 * ARCHIVE_GRACE_DAYS ago. Returns a month-start Date.
 */
function newestEligibleMonth(now = new Date()) {
  const cutoff = new Date(now.getTime() - ARCHIVE_GRACE_DAYS * 86400000);
  // The month containing the cutoff is still settling, so the newest fully-settled
  // month is the one before it.
  return addMonths(monthStart(cutoff), -1);
}

// ── CSV ───────────────────────────────────────────────────────────────────────

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Quote only when necessary, and double any embedded quote. customer_name is
  // free text from upstream and genuinely contains commas.
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, columns = ARCHIVE_COLUMNS) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  }
  // Trailing newline so the file is POSIX-clean and concatenable.
  return `${lines.join("\n")}\n`;
}

// ── extraction ────────────────────────────────────────────────────────────────

/**
 * Page every source row for one station within [from, to] out of PostgREST.
 * Ordered deterministically so a re-archive of the same partition produces a
 * byte-identical file (and therefore the same checksum).
 *
 * `to` is inclusive in calendar terms. For a timestamptz source that means filtering
 * `< to + 1 day` rather than `<= to`, or every transaction after midnight on the last
 * day of the period would be silently dropped.
 */
async function fetchPartitionRows(reportType, stationId, from, to) {
  const source = SOURCES[reportType];
  const columns = columnsFor(reportType);
  const upperBound = source.dateIsTimestamp
    ? `${source.dateColumn}=lt.${isoDate(addDays(new Date(`${to}T00:00:00Z`), 1))}`
    : `${source.dateColumn}=lte.${to}`;

  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = [
      `select=${columns.join(",")}`,
      `${source.stationColumn}=eq.${encodeURIComponent(source.stationFilterValue(stationId))}`,
      `${source.dateColumn}=gte.${from}`,
      upperBound,
      `order=${source.orderBy}`,
      `limit=${PAGE_SIZE}`,
      `offset=${offset}`
    ].join("&");
    const page = await supabase.restRequest(`/${source.table}?${query}`);
    const batch = Array.isArray(page) ? page : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Distinct (station_id, month) pairs that still hold rows at or before the newest
 * eligible month. Derived from the data itself rather than a station directory, so a
 * decommissioned station's history still gets archived.
 */
async function findCandidatePartitions(newestMonth, reportType = REPORT_TYPE, granularity = GRANULARITY, includeLive = false) {
  // When refreshing live periods too, discovery has to look all the way to today rather
  // than stopping at the settled boundary.
  const boundary = includeLive
    ? isoDate(monthEnd(new Date()))
    : isoDate(monthEnd(newestMonth));
  const source = SOURCES[reportType];

  // Reduce to distinct (station, month) inside Postgres -- one round trip, scaling with
  // partition count rather than row count. The page-through fallback below measured
  // 157s / ~348 requests against 347k rows in production and would be flatly impossible
  // at the 20,000-meter target (~36M rows).
  let monthly = null;
  try {
    const rows = await supabase.restRequest(`/rpc/${source.partitionRpc}`, {
      method: "POST",
      body: { p_boundary: boundary }
    });
    if (Array.isArray(rows)) {
      monthly = rows
        .filter((row) => row && row.station_id && row.period_start)
        .map((row) => ({
          stationId: String(row.station_id),
          periodStart: String(row.period_start).slice(0, 10)
        }));
    }
  } catch (error) {
    // PGRST202 = the discovery RPC is not applied yet. Readings can degrade to the slow
    // page-through; payments cannot (no equivalent single-table scan is worth writing),
    // so that surfaces as an empty candidate set rather than a wrong one.
    if (!/PGRST202|Could not find the function/i.test(String(error?.message || error))) throw error;
    if (reportType !== "readings") return [];
  }

  if (monthly === null) {
    const seen = new Map();
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const query = [
        "select=station_id,reading_date",
        `reading_date=lte.${boundary}`,
        "order=reading_date.asc",
        `limit=${PAGE_SIZE}`,
        `offset=${offset}`
      ].join("&");
      const page = await supabase.restRequest(`/daily_meter_readings?${query}`);
      const batch = Array.isArray(page) ? page : [];
      for (const row of batch) {
        const station = String(row.station_id || "");
        const date = String(row.reading_date || "");
        if (!station || date.length < 7) continue;
        const key = `${station}|${date.slice(0, 7)}-01`;
        if (!seen.has(key)) seen.set(key, { stationId: station, periodStart: `${date.slice(0, 7)}-01` });
      }
      if (batch.length < PAGE_SIZE) break;
    }
    monthly = [...seen.values()];
  }

  if (granularity !== "yearly") return monthly;

  // A yearly bundle is only FROZEN once every month of that year is settled -- otherwise
  // the first eligible month of a year would produce a "yearly" file holding one month
  // of data that then never refreshes because the partition key already exists.
  //
  // With includeLive the in-progress year is emitted too, but it lands in the live set
  // below and is therefore rewritten on every sweep rather than frozen half-formed.
  const boundaryYear = newestMonth.getUTCFullYear();
  const boundaryMonth = newestMonth.getUTCMonth();
  const currentYear = new Date().getUTCFullYear();
  const years = new Map();
  for (const partition of monthly) {
    const year = Number(partition.periodStart.slice(0, 4));
    const settled = year < boundaryYear || (year === boundaryYear && boundaryMonth === 11);
    if (!settled && !(includeLive && year <= currentYear)) continue;
    const key = `${partition.stationId}|${year}`;
    if (!years.has(key)) years.set(key, { stationId: partition.stationId, periodStart: `${year}-01-01` });
  }
  return [...years.values()];
}

/**
 * Partition keys already recorded, so a sweep is cheap and idempotent.
 *
 * Paginated deliberately. An unbounded select here is silently truncated by whatever
 * row ceiling PostgREST is configured with, and a truncated "already archived" set does
 * not fail loudly -- it just makes the sweep re-archive partitions it already holds.
 * That is harmless today (63 partitions, and the upsert is idempotent) but wastes the
 * whole per-run budget on repeat work once the index outgrows the ceiling.
 */
async function existingPartitionKeys(reportType = REPORT_TYPE, granularity = GRANULARITY) {
  const keys = new Set();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = [
      "select=station_id,period_start",
      `report_type=eq.${reportType}`,
      `granularity=eq.${granularity}`,
      "order=period_start.asc,station_id.asc",
      `limit=${PAGE_SIZE}`,
      `offset=${offset}`
    ].join("&");
    const page = await supabase.restRequest(`/archive_reports?${query}`);
    const batch = Array.isArray(page) ? page : [];
    for (const row of batch) keys.add(`${row.station_id}|${row.period_start}`);
    if (batch.length < PAGE_SIZE) break;
  }
  return keys;
}

// ── OEM resolution ────────────────────────────────────────────────────────────

let oemCache = null;

/**
 * station_id -> { oemId, slug }, from oem_station_mappings joined to oem_manufacturers.
 *
 * Cached for the life of the process: the mapping changes only when an OEM onboards a
 * station, and a sweep is a short-lived batch. A station with no mapping falls back to
 * the seeded default manufacturer, matching DEFAULT_OEM_SLUG in oem-registry-service.js,
 * so a newly-discovered station is still archived under a real owner rather than being
 * skipped or written with a null partition key.
 */
async function loadOemByStation() {
  if (oemCache) return oemCache;
  const [mappings, manufacturers] = await Promise.all([
    supabase.restRequest("/oem_station_mappings?select=oem_id,station_id"),
    supabase.restRequest("/oem_manufacturers?select=id,slug")
  ]);
  const slugById = new Map((Array.isArray(manufacturers) ? manufacturers : []).map((m) => [m.id, m.slug]));
  const byStation = new Map();
  for (const row of Array.isArray(mappings) ? mappings : []) {
    byStation.set(String(row.station_id), { oemId: row.oem_id, slug: slugById.get(row.oem_id) || "unknown" });
  }
  const fallbackEntry = (Array.isArray(manufacturers) ? manufacturers : [])
    .find((m) => m.slug === DEFAULT_OEM_SLUG) || (Array.isArray(manufacturers) ? manufacturers[0] : null);
  oemCache = {
    byStation,
    fallback: fallbackEntry ? { oemId: fallbackEntry.id, slug: fallbackEntry.slug } : null
  };
  return oemCache;
}

async function resolveOemForStation(stationId) {
  const { byStation, fallback } = await loadOemByStation();
  const hit = byStation.get(String(stationId));
  if (hit) return hit;
  if (!fallback) throw new Error(`No OEM mapping for station ${stationId} and no default manufacturer exists`);
  return fallback;
}

// ── archival ──────────────────────────────────────────────────────────────────

/** Slug one free-text value into a safe single path segment. */
function pathSegment(value, fallback = "unknown") {
  let segment = String(value ?? "").replace(/[^A-Za-z0-9._-]+/g, "_");
  // A segment of only dots ("." or "..") is a relative path element, not a name: a
  // station literally called ".." would otherwise resolve outside its own prefix. Not
  // reachable from user input today (these come from our own tables) but wrong, and
  // cheap to make impossible.
  if (/^\.+$/.test(segment)) segment = `_${segment}`;
  return segment || fallback;
}

/**
 * Object path. The OEM slug leads because station_id is NOT unique across
 * manufacturers -- Calinmeter already owns a station called "0001", and a second OEM
 * onboarding its own "0001" would otherwise overwrite the same object.
 *
 *   {oem}/{report_type}/{granularity}/{station}/{period}.csv.gz
 *
 * Objects written before 20260813100000 live at the legacy path
 * readings/{station}/{month}.csv.gz. They stay readable because object_path is stored
 * per row and downloads resolve through it, not by reconstructing the path.
 */
function objectPathFor(stationId, periodStart, reportType = REPORT_TYPE, granularity = GRANULARITY, oemSlug = DEFAULT_OEM_SLUG) {
  const period = granularity === "yearly"
    ? String(periodStart).slice(0, 4)
    : String(periodStart).slice(0, 7);
  return [
    pathSegment(oemSlug, DEFAULT_OEM_SLUG),
    pathSegment(reportType, REPORT_TYPE),
    pathSegment(granularity, GRANULARITY),
    pathSegment(stationId),
    `${period}.csv.gz`
  ].join("/");
}

/**
 * Export one (station, month) partition. Idempotent: re-running overwrites the object
 * and updates the index row rather than duplicating.
 *
 * Returns null when the partition holds no rows (nothing to archive).
 */
/** Fetch and decompress one already-archived object. */
async function readArchiveObject(bucket, objectPath) {
  const signed = await supabase.createSignedStorageUrl(bucket, objectPath, SIGNED_URL_TTL_SECONDS);
  if (!signed) throw new Error(`could not sign ${objectPath}`);
  let response = null;
  for (let attempt = 1; attempt <= 3 && !response; attempt += 1) {
    try {
      response = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(120000) });
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
  if (!response.ok) throw new Error(`${objectPath} -> HTTP ${response.status}`);
  return zlib.gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8");
}

/**
 * Build a yearly bundle by CONCATENATING that year's monthly archive objects, rather
 * than re-querying the source tables.
 *
 * This is the important bit. Re-querying looks simpler but is wrong: once retention has
 * deleted a month's source rows, a yearly rebuild would silently produce a bundle
 * containing only the months still inside the hot window -- a "2026" file holding four
 * months. Composing from the monthly objects makes the yearly bundle exactly the sum of
 * its parts by construction, permanently, and it keeps working after the source is gone.
 *
 * Returns null when no monthly parts exist yet.
 */
async function archiveYearlyFromMonthly({ stationId, year, reportType, oem }) {
  const parts = await supabase.restRequest(
    "/archive_reports?select=period_start,object_path,bucket,row_count,covers_from,covers_to"
    + `&station_id=eq.${encodeURIComponent(stationId)}`
    + `&report_type=eq.${reportType}&granularity=eq.monthly`
    + `&oem_id=eq.${oem.oemId}`
    + `&period_start=gte.${year}-01-01&period_start=lte.${year}-12-31`
    + "&order=period_start.asc"
  );
  const months = Array.isArray(parts) ? parts : [];
  if (!months.length) return null;

  let header = null;
  const body = [];
  let rowCount = 0;
  for (const part of months) {
    const csv = await readArchiveObject(part.bucket || BUCKET, part.object_path);
    const lines = csv.split("\n").filter(Boolean);
    if (!lines.length) continue;
    if (header === null) header = lines[0];
    else if (lines[0] !== header) {
      throw new Error(`column drift between monthly parts for ${stationId} ${year}`);
    }
    for (let i = 1; i < lines.length; i += 1) body.push(lines[i]);
    rowCount += lines.length - 1;
  }
  if (header === null) return null;

  const csv = `${[header, ...body].join("\n")}\n`;
  const gzipped = zlib.gzipSync(Buffer.from(csv, "utf8"), { level: 9 });
  const objectPath = objectPathFor(stationId, `${year}-01-01`, reportType, "yearly", oem.slug);
  await supabase.uploadStorageObject(BUCKET, objectPath, gzipped, "application/gzip");

  const coversFrom = months.map((m) => m.covers_from).filter(Boolean).sort()[0] || null;
  const coversTo = months.map((m) => m.covers_to).filter(Boolean).sort().pop() || null;

  await supabase.restRequest(
    "/archive_reports?on_conflict=oem_id,station_id,report_type,granularity,period_start",
    {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: {
        oem_id: oem.oemId,
        station_id: stationId,
        report_type: reportType,
        granularity: "yearly",
        period_start: `${year}-01-01`,
        period_end: `${year}-12-31`,
        covers_from: coversFrom,
        covers_to: coversTo,
        bucket: BUCKET,
        object_path: objectPath,
        row_count: rowCount,
        byte_size: gzipped.length,
        content_sha256: crypto.createHash("sha256").update(gzipped).digest("hex")
      }
    }
  );

  return {
    stationId,
    oemSlug: oem.slug,
    reportType,
    granularity: "yearly",
    periodStart: `${year}-01-01`,
    objectPath,
    rowCount,
    byteSize: gzipped.length,
    uncompressedBytes: Buffer.byteLength(csv, "utf8"),
    composedFrom: months.length
  };
}

async function archivePartition({ stationId, periodStart, reportType = REPORT_TYPE, granularity = GRANULARITY }) {
  if (granularity === "yearly") {
    const oem = await resolveOemForStation(stationId);
    return archiveYearlyFromMonthly({
      stationId,
      year: Number(String(periodStart).slice(0, 4)),
      reportType,
      oem
    });
  }

  const { from, to } = periodBounds(granularity, periodStart);
  const columns = columnsFor(reportType);
  const source = SOURCES[reportType];

  const rows = await fetchPartitionRows(reportType, stationId, from, to);
  if (!rows.length) return null;

  const oem = await resolveOemForStation(stationId);
  const csv = toCsv(rows, columns);
  const gzipped = zlib.gzipSync(Buffer.from(csv, "utf8"), { level: 9 });
  const checksum = crypto.createHash("sha256").update(gzipped).digest("hex");
  const objectPath = objectPathFor(stationId, periodStart, reportType, granularity, oem.slug);

  // Upload BEFORE indexing. If the upload throws, no index row claims the partition
  // exists, and the next sweep retries it. The reverse order could advertise an
  // object that was never written -- and the retention interlock trusts this index.
  await supabase.uploadStorageObject(BUCKET, objectPath, gzipped, "application/gzip");

  // covers_from/covers_to are the real extent of the data, which can be narrower than
  // the period (a station that came online mid-month). Timestamps are sliced to a date.
  const dates = rows
    .map((row) => String(row[source.dateColumn] || "").slice(0, 10))
    .filter(Boolean)
    .sort();

  await supabase.restRequest(
    "/archive_reports?on_conflict=oem_id,station_id,report_type,granularity,period_start",
    {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: {
        oem_id: oem.oemId,
        station_id: stationId,
        report_type: reportType,
        granularity,
        period_start: from,
        period_end: to,
        covers_from: dates[0] || null,
        covers_to: dates[dates.length - 1] || null,
        bucket: BUCKET,
        object_path: objectPath,
        row_count: rows.length,
        byte_size: gzipped.length,
        content_sha256: checksum
      }
    }
  );

  return {
    stationId,
    oemSlug: oem.slug,
    reportType,
    granularity,
    periodStart: from,
    objectPath,
    rowCount: rows.length,
    byteSize: gzipped.length,
    uncompressedBytes: Buffer.byteLength(csv, "utf8")
  };
}

/**
 * Every (report_type, granularity) combination the sweep produces. Monthly is the
 * working grain; yearly is a convenience bundle of the same rows so a whole year is one
 * download instead of twelve. Readings and payments are independent sources.
 */
const SWEEP_MATRIX = [
  { reportType: "readings", granularity: "monthly" },
  { reportType: "readings", granularity: "yearly" },
  { reportType: "payments", granularity: "monthly" },
  { reportType: "payments", granularity: "yearly" }
];

/**
 * Periods newer than the grace window -- i.e. the current month/year and the one still
 * settling behind it -- that should be kept CURRENT rather than frozen.
 *
 * The grace window exists so a settled partition is written once and never touched
 * again. That is right for history, but it means the archive lags reality by up to two
 * months: data inside the hot retention window has no archived copy at all. These
 * "live" partitions are therefore re-archived on every sweep, overwriting in place, so
 * the archive is always up to date with the source.
 *
 * Two safeguards make the overwrite safe:
 *   - Only periods NEWER than the settled boundary are refreshed. A settled partition
 *     is never rewritten, so a re-archive can never replace a complete historical month
 *     with a truncated one after retention has deleted its source rows.
 *   - The upsert is keyed on the partition, so refreshing is idempotent.
 */
function livePartitionPeriods(newestMonth, now = new Date()) {
  const months = [];
  let cursor = monthStart(now);
  // Walk back from the current month to (but not including) the settled boundary.
  while (cursor > newestMonth) {
    months.push(isoDate(cursor));
    cursor = addMonths(cursor, -1);
  }
  return months;
}

/**
 * Archive every settled, not-yet-archived partition across the sweep matrix.
 *
 * @param {object}   options
 * @param {number}   options.limit        Max partitions per invocation, so a serverless
 *                                        cron cannot exceed its wall clock.
 * @param {boolean}  options.dryRun       Plan only; touches neither Storage nor the index.
 * @param {string}   options.reportType   Restrict to one type ('readings'|'payments').
 * @param {string}   options.granularity  Restrict to one grain ('monthly'|'yearly').
 * @param {Function} options.log
 */
async function runArchiveSweep(options = {}) {
  const limit = Number(options.limit || 24);
  const dryRun = options.dryRun === true;
  const log = typeof options.log === "function" ? options.log : () => {};

  if (!supabase.serviceConfigured()) {
    return { ok: false, reason: "Supabase service role not configured", archived: [] };
  }
  if (!supabase.storageEnabled()) {
    return { ok: false, reason: "Supabase storage disabled (SUPABASE_STORAGE_ENABLED)", archived: [] };
  }

  // Creating the bucket is idempotent and returns ok on 409 (already exists).
  await supabase.ensureStorageBuckets([BUCKET]);

  const matrix = SWEEP_MATRIX.filter((entry) =>
    (!options.reportType || entry.reportType === options.reportType) &&
    (!options.granularity || entry.granularity === options.granularity));

  const newestMonth = newestEligibleMonth();
  log(`newest eligible month: ${isoDate(newestMonth)} (grace ${ARCHIVE_GRACE_DAYS}d)`);

  // Collect pending work across the whole matrix first, so `limit` is a budget for the
  // run as a whole rather than per combination -- otherwise a four-way matrix would
  // quietly do 4x the configured work in one invocation.
  // Live periods (current month/year, and anything newer than the settled boundary) are
  // re-archived every sweep so the archive tracks data still inside the hot retention
  // window. Settled periods are written once and never rewritten.
  const refreshLive = options.refreshLive !== false;
  const liveMonths = new Set(livePartitionPeriods(newestMonth));
  const liveYears = new Set([`${new Date().getUTCFullYear()}-01-01`]);
  const isLive = (p, granularity) =>
    granularity === "yearly" ? liveYears.has(p.periodStart) : liveMonths.has(p.periodStart);

  const pending = [];
  for (const entry of matrix) {
    const [candidates, already] = await Promise.all([
      findCandidatePartitions(newestMonth, entry.reportType, entry.granularity, refreshLive),
      existingPartitionKeys(entry.reportType, entry.granularity)
    ]);
    const outstanding = candidates.filter((p) =>
      !already.has(`${p.stationId}|${p.periodStart}`)
      || (refreshLive && isLive(p, entry.granularity)));
    const liveCount = outstanding.filter((p) => isLive(p, entry.granularity)).length;
    log(`${entry.reportType}/${entry.granularity}: ${candidates.length} candidates, ${already.size} archived, `
      + `${outstanding.length} pending (${liveCount} live refresh)`);
    for (const partition of outstanding) {
      pending.push({ ...partition, ...entry, live: isLive(partition, entry.granularity) });
    }
  }

  pending.sort((a, b) => a.reportType.localeCompare(b.reportType)
    || a.granularity.localeCompare(b.granularity)
    || a.periodStart.localeCompare(b.periodStart)
    || a.stationId.localeCompare(b.stationId));

  if (dryRun) {
    return { ok: true, dryRun: true, pending: pending.slice(0, limit), pendingTotal: pending.length, archived: [] };
  }

  const archived = [];
  const failures = [];
  for (const partition of pending.slice(0, limit)) {
    try {
      const result = await archivePartition(partition);
      if (result) {
        archived.push(result);
        log(`archived ${result.oemSlug}/${result.reportType}/${result.granularity} ${result.stationId} ${result.periodStart}: ${result.rowCount} rows -> ${result.byteSize} B gz`);
      }
    } catch (error) {
      // One bad partition must not abort the sweep -- the next run retries it.
      failures.push({ ...partition, error: String(error?.message || error) });
      log(`FAILED ${partition.reportType}/${partition.granularity} ${partition.stationId} ${partition.periodStart}: ${error?.message || error}`);
    }
  }

  return {
    ok: failures.length === 0,
    pendingTotal: pending.length,
    remaining: Math.max(0, pending.length - archived.length - failures.length),
    archived,
    failures
  };
}

// ── catalogue reads (mirrors SparkMeter's /reports/list + /reports/summary) ────

function reportRow(row = {}, slugById = new Map()) {
  return {
    id: row.id,
    oemId: row.oem_id,
    oemSlug: slugById.get(row.oem_id) || null,
    stationId: row.station_id,
    reportType: row.report_type,
    granularity: row.granularity,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    coversFrom: row.covers_from,
    coversTo: row.covers_to,
    rowCount: Number(row.row_count || 0),
    byteSize: Number(row.byte_size || 0),
    sizeMb: Math.round((Number(row.byte_size || 0) / 1048576) * 100) / 100,
    filename: String(row.object_path || "").split("/").pop(),
    objectPath: row.object_path,
    createdAt: row.created_at
  };
}

/** id -> slug for every manufacturer, so the catalogue can label rows without a join. */
async function oemSlugById() {
  const rows = await supabase.restRequest("/oem_manufacturers?select=id,slug");
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [row.id, row.slug]));
}

async function listReports(filters = {}) {
  const query = [
    "select=*",
    "order=period_start.desc,station_id.asc",
    `limit=${Math.max(1, Math.min(Number(filters.limit || 200), 1000))}`
  ];
  if (filters.stationId) query.push(`station_id=eq.${encodeURIComponent(filters.stationId)}`);
  if (filters.reportType) query.push(`report_type=eq.${encodeURIComponent(filters.reportType)}`);
  if (filters.granularity) query.push(`granularity=eq.${encodeURIComponent(filters.granularity)}`);
  if (filters.oemId) query.push(`oem_id=eq.${encodeURIComponent(filters.oemId)}`);
  if (filters.year) {
    // Yearly rows carry period_start = Jan 1, so a year filter catches both grains.
    query.push(`period_start=gte.${Number(filters.year)}-01-01`);
    query.push(`period_start=lte.${Number(filters.year)}-12-31`);
  }
  if (filters.month && filters.year) {
    const month = String(Number(filters.month)).padStart(2, "0");
    query.push(`period_start=eq.${Number(filters.year)}-${month}-01`);
  }
  const [rows, slugs] = await Promise.all([
    supabase.restRequest(`/archive_reports?${query.join("&")}`),
    oemSlugById()
  ]);
  const reports = (Array.isArray(rows) ? rows : []).map((row) => reportRow(row, slugs));
  return { reports, totalCount: reports.length, filtersApplied: filters };
}

async function reportsSummary() {
  const [rows, slugs] = await Promise.all([
    supabase.restRequest(
      "/archive_reports?select=oem_id,station_id,report_type,granularity,period_start,row_count,byte_size"
    ),
    oemSlugById()
  ]);
  const list = Array.isArray(rows) ? rows : [];
  const byStation = {};
  const byType = {};
  const byGranularity = {};
  const byOem = {};
  let bytes = 0;
  let sourceRows = 0;
  let earliest = null;
  let latest = null;

  for (const row of list) {
    const station = row.station_id || "unknown";
    const oem = slugs.get(row.oem_id) || "unmapped";
    byStation[station] = (byStation[station] || 0) + 1;
    byType[row.report_type] = (byType[row.report_type] || 0) + 1;
    byGranularity[row.granularity] = (byGranularity[row.granularity] || 0) + 1;
    byOem[oem] = (byOem[oem] || 0) + 1;
    bytes += Number(row.byte_size || 0);
    sourceRows += Number(row.row_count || 0);
    const period = String(row.period_start || "");
    if (period) {
      if (!earliest || period < earliest) earliest = period;
      if (!latest || period > latest) latest = period;
    }
  }

  return {
    totalReports: list.length,
    // Sum of rows across objects. Yearly bundles re-cover the same source rows as their
    // monthly siblings, so this double-counts by design -- it is a measure of archived
    // content, not of distinct source records.
    totalRows: sourceRows,
    totalSizeMb: Math.round((bytes / 1048576) * 100) / 100,
    // The point of the archive is that this number is charged against the 1 GB
    // Storage quota, NOT the 500 MB Postgres quota.
    storageQuotaMb: 1024,
    byType,
    byGranularity,
    byOem,
    byStation,
    dateRange: { earliest, latest }
  };
}

/**
 * Self-describing download filename.
 *
 * The object's own name is just the period ("2026-06.csv.gz") because the rest of the
 * partition key lives in the path -- fine for storage, actively harmful for downloads:
 * a browser saves only the last path segment, so pulling KYAKALE then MUSHA then OGUFA
 * for the same month yields three files all called 2026-06.csv.gz that collide or
 * silently become "(1)", "(2)" in the download folder. There is then no way to tell
 * which station a file holds without opening it.
 *
 * SparkMeter solves this the same way, and their sample confirms the convention -- their
 * export is literally named
 *   {org_id}_{service_area_id}_{site_id}_20260808_daily_report.csv
 * i.e. the entire partition key is repeated in the filename, not just the path.
 */
function archiveFilename(record, downloadedAt = new Date()) {
  const period = record.granularity === "yearly"
    ? String(record.period_start || record.periodStart).slice(0, 4)
    : String(record.period_start || record.periodStart).slice(0, 7);
  const parts = [
    record.oem_slug || record.oemSlug || DEFAULT_OEM_SLUG,
    record.station_id || record.stationId,
    record.report_type || record.reportType,
    record.granularity,
    period
  ];
  // Download stamp: UTC date+time of the request, compact and sortable. Two people
  // pulling the same partition, or one person re-pulling it after a re-archive, get
  // distinguishable files instead of "(1)", "(2)" -- and the name records WHEN the
  // copy was taken, which matters because a partition can legitimately be re-archived.
  const stamp = downloadedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${parts.map((p) => pathSegment(p, "x")).join("_")}_dl${stamp}.csv.gz`;
}

/**
 * Mint a short-lived signed URL for one archived object. The bucket is private, so
 * this is the only way to read an archive, and the URL expires in minutes.
 *
 * The `download` query parameter makes Storage return
 * `Content-Disposition: attachment; filename=...`, so the browser saves the
 * self-describing name rather than the bare period.
 */
async function signedDownloadUrl(reportId) {
  const rows = await supabase.restRequest(
    `/archive_reports?select=*&id=eq.${encodeURIComponent(reportId)}&limit=1`
  );
  const record = Array.isArray(rows) ? rows[0] : null;
  if (!record) return { ok: false, reason: "Archive report not found" };

  const slugs = await oemSlugById();
  record.oem_slug = slugs.get(record.oem_id) || DEFAULT_OEM_SLUG;
  const filename = archiveFilename(record);

  const signed = await supabase.createSignedStorageUrl(
    record.bucket,
    record.object_path,
    SIGNED_URL_TTL_SECONDS,
    filename
  );
  if (!signed) return { ok: false, reason: "Storage disabled or URL could not be signed" };

  return {
    ok: true,
    url: signed.signedUrl,
    filename,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    report: reportRow(record, slugs)
  };
}

module.exports = {
  ARCHIVE_COLUMNS,
  PAYMENT_COLUMNS,
  archiveFilename,
  SWEEP_MATRIX,
  BUCKET,
  periodBounds,
  resolveOemForStation,
  archivePartition,
  listReports,
  newestEligibleMonth,
  objectPathFor,
  reportsSummary,
  runArchiveSweep,
  signedDownloadUrl,
  toCsv
};
