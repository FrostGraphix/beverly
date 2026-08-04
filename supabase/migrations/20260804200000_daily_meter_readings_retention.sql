-- daily_meter_readings was the one table in the retention pipeline with no
-- row-level deletion at all -- only its (now-discarded) row_json column was ever
-- blanked. Every other growing table (daily_meter_deltas, day/week aggregates)
-- already has a real DELETE here. This adds the matching one for readings.
--
-- 12 months: month/year buckets in meter_consumption_aggregates already preserve
-- long-term totals regardless of this window, so this only bounds daily-granularity
-- drill-down history. Safe with respect to the new incremental refresh (20260804190000):
-- that function's watermark lives in meter_reading_refresh_watermarks, keyed off
-- daily_meter_readings.updated_at, not off row presence -- it never needs to re-read
-- readings older than whatever it already processed, so deleting them afterward
-- cannot break a future run.
--
-- One narrow, honestly-documented edge case: if a reading is corrected right at the
-- 12-month boundary after its immediately preceding day has already been deleted by
-- this retention, the refresh function's D-1 lookup finds nothing and treats that
-- one delta as 0 rather than the true historical value (the existing "previous_total1
-- is null -> 0" rule, unchanged from the original function). This did not exist
-- before because nothing was ever deleted from this table. Judged acceptable: it
-- requires a correction to already-12-month-old data, which is both rare and past
-- the point where month/year rollups are still expected to move.
select cron.alter_job(
  job_id := 18,
  command := $cmd$
    BEGIN;
        -- Keep monthly/yearly rollups, prune daily rollups older than 90 days
        DELETE FROM public.meter_consumption_aggregates
        WHERE period_type IN ('day', 'week') AND period_start < (CURRENT_DATE - INTERVAL '90 days');

        DELETE FROM public.daily_meter_deltas
        WHERE reading_date < (CURRENT_DATE - INTERVAL '90 days');

        -- Raw daily readings: keep 12 months of daily-granularity drill-down.
        DELETE FROM public.daily_meter_readings
        WHERE reading_date < (CURRENT_DATE - INTERVAL '12 months');

        -- Clear expired API cache and temporary snapshots
        DELETE FROM public.api_cache WHERE updated_at < NOW() - INTERVAL '1 day';
        DELETE FROM public.operational_snapshots WHERE captured_at < NOW() - INTERVAL '14 days';
    COMMIT;
  $cmd$
);
