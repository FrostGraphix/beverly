"use strict";

/**
 * GATE P1 — verify the aggregate orphan prune is bounded.
 *
 * Run BEFORE applying 20260801090000_bound_aggregate_orphan_prune.sql to capture
 * the baseline, and AFTER (including after a manual station refresh) to prove the
 * month/year rollups survived.
 *
 * Read-only. Makes no writes of any kind.
 *
 *   node tools/gate-p1.cjs                 # print the gate values
 *   node tools/gate-p1.cjs --save before   # write tmp/p1/gate-before.json
 *   node tools/gate-p1.cjs --compare before
 *
 * Baseline measured 2026-08-01:
 *   month+year rows        19,685
 *   month tariff_value_ngn NGN 43,632,937.50
 *   unguarded exposure     9,273 month + 444 year = NGN 21,380,551.50
 *   guarded exposure       0 rows
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

const args = process.argv.slice(2);
const SAVE = args.includes("--save") ? args[args.indexOf("--save") + 1] : null;
const COMPARE = args.includes("--compare") ? args[args.indexOf("--compare") + 1] : null;

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "tmp", "p1");

function connectionString() {
  const raw =
    process.env.SUPABASE_DB_URL ||
    fs.readFileSync(path.join(root, "supabase", ".temp", "pooler-url"), "utf8").trim();
  const password =
    process.env.SUPABASE_DB_PASSWORD ||
    process.env.SUPABASE_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    process.env.PGPASSWORD;
  const url = new URL(raw);
  if (password) url.password = password;
  return url.toString();
}

// The live function's own predicate, reproduced exactly, so the "would delete"
// figures reflect what the function actually does rather than an approximation.
const ORPHAN_PREDICATE = `
  not exists (
    select 1 from public.daily_meter_deltas dmd
    where dmd.station_id = mca.station_id
      and dmd.meter_id   = mca.meter_id
      and dmd.reading_date >= mca.period_start
      and dmd.reading_date <  case mca.period_type
            when 'day'   then mca.period_start + 1
            when 'week'  then mca.period_start + 7
            when 'month' then (mca.period_start + interval '1 month')::date
            else              (mca.period_start + interval '1 year')::date
          end)`;

const QUERIES = {
  monthYearRows: `select count(*)::int v from public.meter_consumption_aggregates
                   where period_type in ('month','year')`,
  monthTariffNgn: `select coalesce(round(sum(tariff_value_ngn),2),0)::text v
                     from public.meter_consumption_aggregates where period_type='month'`,
  monthKwh: `select coalesce(round(sum(kwh_total),1),0)::text v
               from public.meter_consumption_aggregates where period_type='month'`,
  byPeriod: `select period_type, count(*)::int n, coalesce(round(sum(tariff_value_ngn),2),0)::text ngn
               from public.meter_consumption_aggregates group by 1 order by 1`,
  unguardedExposure: `select mca.period_type, count(*)::int n,
                             coalesce(round(sum(mca.tariff_value_ngn),2),0)::text ngn
                        from public.meter_consumption_aggregates mca
                       where ${ORPHAN_PREDICATE}
                       group by 1 order by 1`,
  guardedExposure: `select count(*)::int v from public.meter_consumption_aggregates mca
                     where mca.period_start >= (current_date - interval '90 days')
                       and ${ORPHAN_PREDICATE}`,
  guardInstalled: `select proname,
                          (prosrc like '%current_date - interval ''90 days''%') has_guard
                     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname='public'
                      and proname in ('refresh_meter_reading_aggregates',
                                      'refresh_meter_reading_aggregates_for_station')
                    order by 1`,
  deltaWindow: `select min(reading_date)::text lo, max(reading_date)::text hi, count(*)::int n
                  from public.daily_meter_deltas`,
};

async function collect(client) {
  const out = { measuredAt: new Date().toISOString() };
  out.monthYearRows = (await client.query(QUERIES.monthYearRows)).rows[0].v;
  out.monthTariffNgn = (await client.query(QUERIES.monthTariffNgn)).rows[0].v;
  out.monthKwh = (await client.query(QUERIES.monthKwh)).rows[0].v;
  out.byPeriod = (await client.query(QUERIES.byPeriod)).rows;
  out.unguardedExposure = (await client.query(QUERIES.unguardedExposure)).rows;
  out.guardedExposure = (await client.query(QUERIES.guardedExposure)).rows[0].v;
  out.guardInstalled = (await client.query(QUERIES.guardInstalled)).rows;
  out.deltaWindow = (await client.query(QUERIES.deltaWindow)).rows[0];
  return out;
}

function render(g) {
  const guards = g.guardInstalled.map((r) => `${r.proname}=${r.has_guard}`).join("  ");
  console.log(`
GATE P1  (${g.measuredAt})

  guard installed        : ${guards}
  delta window           : ${g.deltaWindow.lo} .. ${g.deltaWindow.hi}  (${g.deltaWindow.n} rows)

  month+year rows        : ${g.monthYearRows}          <-- must not fall
  month tariff_value_ngn : NGN ${g.monthTariffNgn}     <-- must not fall
  month kwh_total        : ${g.monthKwh}

  aggregates by period:`);
  g.byPeriod.forEach((r) => console.log(`    ${r.period_type.padEnd(6)} ${String(r.n).padStart(8)}  NGN ${r.ngn}`));
  console.log(`
  orphan prune WITHOUT guard would delete:`);
  if (!g.unguardedExposure.length) console.log("    (none)");
  g.unguardedExposure.forEach((r) => console.log(`    ${r.period_type.padEnd(6)} ${String(r.n).padStart(8)}  NGN ${r.ngn}`));
  console.log(`
  orphan prune WITH guard would delete   : ${g.guardedExposure} rows`);
}

function compare(before, after) {
  const fails = [];
  if (after.monthYearRows < before.monthYearRows) {
    fails.push(`month+year rows fell ${before.monthYearRows} -> ${after.monthYearRows}`);
  }
  if (Number(after.monthTariffNgn) < Number(before.monthTariffNgn)) {
    fails.push(`month tariff fell NGN ${before.monthTariffNgn} -> ${after.monthTariffNgn}`);
  }
  console.log(`
COMPARISON
  month+year rows : ${before.monthYearRows} -> ${after.monthYearRows}
  month tariff    : NGN ${before.monthTariffNgn} -> NGN ${after.monthTariffNgn}

  ${fails.length === 0 ? "PASS — no rollup loss" : "FAIL"}`);
  fails.forEach((f) => console.log(`    - ${f}`));
  return fails.length === 0;
}

(async () => {
  const client = new Client({
    connectionString: connectionString(),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 900000,
  });
  await client.connect();
  await client.query("set statement_timeout='15min'");
  // Belt and braces: this tool must never write.
  await client.query("set default_transaction_read_only = on");

  const now = await collect(client);
  render(now);

  if (SAVE) {
    fs.mkdirSync(outDir, { recursive: true });
    const p = path.join(outDir, `gate-${SAVE}.json`);
    fs.writeFileSync(p, JSON.stringify(now, null, 2));
    console.log(`\n  saved -> ${p}`);
  }

  let ok = true;
  if (COMPARE) {
    const p = path.join(outDir, `gate-${COMPARE}.json`);
    if (!fs.existsSync(p)) throw new Error(`no saved snapshot at ${p}`);
    ok = compare(JSON.parse(fs.readFileSync(p, "utf8")), now);
  }

  await client.end();
  if (!ok) process.exit(1);
})().catch((e) => {
  console.error("gate-p1 failed:", e.message);
  process.exit(1);
});
