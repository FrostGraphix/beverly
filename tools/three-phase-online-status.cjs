"use strict";

/**
 * Three-phase meter online/offline + tamper report.
 *
 * Per-meter online status is NOT available from /API/GPRSOnlineStatus/Read
 * (that table is empty for this fleet — meters report via gateway concentrators).
 * The reliable per-meter signal is the latest /api/DailyDataMeter/read row:
 * its `currentDate` is the meter's last reported interval, and the same row
 * carries live tamper/diagnostic flags and remaining credit.
 *
 * ONLINE  = last interval within --stale-days (default 2)
 * OFFLINE = no interval data, or last interval older than the threshold
 *
 * Read-only.
 *
 * Usage:
 *   node tools/three-phase-online-status.cjs [--stale-days=2] [--station=UMAISHA]
 *        [--page-size=200] [--out=tmp/...]
 *
 * Env (from .env): UPSTREAM_API_URL, UPSTREAM_BEARER_TOKEN
 */

const fs = require("fs");
const path = require("path");
const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

const root = path.resolve(__dirname, "..");
const baseUrl = process.env.UPSTREAM_API_URL || process.env.LIVE_API_BASE_URL || "";
const bearerToken = process.env.UPSTREAM_BEARER_TOKEN || process.env.LIVE_API_BEARER_TOKEN || "";

/**
 * Diagnostic flags on /api/DailyDataMeter/read rows.
 *
 * IMPORTANT — the boolean shape is INVERTED relative to the field names:
 * `true` means the condition is NOT present (healthy); `false` means the named
 * condition IS active. Verified empirically: relayOpen=true correlates with
 * meters that actually draw energy (relay closed), while every relayOpen=false
 * meter shows zero usage. The string shape (/api/DailyDataMeter/readHourly:
 * "Open"/"Normal"/"Yes"/"No") uses the opposite, literal convention — do not
 * mix the two.
 *
 * Rows where total1 === -1 are no-data sentinels: every flag reads false and
 * none of them are meaningful.
 */
const TAMPER_FLAGS = [
  "coverOpen", "terminalCoverOpen", "magneticInterference",
  "currentReverse", "currentUnbalance", "source2Activated",
];

/** Supply relay: false = relay open (customer disconnected). Not a tamper. */
const RELAY_FLAG = "relayOpen";

function hasInterval(row) {
  return Boolean(row) && Number(row.total1) !== -1;
}

/** Active alarm conditions on a row (flag === false), or [] when there is no data. */
function activeFlags(row, flags) {
  if (!hasInterval(row)) return [];
  return flags.filter((flag) => row[flag] === false);
}

function parseArgs(argv) {
  const args = { staleDays: 2, station: "", pageSize: 200, out: "" };
  for (const raw of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(raw);
    if (!m) continue;
    const [, key, value] = m;
    if (key === "stale-days") args.staleDays = Math.max(0, Number(value) || 2);
    else if (key === "station") args.station = value.trim();
    else if (key === "page-size") args.pageSize = Math.max(1, Number(value) || 200);
    else if (key === "out") args.out = value.trim();
  }
  return args;
}

async function call(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: bearerToken ? `Bearer ${bearerToken}` : "",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!response.ok) throw new Error(`${pathname} HTTP ${response.status}: ${text.slice(0, 160)}`);
  const code = parsed?.code;
  if (code !== undefined && code !== 0 && code !== 200) {
    throw new Error(`${pathname} code ${code}: ${parsed?.reason || parsed?.msg || ""}`);
  }
  return parsed;
}

function rowsFrom(body) {
  const buckets = [
    body?.result?.data, body?.result?.records, body?.result?.list,
    body?.data?.data, body?.data?.records, body?.data, body?.records, body?.rows,
  ];
  for (const bucket of buckets) if (Array.isArray(bucket)) return bucket;
  return [];
}

