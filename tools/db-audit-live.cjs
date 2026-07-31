"use strict";

const { Client } = require("pg");

const CONN = "postgresql://postgres.qpoipyqgrjsjdvfqmxok:Abdul$amad123@aws-1-eu-west-1.pooler.supabase.com:5432/postgres";

async function run() {
  const client = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("=== CONNECTED TO LIVE DB ===\n");

  async function q(label, sql) {
    try {
      const res = await client.query(sql);
      console.log(`--- ${label} ---`);
      console.log(JSON.stringify(res.rows, null, 2));
      console.log();
    } catch(e) {
      console.log(`--- ${label} [ERROR] ---`);
      console.log(e.message);
      console.log();
    }
  }

  // CLAIM 1: pg_database_size
  await q("CLAIM 1: pg_database_size", `
    SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size,
           pg_database_size(current_database()) AS db_size_bytes
  `);

  // CLAIM 3: Schema sizes
  await q("CLAIM 3: Size per schema", `
    SELECT nspname AS schema,
           pg_size_pretty(sum(pg_total_relation_size(c.oid))) AS total
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE nspname IN ('public','auth','storage','realtime')
    GROUP BY nspname ORDER BY sum(pg_total_relation_size(c.oid)) DESC
  `);

  // CLAIM 2: Top table sizes with row counts
  await q("CLAIM 2: Top table sizes (total / heap / indexes / toast)", `
    SELECT c.relname AS table,
           pg_size_pretty(pg_total_relation_size(c.oid))  AS total,
           pg_size_pretty(pg_relation_size(c.oid))        AS heap,
           pg_size_pretty(pg_indexes_size(c.oid))         AS indexes,
           pg_size_pretty(
             CASE WHEN c.reltoastrelid <> 0
                  THEN pg_total_relation_size(c.reltoastrelid)
                  ELSE 0 END
           ) AS toast
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 12
  `);

  // CLAIM 2: Row counts
  await q("CLAIM 2: Row counts on top tables", `
    SELECT 'meter_consumption_aggregates' tbl, count(*) n FROM public.meter_consumption_aggregates
    UNION ALL SELECT 'daily_meter_readings', count(*) FROM public.daily_meter_readings
    UNION ALL SELECT 'daily_meter_deltas', count(*) FROM public.daily_meter_deltas
    UNION ALL SELECT 'audit_logs', count(*) FROM public.audit_logs
    UNION ALL SELECT 'operational_snapshots', count(*) FROM public.operational_snapshots
    UNION ALL SELECT 'api_cache', count(*) FROM public.api_cache
    UNION ALL SELECT 'meters', count(*) FROM public.meters
    UNION ALL SELECT 'token_transactions', count(*) FROM public.token_transactions
    UNION ALL SELECT 'meter_events', count(*) FROM public.meter_events
    UNION ALL SELECT 'theft_signals', count(*) FROM public.theft_signals
  `);

  // CLAIM 4/5: Index definitions for meter_consumption_aggregates
  await q("CLAIMS 4 & 5: Index definitions for meter_consumption_aggregates", `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'meter_consumption_aggregates'
    ORDER BY indexname
  `);

  // CLAIM 6: Individual index sizes for meter_consumption_aggregates
  await q("CLAIM 6: Index sizes for meter_consumption_aggregates", `
    SELECT i.relname AS indexname,
           pg_size_pretty(pg_relation_size(i.oid)) AS size,
           pg_relation_size(i.oid) AS size_bytes
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public' AND t.relname = 'meter_consumption_aggregates'
    ORDER BY pg_relation_size(i.oid) DESC
  `);

  // CLAIM 7: Monthly ingestion
  await q("CLAIM 7: Monthly ingestion rates", `
    SELECT to_char(reading_date, 'YYYY-MM') AS month,
           count(*) AS readings,
           count(DISTINCT meter_id) AS distinct_meters
    FROM public.daily_meter_readings
    GROUP BY 1 ORDER BY 1
  `);

  // CLAIM 8: refresh function prosrc
  await q("CLAIM 8: refresh function prosrc excerpt", `
    SELECT left(prosrc, 500) AS prosrc_excerpt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND proname = 'refresh_meter_reading_aggregates_for_station'
  `);

  // CLAIM 10: Cron job details
  await q("CLAIM 10: Cron job 7 run details sample", `
    SELECT j.jobname, r.runid, r.start_time, r.end_time,
           extract(epoch FROM (r.end_time - r.start_time)) AS duration_s,
           r.status, left(r.return_message, 150) AS return_message
    FROM cron.job j JOIN cron.job_run_details r ON r.jobid = j.jobid
    WHERE j.jobname LIKE '%refresh%' OR j.jobid = 7
    ORDER BY r.start_time DESC LIMIT 10
  `);

  // CLAIM 12: Missing meters
  await q("CLAIM 12: Reporting meters missing from meters table", `
    SELECT
      count(DISTINCT r.meter_id) AS reporting_meters,
      count(DISTINCT m.meter_sn) AS in_meters_table,
      count(DISTINCT r.meter_id) - count(DISTINCT m.meter_sn) AS missing_count,
      round(100.0 * (count(DISTINCT r.meter_id) - count(DISTINCT m.meter_sn))
            / NULLIF(count(DISTINCT r.meter_id), 0), 1) AS missing_pct
    FROM public.daily_meter_readings r
    LEFT JOIN public.meters m ON m.meter_sn = r.meter_id
    WHERE r.reading_date >= current_date - 30
  `);

  // CLAIM 13: Last write dates
  await q("CLAIM 13: Reference tables last write dates", `
    SELECT 'meters' tbl, max(updated_at) AS last_updated, max(created_at) AS last_created FROM public.meters
    UNION ALL SELECT 'accounts', max(updated_at), max(created_at) FROM public.accounts
    UNION ALL SELECT 'sites', max(updated_at), max(created_at) FROM public.sites
    UNION ALL SELECT 'customers', max(updated_at), max(created_at) FROM public.customers
    UNION ALL SELECT 'token_transactions', max(updated_at), max(created_at) FROM public.token_transactions
  `);

  // CLAIM 18: Dedup collision check
  await q("CLAIM 18: Duplicate natural key occurrences in token_transactions", `
    SELECT meter_sn, transaction_ts, amount, count(*) AS occurrences
    FROM public.token_transactions
    GROUP BY meter_sn, transaction_ts, amount
    HAVING count(*) > 1
    ORDER BY occurrences DESC LIMIT 5
  `);

  // CLAIM 21: OEM raw payload field count sample
  await q("CLAIM 21: Fields in daily_meter_raw_duplicates", `
    SELECT count(*) AS total_rows,
           (SELECT count(*) FROM jsonb_object_keys(
              (SELECT row_json FROM public.daily_meter_raw_duplicates LIMIT 1)
           )) AS field_count_in_sample
    FROM public.daily_meter_raw_duplicates
  `);

  // CLAIM 21b: All distinct keys in raw duplicates
  await q("CLAIM 21b: All distinct keys in raw duplicates", `
    SELECT array_agg(DISTINCT key ORDER BY key) AS all_keys
    FROM public.daily_meter_raw_duplicates,
         lateral jsonb_object_keys(row_json) key
  `);

  // CLAIM 22: meter_events and theft_signals counts
  await q("CLAIM 22: Alarm/theft counts", `
    SELECT 'meter_events' tbl, count(*) n FROM public.meter_events
    UNION ALL SELECT 'theft_signals', count(*) FROM public.theft_signals
  `);

  // CLAIM 33: tariff history coverage
  await q("CLAIM 33: tariff_rate_history date range", `
    SELECT min(effective_from) AS min_eff, max(effective_from) AS max_eff, count(*) n
    FROM public.tariff_rate_history
  `);

  // CLAIM 35: wallet ledger count
  await q("CLAIM 35: wallet_ledger_entries count", `
    SELECT count(*) AS wallet_ledger_entries_count FROM public.wallet_ledger_entries
  `);

  // EXPLAIN check for CLAIM 5: See if backwards PK scan is planned or if _station_meter_idx is used
  await q("CLAIM 5 EXPLAIN test: station_id + meter_id + period_type query with period_start DESC", `
    EXPLAIN SELECT * FROM public.meter_consumption_aggregates
    WHERE station_id = 'TUNGA' AND period_type = 'month'
    ORDER BY period_start DESC
  `);

  await client.end();
  console.log("=== DONE ===");
}

run().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
