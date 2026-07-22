/**
 * seed-meter-aggregates.mjs
 *
 * Computes per-meter daily deltas and period aggregates entirely in JS
 * (same logic as refresh_meter_reading_aggregates Postgres function)
 * then upserts into:
 *   - daily_meter_deltas
 *   - meter_consumption_aggregates
 *
 * Works around Supabase's statement timeout on the full-table RPC.
 * Run once to seed; pg_cron will keep tables fresh thereafter.
 *
 * Usage:
 *   node tools/seed-meter-aggregates.mjs
 */

import https from "https";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("./env-loader.cjs").loadEnvFile();

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}
const STATIONS      = ["TUNGA", "UMAISHA", "OGUFA", "KYAKALE", "MUSHA"];
const PAGE_SIZE     = 1000;
const UPSERT_BATCH  = 500;

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function request(method, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url  = new URL(SUPABASE_URL + path);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers: {
        apikey:          SERVICE_KEY,
        Authorization:   "Bearer " + SERVICE_KEY,
        "Content-Type":  "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        ...extraHeaders,
      },
    };
    const req = https.request(opts, res => {
      let d = "";
      res.on("data", c => (d += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body: d }); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function get(path, extraHeaders = {}) { return request("GET", path, null, extraHeaders); }

async function upsert(table, rows, conflictCols) {
  const path = `/rest/v1/${table}?on_conflict=${conflictCols}`;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const r = await request("POST", path, batch, {
      Prefer: "resolution=merge-duplicates,return=minimal",
    });
    if (r.status >= 400) {
      throw new Error(`Upsert ${table} failed ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
    }
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function isoWeekKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00.000Z");
  const thu = new Date(d);
  thu.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((thu - yearStart) / 86400000) + 1) / 7);
  return `${thu.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

function periodStart(dateStr, periodType) {
  // Returns YYYY-MM-DD of the first day of the period containing dateStr
  const d = new Date(dateStr + "T00:00:00.000Z");
  if (periodType === "day")   return dateStr;
  if (periodType === "week") {
    // Monday-start ISO week
    const day = d.getUTCDay() || 7; // Sun=7
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() - (day - 1));
    return mon.toISOString().slice(0, 10);
  }
  if (periodType === "month") return dateStr.slice(0, 7) + "-01";
  if (periodType === "year")  return dateStr.slice(0, 4) + "-01-01";
  return dateStr;
}

function round3(v) { return Math.round((Number(v) || 0) * 1000) / 1000; }

// ── Per-station processing ────────────────────────────────────────────────────

async function processStation(stationId) {
  log(`\n═══ ${stationId} ═══`);

  // 1. Determine total row count
  const hdResp = await get(
    `/rest/v1/daily_meter_readings?select=station_id&station_id=eq.${stationId}&limit=1`,
    { Prefer: "count=exact", Range: "0-0" }
  );
  const total = parseInt((hdResp.headers["content-range"] || "").split("/")[1] || "0");
  log(`  ${total} raw readings to process`);

  // 2. Fetch all readings for this station, ordered by meter then date
  //    (mirrors the window function partition by meter_id order by reading_date)
  const allRows = [];
  let offset = 0;
  while (offset < total) {
    const end = offset + PAGE_SIZE - 1;
    const r = await get(
      `/rest/v1/daily_meter_readings` +
      `?select=meter_id,customer_id,customer_name,reading_date,total1,remain1` +
      `&station_id=eq.${stationId}` +
      `&order=meter_id.asc,reading_date.asc`,
      { Range: `${offset}-${end}` }
    );
    const rows = Array.isArray(r.body) ? r.body : [];
    if (!rows.length) break;
    allRows.push(...rows);
    offset += PAGE_SIZE;
    process.stdout.write(`\r  fetched ${allRows.length}/${total} rows`);
  }
  process.stdout.write("\n");

  // 3. Compute per-meter daily deltas (LAG logic)
  const now = new Date().toISOString();
  const deltaRows = [];

  let prevMeterId = null;
  let prevTotal1  = null;

  for (const row of allRows) {
    const meterId  = row.meter_id;
    const total1   = row.total1 == null || row.total1 < 0 ? null : Number(row.total1);
    const remain1  = row.remain1 == null ? null : Number(row.remain1);
    const sameMeter = meterId === prevMeterId;

    let delta = 0;
    if (total1 !== null && sameMeter && prevTotal1 !== null && prevTotal1 >= 0) {
      delta = round3(Math.max(0, total1 - prevTotal1));
    }

    deltaRows.push({
      station_id:       stationId,
      meter_id:         meterId,
      reading_date:     row.reading_date,
      delta_kwh:        delta,
      total1_snapshot:  total1,
      remain1_snapshot: remain1,
      customer_id:      row.customer_id || null,
      customer_name:    row.customer_name || null,
      last_refreshed_at: now,
    });

    prevMeterId = meterId;
    prevTotal1  = total1;
  }

  log(`  computed ${deltaRows.length} delta rows`);

  // 4. Upsert daily_meter_deltas
  log(`  upserting daily_meter_deltas...`);
  await upsert("daily_meter_deltas", deltaRows, "station_id,meter_id,reading_date");
  log(`  ✓ daily_meter_deltas done`);

  // 5. Build period aggregates from the deltas
  const PERIOD_TYPES = ["day", "week", "month", "year"];
  const aggMap = new Map(); // key: "periodType|meterId|periodStart" → accumulator

  for (const d of deltaRows) {
    for (const pt of PERIOD_TYPES) {
      const ps  = periodStart(d.reading_date, pt);
      const key = `${pt}|${d.meter_id}|${ps}`;
      if (!aggMap.has(key)) {
        aggMap.set(key, {
          station_id:    stationId,
          meter_id:      d.meter_id,
          customer_id:   null,
          customer_name: null,
          period_type:   pt,
          period_start:  ps,
          kwh_total:     0,
          reading_count: 0,
          last_refreshed_at: now,
          _latestDate:   "",
        });
      }
      const agg = aggMap.get(key);
      agg.kwh_total    = round3(agg.kwh_total + d.delta_kwh);
      agg.reading_count++;
      // Keep most-recent customer info (latest reading_date wins)
      if (d.reading_date >= agg._latestDate) {
        agg._latestDate = d.reading_date;
        if (d.customer_id)   agg.customer_id   = d.customer_id;
        if (d.customer_name) agg.customer_name = d.customer_name;
      }
    }
  }

  const aggRows = Array.from(aggMap.values()).map(a => {
    const { _latestDate, ...rest } = a;
    return rest;
  });

  log(`  upserting ${aggRows.length} meter_consumption_aggregates rows...`);
  await upsert("meter_consumption_aggregates", aggRows, "station_id,meter_id,period_type,period_start");
  log(`  ✓ meter_consumption_aggregates done`);

  // Summary stats
  const totalKwh = round3(deltaRows.reduce((s, r) => s + r.delta_kwh, 0));
  const activeMeters = new Set(deltaRows.filter(r => r.delta_kwh > 0).map(r => r.meter_id)).size;
  const totalMeters  = new Set(deltaRows.map(r => r.meter_id)).size;

  return { station: stationId, totalKwh, totalMeters, activeMeters };
}

function log(msg) { console.log(msg); }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Meter aggregate seed — " + new Date().toISOString());
  console.log("Stations: " + STATIONS.join(", "));

  const results = [];
  for (const station of STATIONS) {
    try {
      const r = await processStation(station);
      results.push(r);
    } catch (err) {
      console.error(`ERROR on ${station}: ${err.message}`);
      results.push({ station, error: err.message });
    }
  }

  console.log("\n\n══════════════════════════════════════════");
  console.log("SEED COMPLETE");
  console.log("══════════════════════════════════════════");
  let grandTotal = 0;
  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.station}: ERROR — ${r.error}`);
    } else {
      grandTotal += r.totalKwh;
      console.log(
        `  ${r.station.padEnd(8)} ${String(r.totalKwh.toFixed(2)).padStart(10)} kWh` +
        `  |  ${r.activeMeters}/${r.totalMeters} active meters`
      );
    }
  }
  console.log("  ─────────────────────────────────────");
  console.log(`  TOTAL    ${String(grandTotal.toFixed(2)).padStart(10)} kWh`);
  console.log("══════════════════════════════════════════\n");
}

main().catch(err => { console.error("Fatal:", err.message); process.exit(1); });
