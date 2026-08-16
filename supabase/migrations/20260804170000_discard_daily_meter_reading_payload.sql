-- Stop persisting the raw OEM payload in daily_meter_readings.row_json.
--
-- Nothing reads this column: consumption-store.js's read path was already
-- switched to reconstruct rows from the scalar columns (total1/remain1/etc),
-- and the nightly retention job's blank-after-7-days step reclaimed 0 bytes
-- because the JSON values are inline heap (below the ~2kB TOAST threshold),
-- not TOAST -- plain VACUUM cannot return that space regardless of blanking.
--
-- A trigger (not a DROP COLUMN) is used here deliberately: the currently
-- deployed ingestion code still builds and sends a full row_json payload on
-- every insert. Dropping the column before that code is redeployed would
-- make every live ingestion write fail with 42703 (undefined column). The
-- trigger neutralizes the payload at write time regardless of which code
-- version is live, so it is safe to apply immediately. DROP COLUMN is
-- deferred to the already-planned VACUUM FULL pass on this table, once the
-- code change (which stops sending row_json entirely) has been deployed.
create or replace function public.discard_daily_meter_reading_payload()
returns trigger
language plpgsql
as $$
begin
  new.row_json := '{}'::jsonb;
  return new;
end;
$$;

drop trigger if exists discard_row_json on public.daily_meter_readings;
create trigger discard_row_json
before insert or update on public.daily_meter_readings
for each row execute function public.discard_daily_meter_reading_payload();

-- The nightly retention job's row_json blanking step is now permanently
-- redundant (the trigger already guarantees '{}' on every row) -- remove it
-- from cron job 18 so the job doesn't carry a dead statement.
select cron.alter_job(
  job_id := 18,
  command := $cmd$
    BEGIN;
        -- Keep monthly/yearly rollups, prune daily rollups older than 90 days
        DELETE FROM public.meter_consumption_aggregates
        WHERE period_type IN ('day', 'week') AND period_start < (CURRENT_DATE - INTERVAL '90 days');

        DELETE FROM public.daily_meter_deltas
        WHERE reading_date < (CURRENT_DATE - INTERVAL '90 days');

        -- Clear expired API cache and temporary snapshots
        DELETE FROM public.api_cache WHERE updated_at < NOW() - INTERVAL '1 day';
        DELETE FROM public.operational_snapshots WHERE captured_at < NOW() - INTERVAL '14 days';
    COMMIT;
  $cmd$
);
