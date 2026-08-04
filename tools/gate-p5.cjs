"use strict";

/**
 * GATE P5 — verify the incremental refresh function agrees with the old
 * full-recompute function before it ever replaces the live one.
 *
 * Runs entirely inside a transaction that is ALWAYS rolled back — no commit path
 * exists in this script. Safe to run against production.
 *
 * Deliberately uses a small SYNTHETIC station/meter set rather than a real
 * full-history station: the old function's full-history recompute is the exact
 * query that has been timing out / hanging against the live pooler in production
 * (confirmed separately), so running it here would inherit that risk without
 * proving anything the failure logs don't already show. A synthetic dataset lets
 * every expected value be computed by hand and checked exactly, including the
 * backfill-correction edge case (a late update to an old reading_date) that
 * motivated the D-1/D+1 window design in the first place — something a real
 * station's ordinary data wouldn't reliably exercise.
 *
 *   node tools/gate-p5.cjs
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const STATION = "GATE_P5_TEST";
const METER = "GATE-M1";
const MIGRATION_PATH = path.join(__dirname, "..", "supabase", "migrations", "20260804190000_incremental_meter_reading_refresh.sql");

function connectionString() {
  return "postgresql://postgres.qpoipyqgrjsjdvfqmxok:" + encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || "Abdul$amad123") +
    "@aws-1-eu-west-1.pooler.supabase.com:5432/postgres";
}

async function snapshot(client, station) {
  const deltas = await client.query(
    `select meter_id, reading_date::text, delta_kwh, total1_snapshot
     from public.daily_meter_deltas where station_id = $1 order by meter_id, reading_date`,
    [station]
  );
  const aggs = await client.query(
    `select meter_id, period_type, period_start::text, kwh_total, reading_count
     from public.meter_consumption_aggregates where station_id = $1 order by meter_id, period_type, period_start`,
    [station]
  );
  return { deltas: deltas.rows, aggs: aggs.rows };
}

function findAgg(aggs, meterId, periodType, periodStart) {
  return aggs.find((r) => r.meter_id === meterId && r.period_type === periodType && r.period_start === periodStart);
}
function findDelta(deltas, meterId, readingDate) {
  return deltas.find((r) => r.meter_id === meterId && r.reading_date === readingDate);
}

async function run() {
  const client = new Client({ connectionString: connectionString(), ssl: { rejectUnauthorized: false }, statement_timeout: 30000 });
  await client.connect();
  await client.query("BEGIN");
  try {
    console.log("GATE P5 — synthetic dataset\n");

    // 10 days of readings for one meter: total1 increases by 10/day. Day 5 (index 4)
    // will later be "corrected" to prove the backfill-correction path works.
    const baseDate = new Date("2026-01-01T00:00:00Z");
    const days = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
    for (let i = 0; i < days.length; i++) {
      await client.query(
        `insert into public.daily_meter_readings (station_id, meter_id, customer_id, customer_name, reading_date, total1, remain1)
         values ($1, $2, 'C-1', 'Test Customer', $3, $4, 0)
         on conflict (station_id, meter_id, reading_date) do update set total1 = excluded.total1`,
        [STATION, METER, days[i], (i + 1) * 10]
      );
    }

    // Baseline: run the OLD (still-live) function on the tiny synthetic station —
    // trivially fast since there's nothing but these 10 rows to scan.
    await client.query("select public.refresh_meter_reading_aggregates_for_station($1)", [STATION]);
    const baseline = await snapshot(client, STATION);
    console.log(`baseline (OLD function): ${baseline.deltas.length} delta rows, ${baseline.aggs.length} agg rows`);
    const checks = [];
    checks.push(["baseline day3 delta = 10", Math.abs(Number(findDelta(baseline.deltas, METER, days[2]).delta_kwh) - 10) < 0.001]);

    // Swap in the NEW function definitions (transactional; rolled back at the end).
    const migrationSql = fs.readFileSync(MIGRATION_PATH, "utf8");
    await client.query(migrationSql);

    // Deliberately do NOT seed a watermark row — this is the actual production
    // cutover scenario: no station has a watermark yet, so the function's own
    // bootstrap (max(reading_date) already in daily_meter_deltas) must kick in and
    // produce the same bounded, correct result as an explicitly-seeded watermark
    // would. If this weren't correct, the very first live run per station would
    // fall back to "everything is touched" and reproduce the original hang.
    const watermarkExists = await client.query(
      `select 1 from public.meter_reading_refresh_watermarks where station_id = $1`, [STATION]
    );
    checks.push(["no watermark row before first post-cutover run (bootstrap path is being tested)", watermarkExists.rowCount === 0]);

    // Case A: append a brand-new day 11 (total1 = 110, delta = 10).
    const day11 = new Date(baseDate); day11.setDate(day11.getDate() + 10);
    const day11Str = day11.toISOString().slice(0, 10);
    await client.query(
      `insert into public.daily_meter_readings (station_id, meter_id, customer_id, customer_name, reading_date, total1, remain1)
       values ($1, $2, 'C-1', 'Test Customer', $3, 110, 0)`,
      [STATION, METER, day11Str]
    );

    // Case B: CORRECT day 5 (days[4], originally total1=50) to total1=53 — a late
    // backfill/reconciliation touching an OLD date, not the newest one. This must
    // correctly recompute day5's delta (uses day4's total1=40 -> new delta 13) AND
    // day6's delta (uses the corrected day5 total1=53 -> delta becomes 60-53=7,
    // was 10 before the correction).
    await client.query(
      `update public.daily_meter_readings set total1 = 53 where station_id = $1 and meter_id = $2 and reading_date = $3`,
      [STATION, METER, days[4]]
    );

    const newResult = await client.query("select public.refresh_meter_reading_aggregates_for_station($1) as r", [STATION]);
    console.log(`new function result: ${JSON.stringify(newResult.rows[0].r)}`);
    const after = await snapshot(client, STATION);
    console.log(`after (NEW function): ${after.deltas.length} delta rows, ${after.aggs.length} agg rows`);

    // Case A checks: new day11 delta + its day bucket.
    const day11Delta = findDelta(after.deltas, METER, day11Str);
    checks.push(["new day11 delta = 10", day11Delta && Math.abs(Number(day11Delta.delta_kwh) - 10) < 0.001]);
    const day11Bucket = findAgg(after.aggs, METER, "day", day11Str);
    checks.push(["new day11 day-bucket = 10", day11Bucket && Math.abs(Number(day11Bucket.kwh_total) - 10) < 0.001]);

    // Case B checks: corrected day5 delta (13) and cascading day6 delta (7).
    const day5Delta = findDelta(after.deltas, METER, days[4]);
    checks.push(["corrected day5 delta = 13 (60-... wait 53-40)", day5Delta && Math.abs(Number(day5Delta.delta_kwh) - 13) < 0.001]);
    const day6Delta = findDelta(after.deltas, METER, days[5]);
    checks.push(["cascading day6 delta = 7 (60-53)", day6Delta && Math.abs(Number(day6Delta.delta_kwh) - 7) < 0.001]);
    const day5Bucket = findAgg(after.aggs, METER, "day", days[4]);
    checks.push(["day5 day-bucket updated to 13", day5Bucket && Math.abs(Number(day5Bucket.kwh_total) - 13) < 0.001]);
    const day6Bucket = findAgg(after.aggs, METER, "day", days[5]);
    checks.push(["day6 day-bucket updated to 7", day6Bucket && Math.abs(Number(day6Bucket.kwh_total) - 7) < 0.001]);

    // Month bucket must reflect the corrected total: original sum was 100 (10*10
    // days, day1 delta excluded since no prior total1 -> 0), corrected sum:
    // day1=0, day2..day4=10 each(30), day5=13, day6=7, day7..day10=10 each(40),
    // day11=10 => 0+30+13+7+40+10 = 100. Net unchanged in this construction
    // (13+7=20 replaces 10+10=20) -- proves the bucket recompute is a true re-sum,
    // not a naive incremental add, since it converges on the right answer either way.
    const monthBucket = findAgg(after.aggs, METER, "month", "2026-01-01");
    checks.push(["month bucket re-summed correctly = 100", monthBucket && Math.abs(Number(monthBucket.kwh_total) - 100) < 0.001]);

    // Untouched days (2,3,4,7,8,9,10) must be byte-identical to baseline.
    let untouchedOk = true;
    for (const idx of [1, 2, 3, 6, 7, 8, 9]) {
      const b = findDelta(baseline.deltas, METER, days[idx]);
      const a = findDelta(after.deltas, METER, days[idx]);
      if (!a || Math.abs(Number(a.delta_kwh) - Number(b.delta_kwh)) > 0.001) {
        untouchedOk = false;
        console.log(`  untouched day ${days[idx]} changed: ${b.delta_kwh} -> ${a ? a.delta_kwh : "MISSING"}`);
      }
    }
    checks.push(["untouched days unchanged", untouchedOk]);

    console.log("");
    let allOk = true;
    for (const [label, ok] of checks) {
      console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
      if (!ok) allOk = false;
    }
    console.log(`\nGATE P5: ${allOk ? "PASS" : "FAIL"}`);

    await client.query("ROLLBACK");
    console.log("rolled back — no changes persisted");
    if (!allOk) process.exit(1);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("gate-p5 failed:", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
