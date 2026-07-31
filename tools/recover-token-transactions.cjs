"use strict";

/**
 * Recover token transactions stranded in log tables.
 *
 * `token_transactions` stopped ingesting on 2026-04-10, but the upstream
 * responses kept flowing into three log/cache tables that store whole payloads:
 *
 *   - audit_logs.detail->'payments'          (and the duplicate in .metadata)
 *   - operational_snapshots.payload_json     (both response shapes)
 *   - api_cache.response_json->'payments'
 *
 * Those payloads are scheduled for deletion by the storage remediation work.
 * This tool extracts the vending records first so nothing is lost.
 *
 * Two upstream response shapes exist, and BOTH are recovered:
 *
 *   SHAPE B  /api/token/creditTokenRecord/read      -> { data: { data: [...] } }
 *     { receiptId, meterId, stationId, totalPaid, totalUnit, tariffId,
 *       createDate, token, customerId, customerName, ... }
 *     PRIMARY SOURCE. Paginated full history: 16,828 unique receipts, every
 *     one carrying its station and its token PIN. `receiptId` is a stable
 *     upstream identifier, so identity never depends on the timestamp.
 *
 *   SHAPE A  /api/token/creditTokenRecord/readMore  -> { payments: [...] }
 *     { amount, meterId, currency, timestamp, transactionId,
 *       transactionKwh, transactionType, customerId, serialNumber }
 *     SUPPLEMENT. A rolling recent window (~3,300 records per call, ~100/day
 *     of genuinely distinct transactions), carrying no station. Used only for
 *     transactions Shape B does not already cover.
 *
 * Timestamp handling: `createDate` was initially assumed to be naive local
 * time. Measured against overlapping records it is UTC — offset 0 for 4,969
 * of ~5,000 matches against existing token_transactions rows, and for 650,265
 * comparisons against Shape A's explicit-Z timestamps. It is therefore read
 * as UTC directly.
 *
 * Dedup: the table's own natural key (meter_sn, transaction_ts, amount),
 * applied across both shapes, with Shape B winning ties because it carries
 * more fields.
 *
 * Usage:
 *   node tools/recover-token-transactions.cjs              # dry run, writes report
 *   node tools/recover-token-transactions.cjs --commit     # insert
 *   node tools/recover-token-transactions.cjs --commit --source-tag recovered-2026-07-29
 *
 * Recovered rows carry source='recovered' (or --source-tag), so the whole
 * operation is reversible with a single delete on that tag.
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const SOURCE_TAG = (() => {
  const i = args.indexOf("--source-tag");
  return i >= 0 && args[i + 1] ? args[i + 1] : "recovered";
})();

const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "tmp");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

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

/**
 * Build the candidate set from every log source that carries a Shape A payload.
 * Deduplicated on the natural key the table already enforces:
 * (meter_sn, transaction_ts, amount).
 *
 * Station is not present in Shape A, so it is resolved from `meters` first
 * (authoritative) and from the most recent reading second (fallback).
 */
