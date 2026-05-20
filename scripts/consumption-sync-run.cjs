#!/usr/bin/env node
"use strict";
/**
 * One-time / manual runner for the consumption sync service.
 *
 * The full historical backfill must NOT run through the Vercel cron endpoint
 * (serverless functions time out). Run it here instead — this machine reaches
 * both the upstream (8.208.16.168) and Supabase, and writes directly to the
 * daily_meter_readings store.
 *
 * Usage:
 *   node scripts/consumption-sync-run.cjs probe          # connectivity + baseline
 *   node scripts/consumption-sync-run.cjs backfill       # one-time full history pull
 *   node scripts/consumption-sync-run.cjs incremental    # what the cron runs
 *
 * Flags: --stations=TUNGA,UMAISHA --from=2025-01-01 --to=2026-05-20 --max-pages=0
 */
const fs = require("fs");
const path = require("path");

// --- load root .env into process.env (no dotenv dependency) ---
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function parseFlags(argv) {
  const out = {};
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

(async () => {
  loadEnv();
  // The proxy gate is irrelevant here; the service reads the base URL/token directly.
  if (!process.env.LIVE_API_BASE_URL && process.env.UPSTREAM_API_URL) {
    process.env.LIVE_API_BASE_URL = process.env.UPSTREAM_API_URL;
  }

  const cmd = (process.argv[2] || "probe").toLowerCase();
  const flags = parseFlags(process.argv.slice(3));
  const { runConsumptionSync } = require("../backend/src/services/consumption-sync-service");
  const { dailyMeterStationStats } = require("../backend/src/services/consumption-store");
  const { stations: defaultStations } = require("../backend/src/services/refresh-targets");

  const stations = flags.stations ? flags.stations.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : defaultStations;
  const base = (process.env.LIVE_API_BASE_URL || "").replace(/:\/\/([0-9.]+).*/, "://$1...");
  console.log(`[sync] command=${cmd} upstream=${base} stations=${stations.join(",")}`);

  if (cmd === "probe") {
    const stats = await dailyMeterStationStats(stations);
    console.log("[probe] Supabase store ready:", stats.tableReady, stats.error ? `(${stats.error})` : "");
    console.log("[probe] baseline per station:");
    for (const s of stats.stations || []) {
      console.log(`   - ${s.station}: rows=${s.rows} latest=${s.latestReadingDate || "(none)"} earliest=${s.earliestReadingDate || "(none)"}`);
    }
    // Force one tiny upstream page to confirm auth/connectivity end-to-end.
    const probeStation = stations[0];
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    console.log(`[probe] test upstream fetch: ${probeStation} ${from}..${to} (1 page)`);
    const res = await runConsumptionSync({ mode: "backfill", stations: probeStation, from, to, maxPagesPerStation: 1 });
    const st = res.stations[0] || {};
    console.log(`[probe] upstream OK? fetched=${res.fetchedRows} stored=${res.storedRows} rawTotal=${st.rawTotal} ok=${res.ok}`);
    if (res.failures.length) console.log("[probe] failures:", JSON.stringify(res.failures));
    console.log(res.ok ? "[probe] PASS — upstream + Supabase reachable." : "[probe] FAIL — see failures above.");
    process.exit(res.ok ? 0 : 1);
  }

  const mode = cmd === "backfill" ? "backfill" : "incremental";
  const started = Date.now();
  const res = await runConsumptionSync({
    mode,
    stations: flags.stations,
    from: flags.from,
    to: flags.to,
    maxPagesPerStation: flags["max-pages"] !== undefined ? Number(flags["max-pages"]) : undefined,
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[${mode}] done in ${secs}s ok=${res.ok} fetched=${res.fetchedRows} stored=${res.storedRows} synced=${res.syncedStations}/${res.stationCount} failed=${res.failedStations}`);
  for (const s of res.stations) {
    console.log(`   - ${s.stationId}: ${s.from}..${s.to} pages=${s.pagesFetched} fetched=${s.fetchedRows} stored=${s.storedRows} detect=${s.detection}`);
  }
  if (res.failures.length) console.log("[failures]", JSON.stringify(res.failures, null, 2));
  console.log("[after]", JSON.stringify(res.after, null, 2));
  process.exit(res.ok ? 0 : 1);
})().catch((e) => { console.error("[fatal]", e && e.stack ? e.stack : e); process.exit(1); });