function isThreePhase(row) {
  const v = row.isThreePhase ?? row.is_three_phase ?? row.threePhase;
  return v === true || v === 1 || v === "1";
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function collectThreePhaseMeters(pageSize, station) {
  const first = await call("/api/meter/read", { pageNumber: 1, pageSize });
  const total = Number(first?.result?.total ?? 0) || 0;
  const pages = total ? Math.ceil(total / pageSize) : 1;
  const meters = [];
  const take = (rows) => {
    for (const row of rows) {
      if (!isThreePhase(row)) continue;
      const stationId = String(row.stationId || "").trim();
      if (station && stationId.toUpperCase() !== station.toUpperCase()) continue;
      meters.push({
        meterId: String(row.meterId || row.id || "").trim(),
        stationId,
        sgc: row.sgc ?? null,
        krn: row.krn ?? null,
        keyUpdatedAt: String(row.updateDate || "").trim() || null,
      });
    }
  };
  take(rowsFrom(first));
  for (let page = 2; page <= pages; page += 1) {
    const body = await call("/api/meter/read", { pageNumber: page, pageSize });
    const rows = rowsFrom(body);
    if (!rows.length) break;
    take(rows);
  }
  return { meters, catalogTotal: total };
}

async function latestInterval(meterId) {
  const body = await call("/api/DailyDataMeter/read", {
    lang: "en", meterId, pageNumber: 1, pageSize: 1, orderBy: "currentDate desc",
  });
  return rowsFrom(body)[0] || null;
}

/** Station id used as a placeholder for meters not yet assigned to a site. */
const PLACEHOLDER_STATION = "0001";

function renderMarkdown(results, online, offline, byStation, args) {
  const deployedOffline = offline.filter((r) => r.stationId !== PLACEHOLDER_STATION);
  const uncommissioned = offline.filter((r) => r.stationId === PLACEHOLDER_STATION);
  const sortBy = (list) => [...list].sort((a, b) =>
    (a.stationId || "").localeCompare(b.stationId || "") || a.meterId.localeCompare(b.meterId));
  const out = [];

  out.push("# Three-Phase Meters — Online / Offline Status", "");
  out.push(`_Generated ${new Date().toISOString()} · online = reported within ${args.staleDays} day(s)_`, "");
  out.push(
    `- **Total three-phase meters:** ${results.length}`,
    `- **Online:** ${online.length}`,
    `- **Offline (deployed stations):** ${deployedOffline.length}`,
    `- **Uncommissioned** (station \`${PLACEHOLDER_STATION}\`, never reported): ${uncommissioned.length}`,
    "",
  );

  out.push(`## Online (${online.length})`, "");
  out.push("| Meter | Station | Customer | Last seen | Credit left | Supply | Tamper |");
  out.push("|---|---|---|---|---|---|---|");
  for (const r of sortBy(online)) {
    const supply = r.relayDisconnected === true ? "**relay open**" : "connected";
    const tamper = r.tamperFlags.length ? r.tamperFlags.join(", ") : "—";
    out.push(`| \`${r.meterId}\` | ${r.stationId} | ${r.customerName || "—"} | ${r.lastSeen || "—"} | ${r.remainingCredit ?? "—"} | ${supply} | ${tamper} |`);
  }
  out.push("");

  out.push(`## Offline — deployed stations (${deployedOffline.length})`, "");
  out.push("| Meter | Station | Last seen |");
  out.push("|---|---|---|");
  for (const r of sortBy(deployedOffline)) {
    out.push(`| \`${r.meterId}\` | ${r.stationId} | ${r.lastSeen || "never"} |`);
  }
  out.push("");

  out.push(`## Uncommissioned — station \`${PLACEHOLDER_STATION}\` (${uncommissioned.length})`, "");
  out.push("Not assigned to a site; no interval data ever reported.", "");
  out.push(sortBy(uncommissioned).map((r) => `\`${r.meterId}\``).join(", "), "");

  out.push("## By station", "");
  out.push("| Station | Online | Offline | Relay open | Tampered |");
  out.push("|---|---|---|---|---|");
  for (const [station, v] of Object.entries(byStation).sort()) {
    out.push(`| ${station} | ${v.online} | ${v.offline} | ${v.relayOpen} | ${v.tampered} |`);
  }
  out.push("");

  out.push("## Notes", "");
  out.push("- Per-meter online status is derived from the latest `/api/DailyDataMeter/read` interval;");
  out.push("  `/API/GPRSOnlineStatus/Read` returns no rows for this fleet.");
  out.push("- **Flag polarity:** in the boolean shape of `/api/DailyDataMeter/read`, `true` means the");
  out.push("  condition is NOT present (healthy) and `false` means it IS active — inverted relative to");
  out.push("  the field names. Verified via `relayOpen`: every `relayOpen=false` meter draws zero energy,");
  out.push("  while `relayOpen=true` meters can consume. The string shape (`readHourly`:");
  out.push("  \"Open\"/\"Normal\"/\"Yes\"/\"No\") uses the opposite, literal convention.");
  out.push("- Rows with `total1 === -1` are no-data sentinels; their flags are meaningless.");
  out.push("- `relay open` means the supply is disconnected at the meter — it is not a tamper.");
  out.push("");
  out.push("Regenerate: `node tools/three-phase-online-status.cjs --stale-days=2`");
  out.push("");
  return out.join("\n");
}

async function main() {
  if (!baseUrl || !bearerToken) {
    console.error("Missing UPSTREAM_API_URL / UPSTREAM_BEARER_TOKEN in .env");
    process.exit(1);
  }
  const args = parseArgs(process.argv);
  console.log(`Collecting three-phase meters${args.station ? ` at station ${args.station}` : ""}...`);
  const { meters, catalogTotal } = await collectThreePhaseMeters(args.pageSize, args.station);
  console.log(`Found ${meters.length} three-phase meters (catalog total ${catalogTotal}). Reading latest interval for each...`);

  const cutoff = Date.now() - args.staleDays * 24 * 60 * 60 * 1000;
  const results = [];
  let done = 0;

  for (const meter of meters) {
    let row = null;
    let error = null;
    try { row = await latestInterval(meter.meterId); }
    catch (e) { error = e.message; }

    const lastSeen = row ? parseDate(row.currentDate) : null;
    const online = Boolean(lastSeen && lastSeen.getTime() >= cutoff);
    const tampers = activeFlags(row, TAMPER_FLAGS);
    // relayOpen === false means the supply relay is open → customer disconnected.
    const relayDisconnected = hasInterval(row) ? row[RELAY_FLAG] === false : null;

    results.push({
      meterId: meter.meterId,
      stationId: meter.stationId,
      customerName: row ? String(row.customerName || "") : "",
      online,
      lastSeen: row ? String(row.currentDate || "") : null,
      gatewayId: row ? String(row.gatewayId || "") : null,
      remainingCredit: row ? (row.remain1 ?? null) : null,
      power: row ? (row.power ?? null) : null,
      // batteryLow follows the same inversion: false = battery IS low.
      batteryLow: hasInterval(row) ? row.batteryLow === false : null,
      relayDisconnected,
      tamperFlags: tampers,
      tampered: tampers.length > 0,
      keyUpdatedAt: meter.keyUpdatedAt,
      error,
    });

    done += 1;
    if (done % 25 === 0) console.log(`  …${done}/${meters.length}`);
  }

  const online = results.filter((r) => r.online);
  const offline = results.filter((r) => !r.online);
  const tampered = results.filter((r) => r.tampered);
  const disconnected = results.filter((r) => r.relayDisconnected === true);

  const line = (r) => `  ${r.meterId}  ${String(r.stationId).padEnd(12)} last=${r.lastSeen || "never"}` +
    `${r.relayDisconnected ? "  RELAY-OPEN" : ""}` +
    `${r.tampered ? `  TAMPER[${r.tamperFlags.join(",")}]` : ""}`;

  console.log(`\n===== THREE-PHASE METERS: ${results.length} =====`);
  console.log(`\nONLINE (${online.length})  — reported within ${args.staleDays} day(s)`);
  online.forEach((r) => console.log(line(r)));
  console.log(`\nOFFLINE (${offline.length})`);
  offline.forEach((r) => console.log(line(r)));
  console.log(`\nRELAY OPEN — supply disconnected (${disconnected.length})`);
  disconnected.forEach((r) => console.log(line(r)));
  console.log(`\nTAMPERED (${tampered.length}) — active tamper conditions`);
  if (!tampered.length) console.log("  (none)");
  tampered.forEach((r) => console.log(line(r)));

  const byStation = {};
  for (const r of results) {
    const s = r.stationId || "?";
    byStation[s] = byStation[s] || { online: 0, offline: 0, tampered: 0, relayOpen: 0 };
    byStation[s][r.online ? "online" : "offline"] += 1;
    if (r.tampered) byStation[s].tampered += 1;
    if (r.relayDisconnected) byStation[s].relayOpen += 1;
  }
  console.log(`\nBy station:`);
  for (const [s, v] of Object.entries(byStation).sort()) {
    console.log(`  ${s.padEnd(14)} online=${v.online} offline=${v.offline} relayOpen=${v.relayOpen} tampered=${v.tampered}`);
  }

  const outBase = args.out ? path.resolve(root, args.out) : path.join(root, "tmp", "three-phase-online-status");
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  fs.writeFileSync(`${outBase}.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    filter: { staleDays: args.staleDays, station: args.station || null },
    counts: {
      total: results.length, online: online.length, offline: offline.length,
      relayDisconnected: disconnected.length, tampered: tampered.length,
    },
    byStation,
    meters: results,
  }, null, 2));

  const header = "meterId,stationId,customerName,online,lastSeen,gatewayId,remainingCredit,power,relayDisconnected,batteryLow,tampered,tamperFlags,keyUpdatedAt";
  const csv = [header].concat(results.map((r) => [
    r.meterId, r.stationId, `"${r.customerName}"`, r.online, r.lastSeen || "", r.gatewayId || "",
    r.remainingCredit ?? "", r.power ?? "", r.relayDisconnected ?? "", r.batteryLow ?? "",
    r.tampered, `"${r.tamperFlags.join("|")}"`, r.keyUpdatedAt || "",
  ].join(","))).join("\n");
  fs.writeFileSync(`${outBase}.csv`, csv);

  fs.writeFileSync(`${outBase}.md`, renderMarkdown(results, online, offline, byStation, args));

  console.log(`\nReport written:\n  ${outBase}.json\n  ${outBase}.csv\n  ${outBase}.md`);
}

main().catch((error) => {
  console.error("Report failed:", error.message);
  process.exit(1);
});