const BUILD_CANDIDATES = `
create temp table tt_candidates on commit drop as
with shape_b as (
  -- PRIMARY: paginated full history, carries station + token + receiptId.
  select distinct on (rec->>'receiptId')
    'snapshot_read'                                            as origin,
    nullif(trim(rec->>'meterId'), '')                          as meter_sn,
    ((rec->>'createDate')::timestamp at time zone 'UTC')       as transaction_ts,
    round((rec->>'totalPaid')::numeric, 2)                     as amount,
    coalesce((rec->>'totalUnit')::numeric, 0)                  as kwh,
    nullif(trim(rec->>'tariffId'), '')                         as tariff_rate,
    nullif(trim(rec->>'receiptId'), '')                        as upstream_transaction_id,
    nullif(nullif(trim(rec->>'customerId'), ''), 'N/A')        as upstream_customer_id,
    upper(nullif(trim(rec->>'stationId'), ''))                 as declared_station,
    rec                                                        as rec
  from public.operational_snapshots s,
       lateral jsonb_array_elements(s.payload_json->'data'->'data') rec
  where jsonb_typeof(s.payload_json->'data'->'data') = 'array'
    and rec ? 'receiptId'
    and rec ? 'meterId'
    and rec ? 'createDate'
    and jsonb_typeof(rec->'totalPaid') = 'number'
  order by rec->>'receiptId'
),
shape_a_raw as (
  select 'audit_detail' as origin, p as rec
    from public.audit_logs a,
         lateral jsonb_array_elements(a.detail->'payments') p
   where jsonb_typeof(a.detail->'payments') = 'array'
  union all
  select 'audit_metadata', p
    from public.audit_logs a,
         lateral jsonb_array_elements(a.metadata->'payments') p
   where jsonb_typeof(a.metadata->'payments') = 'array'
  union all
  select 'snapshot_more', p
    from public.operational_snapshots s,
         lateral jsonb_array_elements(s.payload_json->'payments') p
   where jsonb_typeof(s.payload_json->'payments') = 'array'
  union all
  select 'api_cache', p
    from public.api_cache c,
         lateral jsonb_array_elements(c.response_json->'payments') p
   where jsonb_typeof(c.response_json->'payments') = 'array'
),
shape_a as (
  select
    origin,
    nullif(trim(rec->>'meterId'), '')                          as meter_sn,
    (rec->>'timestamp')::timestamptz                           as transaction_ts,
    round((rec->>'amount')::numeric, 2)                        as amount,
    coalesce((rec->>'transactionKwh')::numeric, 0)             as kwh,
    nullif(trim(rec->>'transactionType'), '')                  as tariff_rate,
    nullif(trim(rec->>'transactionId'), '')                    as upstream_transaction_id,
    nullif(nullif(trim(rec->>'customerId'), ''), 'N/A')        as upstream_customer_id,
    null::text                                                 as declared_station,
    rec                                                        as rec
  from shape_a_raw
  where rec ? 'meterId'
    and rec ? 'timestamp'
    and rec ? 'amount'
    and jsonb_typeof(rec->'amount') = 'number'
),
typed as (
  select * from shape_b
  union all
  select * from shape_a
),
meter_site as (
  select distinct on (m.meter_sn)
         m.meter_sn, m.site_id, m.site_code
    from public.meters m
   where m.meter_sn is not null
     and m.site_code is not null
   order by m.meter_sn
),
reading_site as (
  select distinct on (r.meter_id)
         r.meter_id as meter_sn, s.name as site_id, s.code as site_code
    from public.daily_meter_readings r
    join public.sites s on upper(s.code) = upper(r.station_id)
   order by r.meter_id, r.reading_date desc
)
select distinct on (t.meter_sn, t.transaction_ts, t.amount)
  t.meter_sn,
  t.transaction_ts,
  t.amount,
  t.kwh,
  t.tariff_rate,
  t.upstream_transaction_id,
  t.upstream_customer_id,
  -- Shape B declares its own station; Shape A must be resolved from the meter.
  coalesce(ds.name, ms.site_id,   rs.site_id)   as site_id,
  coalesce(ds.code, ms.site_code, rs.site_code) as site_code,
  t.origin,
  t.rec
from typed t
left join public.sites ds on upper(ds.code) = t.declared_station
left join meter_site   ms on ms.meter_sn = t.meter_sn
left join reading_site rs on rs.meter_sn = t.meter_sn
where t.meter_sn is not null
  and t.transaction_ts is not null
order by t.meter_sn, t.transaction_ts, t.amount,
         -- Shape B wins ties: it carries station, tariff and token.
         case t.origin
           when 'snapshot_read'  then 1
           when 'audit_detail'   then 2
           when 'api_cache'      then 3
           when 'snapshot_more'  then 4
           when 'audit_metadata' then 5
         end;
`;

const INSERT_RECOVERED = `
insert into public.token_transactions (
  meter_sn, site_id, site_code, amount, kwh, tariff_rate,
  transaction_ts, transaction_at, upstream_transaction_id,
  source, raw_payload, ingested_at
)
select
  c.meter_sn, c.site_id, c.site_code, c.amount, c.kwh, c.tariff_rate,
  c.transaction_ts, c.transaction_ts, c.upstream_transaction_id,
  $1, c.rec, now()
from tt_candidates c
where c.site_id is not null
  and c.site_code is not null
on conflict (meter_sn, transaction_ts, amount) do nothing;
`;

