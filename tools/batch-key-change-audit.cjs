"use strict";

/**
 * Batch key-change blast-radius audit.
 *
 * Scopes which meters had their STS key record changed in a given update batch
 * (default 2026-02-22). A batch key update can write key params the physical
 * meter never adopted (its re-key KCT was rejected), leaving the vending backend
 * encrypting every token with a key the meter can't match → TokenReject on all
 * credit/clear-tamper/KCT tokens while the DISCO's own tokens still work.
 * See docs — first diagnosed on 3-phase meter 47300481778 (SGC 250405).
 *
 * Read-only. Pages /api/meter/read and filters by updateDate.
 *
 * Usage:
 *   node tools/batch-key-change-audit.cjs [--date=2026-02-22] [--time=16:20]
 *        [--page-size=200] [--phase=three|single|all] [--out=tmp/...]
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

function parseArgs(argv) {
  const args = { date: "2026-02-22", time: "", pageSize: 200, phase: "all", out: "" };
  for (const raw of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(raw);
    if (!m) continue;
    const [, key, value] = m;
    if (key === "date") args.date = value.trim();
    else if (key === "time") args.time = value.trim();
    else if (key === "page-size") args.pageSize = Math.max(1, Number(value) || 200);
    else if (key === "phase") args.phase = value.trim().toLowerCase();
    else if (key === "out") args.out = value.trim();
  }
  return args;
}

function rowsFrom(body) {
  const buckets = [
    body?.result?.data, body?.result?.records, body?.result?.list,
    body?.data?.data, body?.data?.records, body?.data, body?.records, body?.rows,
  ];
  for (const bucket of buckets) if (Array.isArray(bucket)) return bucket;
  return [];
}

function totalFrom(body) {
  return Number(body?.result?.total ?? body?.data?.total ?? body?.total ?? 0) || 0;
}

async function readMeterPage(pageNumber, pageSize) {
  const response = await fetch(`${baseUrl}/api/meter/read`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: bearerToken ? `Bearer ${bearerToken}` : "",
    },
    body: JSON.stringify({ pageNumber, pageSize }),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok) {
    throw new Error(`meter/read HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const code = body?.code;
  if (code !== undefined && code !== 0 && code !== 200) {
    throw new Error(`meter/read business error code ${code}: ${body?.reason || body?.msg || ""}`);
  }
  return body;
}

function normalizeBool3Phase(row) {
  const v = row.isThreePhase ?? row.is_three_phase ?? row.threePhase;
  if (v === true || v === 1 || v === "1") return true;
  if (v === false || v === 0 || v === "0") return false;
  return null;
}

function phaseLabel(row) {
  const t = normalizeBool3Phase(row);
  return t === true ? "three" : t === false ? "single" : "unknown";
}

function keyFingerprint(row) {
  return [row.sgc, row.krn, row.ken, row.ti, row.kt, row.baseYear]
    .map((v) => (v === undefined || v === null ? "" : v)).join("/");
}

async function main() {
  if (!baseUrl) {
    console.error("Missing UPSTREAM_API_URL (or LIVE_API_BASE_URL) in .env");
    process.exit(1);
  }
  if (!bearerToken) {
    console.error("Missing UPSTREAM_BEARER_TOKEN (or LIVE_API_BEARER_TOKEN) in .env");
    process.exit(1);
  }

  const args = parseArgs(process.argv);
  const datePrefix = args.date;
  const timePrefix = args.time ? `${args.date} ${args.time}` : "";
  console.log(`Scanning meter catalog for updateDate starting "${timePrefix || datePrefix}" (phase=${args.phase})...`);

  const first = await readMeterPage(1, args.pageSize);
  const total = totalFrom(first);
  const pageCount = total ? Math.ceil(total / args.pageSize) : 1;

  const matches = [];
  let scanned = 0;

  const collect = (rows) => {
    for (const row of rows) {
      scanned += 1;
      const updateDate = String(row.updateDate || row.update_date || "").trim();
      const stamp = timePrefix || datePrefix;
      if (!updateDate.startsWith(stamp)) continue;
      if (args.phase !== "all" && phaseLabel(row) !== args.phase) continue;
      matches.push({
        meterId: String(row.meterId || row.meter_id || row.id || "").trim(),
        phase: phaseLabel(row),
        sgc: row.sgc ?? null,
        krn: row.krn ?? null,
        ken: row.ken ?? null,
        ti: row.ti ?? null,
        kt: row.kt ?? null,
        baseYear: row.baseYear ?? null,
        keyFingerprint: keyFingerprint(row),
        stationId: row.stationId || row.station_id || null,
        updateId: row.updateId || row.update_id || null,
        updateDate,
        createDate: String(row.createDate || row.create_date || "").trim() || null,
      });
    }
  };

  collect(rowsFrom(first));
  for (let page = 2; page <= pageCount; page += 1) {
    const body = await readMeterPage(page, args.pageSize);
    const rows = rowsFrom(body);
    if (!rows.length) break;
    collect(rows);
    if (page % 10 === 0) console.log(`  …scanned ${scanned}/${total || "?"} meters, ${matches.length} in batch so far`);
  }

  // ── Summaries ──────────────────────────────────────────────
  matches.sort((a, b) => a.meterId.localeCompare(b.meterId));

  const byMinute = {};
  const bySgc = {};
  const byPhase = { three: 0, single: 0, unknown: 0 };
  const byFingerprint = {};
  for (const m of matches) {
    const minute = m.updateDate.slice(0, 16);
    byMinute[minute] = (byMinute[minute] || 0) + 1;
    bySgc[m.sgc ?? "?"] = (bySgc[m.sgc ?? "?"] || 0) + 1;
    byPhase[m.phase] = (byPhase[m.phase] || 0) + 1;
    byFingerprint[m.keyFingerprint] = (byFingerprint[m.keyFingerprint] || 0) + 1;
  }

  console.log(`\nScanned ${scanned} meters (catalog total ${total || scanned}).`);
  console.log(`Batch matches: ${matches.length}`);
  console.log(`  Phase: three=${byPhase.three} single=${byPhase.single} unknown=${byPhase.unknown}`);
  console.log(`  Update-minute distribution:`);
  for (const [minute, count] of Object.entries(byMinute).sort()) console.log(`    ${minute}  ×${count}`);
  console.log(`  SGC distribution:`);
  for (const [sgc, count] of Object.entries(bySgc).sort((a, b) => b[1] - a[1])) console.log(`    SGC ${sgc}  ×${count}`);
  console.log(`  Key fingerprint (sgc/krn/ken/ti/kt/baseYear) distribution:`);
  for (const [fp, count] of Object.entries(byFingerprint).sort((a, b) => b[1] - a[1])) console.log(`    ${fp}  ×${count}`);

  // ── Write report ───────────────────────────────────────────
  const outBase = args.out
    ? path.resolve(root, args.out)
    : path.join(root, "tmp", `batch-key-change-audit-${datePrefix}`);
  fs.mkdirSync(path.dirname(outBase), { recursive: true });

  const jsonPath = `${outBase}.json`;
  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    filter: { date: datePrefix, time: args.time || null, phase: args.phase },
    catalogTotal: total || scanned,
    scanned,
    matchCount: matches.length,
    summary: { byPhase, byMinute, bySgc, byFingerprint },
    meters: matches,
  }, null, 2));

  const csvPath = `${outBase}.csv`;
  const header = "meterId,phase,sgc,krn,ken,ti,kt,baseYear,stationId,updateId,updateDate,createDate";
  const csv = [header].concat(matches.map((m) => [
    m.meterId, m.phase, m.sgc, m.krn, m.ken, m.ti, m.kt, m.baseYear,
    m.stationId, m.updateId, m.updateDate, m.createDate,
  ].map((v) => (v === null || v === undefined ? "" : String(v))).join(","))).join("\n");
  fs.writeFileSync(csvPath, csv);

  console.log(`\nReport written:\n  ${jsonPath}\n  ${csvPath}`);
}

main().catch((error) => {
  console.error("Audit failed:", error.message);
  process.exit(1);
});
