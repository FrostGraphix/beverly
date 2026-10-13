begin;
-- Align consumption retention to a 60-day window under the durable archive interlock.
create or replace function public.run_consumption_retention()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  aggregate_rows bigint := 0;
  delta_rows bigint := 0;
  reading_rows bigint := 0;
begin
  delete from public.meter_consumption_aggregates
  where period_type in ('day', 'week')
    and period_start < (current_date - interval '60 days');
  get diagnostics aggregate_rows = row_count;

  delete from public.daily_meter_deltas
  where reading_date < (current_date - interval '60 days');
  get diagnostics delta_rows = row_count;

  reading_rows := public.prune_archived_daily_meter_readings(
    (current_date - interval '60 days')::date,
    50000
  );

  return jsonb_build_object(
    'aggregateRows', aggregate_rows,
    'deltaRows', delta_rows,
    'readingRows', reading_rows,
    'hotReadingDays', 60,
    'completedAt', now()
  );
end;
$$;
revoke all on function public.run_consumption_retention() from public, anon, authenticated;
grant execute on function public.run_consumption_retention() to service_role;
notify pgrst, 'reload schema';
commit;