async function run() {
  const client = new Client({
    connectionString: connectionString(),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 600000,
  });
  await client.connect();
  // Shape A carries ~720k payment elements across its source rows; the
  // deduplicating scan legitimately exceeds the default statement timeout.
  await client.query("set statement_timeout = '30min'");
  console.log(`mode: ${COMMIT ? "COMMIT" : "DRY RUN"}   source tag: ${SOURCE_TAG}\n`);

  await client.query("begin");
  try {
    const before = await client.query(
      `select count(*) n, min(transaction_ts)::text a, max(transaction_ts)::text b
         from public.token_transactions`
    );
    console.log(
      `token_transactions before: ${before.rows[0].n} rows, ${before.rows[0].a} .. ${before.rows[0].b}`
    );

    console.log("\nbuilding candidate set...");
    await client.query(BUILD_CANDIDATES);

    const summary = await client.query(`
      select
        count(*)                                                   as candidates,
        count(*) filter (where site_id is null)                    as unresolved_site,
        count(distinct meter_sn)                                   as meters,
        min(transaction_ts)::text                                  as earliest,
        max(transaction_ts)::text                                  as latest,
        round(sum(amount), 2)                                      as total_amount,
        round(sum(kwh), 2)                                         as total_kwh
      from tt_candidates
    `);
    const s = summary.rows[0];
    console.log(`
  candidates (deduplicated) : ${s.candidates}
  distinct meters           : ${s.meters}
  date range                : ${s.earliest} .. ${s.latest}
  total amount              : ${s.total_amount}
  total kWh                 : ${s.total_kwh}
  unresolved station        : ${s.unresolved_site}`);

    const byOrigin = await client.query(
      `select origin, count(*) n from tt_candidates group by 1 order by 2 desc`
    );
    console.log("\n  winning source per record:");
    byOrigin.rows.forEach((r) => console.log(`    ${r.origin.padEnd(16)} ${r.n}`));

    const newRows = await client.query(`
      select count(*) n
        from tt_candidates c
       where c.site_id is not null
         and not exists (
           select 1 from public.token_transactions t
            where t.meter_sn = c.meter_sn
              and t.transaction_ts = c.transaction_ts
              and t.amount = c.amount
         )
    `);
    console.log(`\n  NEW rows that would be inserted: ${newRows.rows[0].n}`);

    const gap = await client.query(`
      select to_char(transaction_ts, 'YYYY-MM') m, count(*) n, round(sum(amount),2) amount
        from tt_candidates
       where site_id is not null
         and not exists (
           select 1 from public.token_transactions t
            where t.meter_sn = tt_candidates.meter_sn
              and t.transaction_ts = tt_candidates.transaction_ts
              and t.amount = tt_candidates.amount
         )
       group by 1 order by 1
    `);
    console.log("\n  recovered coverage by month:");
    gap.rows.forEach((r) =>
      console.log(`    ${r.m}   ${String(r.n).padStart(6)} tx   ${r.amount}`)
    );

    // Token PINs recovered alongside the transactions. A token is a bearer
    // credential for electricity, so this count is reported explicitly.
    const tokens = await client.query(`
      select count(*) filter (where coalesce(rec->>'token', '') <> '') with_token,
             count(*) total
        from tt_candidates
    `);
    console.log(
      `\n  records carrying a token PIN: ${tokens.rows[0].with_token} of ${tokens.rows[0].total}`
    );

    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const unresolved = await client.query(`
      select meter_sn, count(*) n, min(transaction_ts)::text a, max(transaction_ts)::text b
        from tt_candidates where site_id is null group by 1 order by 2 desc
    `);
    if (unresolved.rows.length) {
      const p = path.join(reportDir, `token-recovery-unresolved-${stamp}.json`);
      fs.writeFileSync(p, JSON.stringify(unresolved.rows, null, 2));
      console.log(`\n  unresolved-station meters written to ${p}`);
    }

    // Full candidate set to disk, streamed in pages: this is the audit trail
    // for what was recovered, and the fallback if the insert is ever reverted.
    {
      const p = path.join(reportDir, `token-recovery-candidates-${stamp}.ndjson`);
      const sink = fs.createWriteStream(p);
      const PAGE = 5000;
      let offset = 0;
      let written = 0;
      for (;;) {
        const page = await client.query(
          `select meter_sn, transaction_ts, amount, kwh, tariff_rate,
                  upstream_transaction_id, site_id, site_code, origin, rec
             from tt_candidates
            order by meter_sn, transaction_ts, amount
            offset $1 limit $2`,
          [offset, PAGE]
        );
        if (!page.rows.length) break;
        for (const row of page.rows) sink.write(`${JSON.stringify(row)}\n`);
        written += page.rows.length;
        offset += PAGE;
      }
      await new Promise((resolve) => sink.end(resolve));
      console.log(`  candidate set exported to ${p} (${written} records)`);
    }

    if (!COMMIT) {
      await client.query("rollback");
      console.log("\nDRY RUN -- rolled back, nothing written.");
      console.log("Re-run with --commit to insert.");
      return;
    }

    console.log("\ninserting...");
    const inserted = await client.query(INSERT_RECOVERED, [SOURCE_TAG]);
    await client.query("commit");

    const after = await client.query(
      `select count(*) n, min(transaction_ts)::text a, max(transaction_ts)::text b
         from public.token_transactions`
    );
    console.log(`
  inserted                 : ${inserted.rowCount}
  token_transactions after : ${after.rows[0].n} rows, ${after.rows[0].a} .. ${after.rows[0].b}

Reversible with:
  delete from public.token_transactions where source = '${SOURCE_TAG}';`);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("recovery failed:", error.message);
  process.exit(1);
});
