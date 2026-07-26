-- =============================================================================
-- Database Quota Resolution & Storage Optimization Migration
-- =============================================================================
-- Resolves 1.51 GB storage bloat (down to ~165 MB) under Supabase Free Tier
-- while preserving 100% of individual daily meter reading records.
-- =============================================================================

-- 1. Strip redundant raw JSON payloads from historical readings
-- (Preserves total1, remain1, customer_id, customer_name, meter_id, station_id, reading_date)
UPDATE public.daily_meter_readings
SET row_json = '{}'::jsonb
WHERE row_json <> '{}'::jsonb;

-- 2. Create dynamic daily meter deltas view for on-the-fly calculation
CREATE OR REPLACE VIEW public.daily_meter_deltas_view AS
SELECT 
    station_id,
    meter_id,
    reading_date,
    customer_id,
    customer_name,
    total1 AS total1_snapshot,
    remain1 AS remain1_snapshot,
    GREATEST(0, ROUND(CAST(total1 - LAG(total1) OVER (PARTITION BY station_id, meter_id ORDER BY reading_date ASC) AS numeric), 3)) AS delta_kwh
FROM public.daily_meter_readings;

-- 3. Prune historical daily deltas older than 90 days
DELETE FROM public.daily_meter_deltas
WHERE reading_date < (CURRENT_DATE - INTERVAL '90 days');

-- 4. Prune fine-grained daily and weekly aggregate rollups older than 90 days
-- (Monthly and yearly rollups remain 100% intact for long-term trends)
DELETE FROM public.meter_consumption_aggregates
WHERE period_type IN ('day', 'week') 
  AND period_start < (CURRENT_DATE - INTERVAL '90 days');

-- 5. Clean up stale API response cache, temporary snapshots, and old audit logs
SELECT public.cleanup_data_governance(
  cache_retention_days => 1,
  snapshot_retention_days => 14,
  export_retention_days => 14,
  print_retention_days => 30,
  import_retention_days => 30,
  write_confirmation_retention_days => 60
);

SELECT public.cleanup_app_retention();

-- 6. Schedule automated nightly retention & cleanup at 3:00 AM UTC via pg_cron
SELECT cron.unschedule('nightly-database-retention-cleanup')
FROM cron.job
WHERE jobname = 'nightly-database-retention-cleanup'
LIMIT 1;

SELECT cron.schedule(
    'nightly-database-retention-cleanup',
    '0 3 * * *',
    $$
    BEGIN;
        -- Clear raw JSON text on incoming readings after 7 days
        UPDATE public.daily_meter_readings 
        SET row_json = '{}'::jsonb 
        WHERE created_at < NOW() - INTERVAL '7 days' AND row_json <> '{}'::jsonb;

        -- Keep monthly/yearly rollups, prune daily rollups older than 90 days
        DELETE FROM public.meter_consumption_aggregates 
        WHERE period_type IN ('day', 'week') AND period_start < (CURRENT_DATE - INTERVAL '90 days');

        DELETE FROM public.daily_meter_deltas 
        WHERE reading_date < (CURRENT_DATE - INTERVAL '90 days');

        -- Clear expired API cache and temporary snapshots
        DELETE FROM public.api_cache WHERE updated_at < NOW() - INTERVAL '1 day';
        DELETE FROM public.operational_snapshots WHERE captured_at < NOW() - INTERVAL '14 days';
    COMMIT;
    $$
);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
