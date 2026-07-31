"use strict";

const { Client } = require("pg");

const CONN = "postgresql://postgres.qpoipyqgrjsjdvfqmxok:Abdul$amad123@aws-1-eu-west-1.pooler.supabase.com:5432/postgres";

async function run() {
  const client = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("=== DEEP AUDIT PASS 2 ===\n");

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

  // 1. Check all views in public schema and their definitions to see which ones join readings -> meters -> customers (Claim 15)
  await q("VIEWS: All public views joining readings/meters/customers", `
    SELECT viewname,
           (definition LIKE '%meters%') AS mentions_meters,
           (definition LIKE '%customers%') AS mentions_customers,
           (definition LIKE '%daily_meter_readings%') AS mentions_readings
    FROM pg_views
    WHERE schemaname = 'public'
  `);

  // 2. Check materialized views in public schema
  await q("VIEWS: Materialized views in public schema", `
    SELECT matviewname, definition
    FROM pg_matviews
    WHERE schemaname = 'public'
  `);

  // 3. Inspect all RLS policies on key tables (meters, daily_meter_readings, customers, etc.)
  await q("RLS POLICIES: RLS status and policy counts per table", `
    SELECT c.relname AS tablename,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced,
           count(p.polname) AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_policy p ON p.polrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
    ORDER BY count(p.polname) DESC, c.relname ASC
    LIMIT 25
  `);

  // 4. Sample RLS policies on telemetry vs wallet tables
  await q("RLS SAMPLE: Policies on daily_meter_readings, meters, customers, token_transactions", `
    SELECT tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('daily_meter_readings', 'meters', 'customers', 'token_transactions', 'meter_consumption_aggregates')
  `);

  // 5. Unexamined tables or bloat sources: Check table sizes 13-30
  await q("TABLES 13-30: Next tier of table sizes", `
    SELECT c.relname AS table,
           pg_size_pretty(pg_total_relation_size(c.oid))  AS total,
           pg_size_pretty(pg_relation_size(c.oid))        AS heap,
           pg_size_pretty(pg_indexes_size(c.oid))         AS indexes
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    OFFSET 12 LIMIT 20
  `);

  // 6. Security Audit: Check for plaintext secrets/tokens in audit_logs, operational_snapshots, api_cache
  await q("SECURITY: Search for plaintext secrets/keys/passwords in audit_logs", `
    SELECT action, resource, outcome, count(*) AS count
    FROM public.audit_logs
    WHERE detail::text LIKE '%password%'
       OR detail::text LIKE '%secret%'
       OR detail::text LIKE '%token%'
       OR detail::text LIKE '%bearer%'
    GROUP BY action, resource, outcome
    LIMIT 10
  `);

  // 7. Check cron jobs detail
  await q("CRON JOBS: Complete cron.job table", `
    SELECT jobid, schedule, command, nodename, nodeport, database, username, active, jobname
    FROM cron.job
  `);

  // 8. Check schema migrations history to confirm 2026-07-12 to 2026-07-22 cluster
  await q("MIGRATIONS: Supabase schema_migrations history", `
    SELECT version, inserted_at
    FROM supabase_migrations.schema_migrations
    ORDER BY version DESC
    LIMIT 20
  `);

  // 9. Check tariff history coverage details: check minimum and maximum dates per tariff_id
  await q("TARIFF COVERAGE: Min/Max effective date per tariff_id in tariff_rate_history", `
    SELECT tariff_id, station_scope, min(effective_from) AS min_date, max(effective_from) AS max_date, count(*) AS records
    FROM public.tariff_rate_history
    GROUP BY tariff_id, station_scope
  `);

  // 10. Check account_tariff_history date ranges
  await q("ACCOUNT TARIFF HISTORY: Date range of meter bindings", `
    SELECT min(effective_from) AS min_eff, max(effective_from) AS max_eff, count(*) AS total_rows, count(DISTINCT meter_id) AS meters_covered
    FROM public.account_tariff_history
  `);

  await client.end();
  console.log("=== DONE DEEP AUDIT PASS 2 ===");
}

run().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
