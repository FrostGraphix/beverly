"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const CONN = "postgresql://postgres.qpoipyqgrjsjdvfqmxok:Abdul$amad123@aws-1-eu-west-1.pooler.supabase.com:5432/postgres";

async function run() {
  const client = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("=== ROOT-LEVEL EMPIRICAL AUDIT STARTED ===\n");

  const results = {};

  async function execQuery(key, sql) {
    try {
      const res = await client.query(sql);
      results[key] = { success: true, rows: res.rows };
      console.log(`[OK] ${key}: ${res.rows.length} rows`);
    } catch (e) {
      results[key] = { success: false, error: e.message };
      console.log(`[ERR] ${key}: ${e.message}`);
    }
  }

  // 1. Database size
  await execQuery("db_size", `
    SELECT pg_size_pretty(pg_database_size(current_database())) AS pretty_size,
           pg_database_size(current_database()) AS bytes
  `);

  // 2. Schema size breakdown
  await execQuery("schema_sizes", `
    SELECT nspname AS schema_name,
           pg_size_pretty(sum(pg_total_relation_size(c.oid))) AS total_pretty,
           sum(pg_total_relation_size(c.oid)) AS total_bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    GROUP BY nspname
    ORDER BY sum(pg_total_relation_size(c.oid)) DESC
  `);

  // 3. Complete table inventory in public schema
  await execQuery("public_tables_full", `
    SELECT c.relname AS table_name,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total_pretty,
           pg_total_relation_size(c.oid) AS total_bytes,
           pg_size_pretty(pg_relation_size(c.oid)) AS heap_pretty,
           pg_relation_size(c.oid) AS heap_bytes,
           pg_size_pretty(pg_indexes_size(c.oid)) AS indexes_pretty,
           pg_indexes_size(c.oid) AS indexes_bytes,
           pg_size_pretty(CASE WHEN c.reltoastrelid <> 0 THEN pg_total_relation_size(c.reltoastrelid) ELSE 0 END) AS toast_pretty,
           CASE WHEN c.reltoastrelid <> 0 THEN pg_total_relation_size(c.reltoastrelid) ELSE 0 END AS toast_bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
  `);

  // 4. Exact row counts for ALL tables in public schema
  await execQuery("public_table_row_counts", `
    DO $$
    DECLARE
      r record;
      cnt bigint;
    BEGIN
      CREATE TEMP TABLE _tbl_counts (table_name text, row_count bigint) ON COMMIT DROP;
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('SELECT count(*) FROM public.%I', r.tablename) INTO cnt;
        INSERT INTO _tbl_counts VALUES (r.tablename, cnt);
      END LOOP;
    END $$;
    SELECT table_name, row_count FROM _tbl_counts ORDER BY row_count DESC;
  `);

  // 5. All indexes on public tables with definitions and sizes
  await execQuery("all_public_indexes", `
    SELECT tablename, indexname, indexdef,
           pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(indexname)::regclass)) AS size_pretty,
           pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(indexname)::regclass) AS size_bytes
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `);

  // 6. Ingestion timeline by month from daily_meter_readings
  await execQuery("ingestion_monthly_timeline", `
    SELECT to_char(reading_date, 'YYYY-MM') AS month,
           count(*) AS readings_count,
           count(DISTINCT meter_id) AS distinct_meters,
           count(DISTINCT station_id) AS distinct_stations,
           min(reading_date)::text AS min_date,
           max(reading_date)::text AS max_date
    FROM public.daily_meter_readings
    GROUP BY 1 ORDER BY 1
  `);

  // 7. Full source code of all stored procedures in public schema
  await execQuery("stored_procedures", `
    SELECT p.proname,
           pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname
  `);

  // 8. Cron jobs list
  await execQuery("cron_jobs", `
    SELECT jobid, schedule, command, nodename, nodeport, database, username, active, jobname
    FROM cron.job ORDER BY jobid
  `);

  // 9. Cron job execution history statistics
  await execQuery("cron_job_stats", `
    SELECT j.jobid, j.jobname,
           count(r.runid) AS total_runs,
           count(r.runid) FILTER (WHERE r.status = 'succeeded') AS succeeded_runs,
           count(r.runid) FILTER (WHERE r.status = 'failed') AS failed_runs,
           round(avg(extract(epoch FROM (r.end_time - r.start_time)))::numeric, 2) AS avg_duration_sec,
           round(max(extract(epoch FROM (r.end_time - r.start_time)))::numeric, 2) AS max_duration_sec,
           min(r.start_time)::text AS earliest_run,
           max(r.start_time)::text AS latest_run
    FROM cron.job j LEFT JOIN cron.job_run_details r ON r.jobid = j.jobid
    GROUP BY j.jobid, j.jobname ORDER BY j.jobid
  `);

  // 10. Recent cron job failures
  await execQuery("cron_job_recent_failures", `
    SELECT j.jobname, r.runid, r.start_time::text, r.end_time::text,
           extract(epoch FROM (r.end_time - r.start_time)) AS duration_sec,
           r.status, r.return_message
    FROM cron.job j JOIN cron.job_run_details r ON r.jobid = j.jobid
    WHERE r.status = 'failed'
    ORDER BY r.start_time DESC LIMIT 20
  `);

  // 11. Audit logs timeline and payload size analysis
  await execQuery("audit_logs_analysis", `
    SELECT min(created_at)::text AS earliest_row,
           max(created_at)::text AS latest_row,
           count(*) AS total_rows,
           count(*) FILTER (WHERE created_at < '2026-07-12') AS rows_before_jul12,
           count(*) FILTER (WHERE created_at >= '2026-07-12') AS rows_after_jul12,
           count(*) FILTER (WHERE detail IS NOT NULL) AS rows_with_detail,
           count(*) FILTER (WHERE metadata IS NOT NULL) AS rows_with_metadata,
           round(avg(length(detail::text))) AS avg_detail_bytes,
           max(length(detail::text)) AS max_detail_bytes
    FROM public.audit_logs
  `);

  // 12. Audit logs breakdown by action
  await execQuery("audit_logs_by_action", `
    SELECT action,
           count(*) AS row_count,
           round(sum(length(detail::text)) / 1024.0 / 1024.0, 2) AS total_detail_mb
    FROM public.audit_logs
    GROUP BY action ORDER BY count(*) DESC
  `);

  // 13. Reference data cross-check (§6A)
  await execQuery("reference_data_crosscheck", `
    WITH active_meters AS (
      SELECT DISTINCT meter_id
      FROM public.daily_meter_readings
      WHERE reading_date >= current_date - 30
    )
    SELECT
      (SELECT count(*) FROM active_meters) AS reporting_meters_30d,
      (SELECT count(*) FROM public.meters) AS meters_table_total,
      (SELECT count(*) FROM active_meters am JOIN public.meters m ON m.meter_sn = am.meter_id) AS reporting_in_meters_table,
      (SELECT count(*) FROM active_meters am LEFT JOIN public.meters m ON m.meter_sn = am.meter_id WHERE m.meter_sn IS NULL) AS reporting_missing_from_meters_table,
      (SELECT count(*) FROM public.accounts) AS accounts_table_total,
      (SELECT count(*) FROM public.customers) AS customers_table_total,
      (SELECT count(*) FROM public.sites) AS sites_table_total
  `);

  // 14. Reference tables timestamp inspection
  await execQuery("reference_tables_timestamps", `
    SELECT 'meters' AS table_name,
           min(created_at)::text AS min_created, max(created_at)::text AS max_created
    FROM public.meters
    UNION ALL
    SELECT 'accounts', min(created_at)::text, max(created_at)::text FROM public.accounts
    UNION ALL
    SELECT 'sites', min(created_at)::text, max(created_at)::text FROM public.sites
    UNION ALL
    SELECT 'customers', min(created_at)::text, max(created_at)::text FROM public.customers
    UNION ALL
    SELECT 'token_transactions', min(created_at)::text, max(created_at)::text FROM public.token_transactions
    UNION ALL
    SELECT 'daily_meter_readings', min(captured_at)::text, max(captured_at)::text FROM public.daily_meter_readings
  `);

  // 15. Raw duplicate payload keys breakdown
  await execQuery("raw_duplicate_keys", `
    SELECT key, count(*) AS occurrence_count
    FROM public.daily_meter_raw_duplicates,
         lateral jsonb_object_keys(row_json) key
    GROUP BY key ORDER BY key
  `);

  // 16. Alarm and theft tables state
  await execQuery("alarm_tables_state", `
    SELECT 'meter_events' AS tbl, count(*) AS row_count FROM public.meter_events
    UNION ALL SELECT 'theft_signals', count(*) FROM public.theft_signals
    UNION ALL SELECT 'fraud_assessments', count(*) FROM public.fraud_assessments
    UNION ALL SELECT 'fraud_signals', count(*) FROM public.fraud_signals
    UNION ALL SELECT 'gateway_health_incidents', count(*) FROM public.gateway_health_incidents
  `);

  // 17. Tariff rate history vs Account tariff history date ranges
  await execQuery("tariff_date_ranges", `
    SELECT 'tariff_rate_history' AS tbl,
           tariff_id,
           station_scope,
           effective_from::text,
           effective_price_ngn,
           is_valid
    FROM public.tariff_rate_history
    ORDER BY tariff_id, effective_from
  `);

  await execQuery("account_tariff_history_summary", `
    SELECT min(effective_from)::text AS min_effective_from,
           max(effective_from)::text AS max_effective_from,
           count(*) AS total_rows,
           count(DISTINCT meter_id) AS distinct_meters,
           count(DISTINCT tariff_id) AS distinct_tariffs
    FROM public.account_tariff_history
  `);

  // 18. EXPLAIN plan checks
  await execQuery("explain_agg_order_by_desc", `
    EXPLAIN (FORMAT JSON, COSTS, BUFFERS)
    SELECT * FROM public.meter_consumption_aggregates
    WHERE station_id = 'TUNGA' AND period_type = 'month'
    ORDER BY period_start DESC
  `);

  await execQuery("explain_readings_meter_date_desc", `
    EXPLAIN (FORMAT JSON, COSTS, BUFFERS)
    SELECT * FROM public.daily_meter_readings
    WHERE station_id = 'TUNGA' AND meter_id = '47005345161'
    ORDER BY reading_date DESC
  `);

  await client.end();

  const outPath = path.join(__dirname, "..", "tmp", "root-audit-results.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n=== ALL EMPIRICAL DATA SAVED TO ${outPath} ===`);
}

run().catch((e) => {
  console.error("FATAL ERROR IN ROOT AUDIT:", e);
  process.exit(1);
});
