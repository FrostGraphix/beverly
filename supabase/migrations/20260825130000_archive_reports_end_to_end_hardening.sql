-- Align the committed archive schema with the running archive service.
-- The archive catalogue is backend-only; clients receive station-scoped rows through
-- api/reference.js and short-lived signed URLs for the private Storage bucket.

alter table public.archive_reports
  add column if not exists oem_id uuid references public.oem_manufacturers(id);

update public.archive_reports as report
set oem_id = coalesce(
  (
    select mapping.oem_id
    from public.oem_station_mappings as mapping
    where upper(mapping.station_id) = upper(report.station_id)
    order by mapping.created_at asc
    limit 1
  ),
  (
    select manufacturer.id
    from public.oem_manufacturers as manufacturer
    order by manufacturer.is_seed_default desc, manufacturer.created_at asc
    limit 1
  )
)
where report.oem_id is null;

alter table public.archive_reports drop constraint if exists archive_reports_type_check;
alter table public.archive_reports
  add constraint archive_reports_type_check
  check (report_type in ('readings', 'payments'));

alter table public.archive_reports drop constraint if exists archive_reports_granularity_check;
alter table public.archive_reports
  add constraint archive_reports_granularity_check
  check (granularity in ('monthly', 'yearly'));

alter table public.archive_reports drop constraint if exists archive_reports_partition_key;
alter table public.archive_reports
  add constraint archive_reports_partition_key
  unique (oem_id, station_id, report_type, granularity, period_start);

do $migration$
begin
  if not exists (select 1 from public.archive_reports where oem_id is null) then
    alter table public.archive_reports alter column oem_id set not null;
  end if;
end
$migration$;

create index if not exists archive_reports_station_period_idx
  on public.archive_reports (station_id, period_start desc);
create index if not exists archive_reports_catalogue_idx
  on public.archive_reports (report_type, granularity, period_start desc);

-- Partition discovery happens in Postgres so work scales with partitions rather than
-- raw row count. Both functions are service-role-only.
create or replace function public.archive_candidate_partitions(p_boundary date)
returns table(station_id text, period_start date)
language sql
stable
security definer
set search_path = public
as $$
  select readings.station_id, date_trunc('month', readings.reading_date)::date
  from public.daily_meter_readings as readings
  where readings.reading_date <= p_boundary
  group by readings.station_id, date_trunc('month', readings.reading_date)::date
  order by date_trunc('month', readings.reading_date)::date, readings.station_id;
$$;

create or replace function public.archive_payment_partitions(p_boundary date)
returns table(station_id text, period_start date)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if to_regclass('public.token_transactions') is null then
    return;
  end if;
  return query execute
    'select upper(site_code)::text, date_trunc(''month'', transaction_at)::date
       from public.token_transactions
      where transaction_at < ($1::date + interval ''1 day'')
        and nullif(trim(site_code), '''') is not null
      group by upper(site_code), date_trunc(''month'', transaction_at)::date
      order by date_trunc(''month'', transaction_at)::date, upper(site_code)'
    using p_boundary;
end;
$$;

-- Exact summary aggregation avoids PostgREST's row ceiling and counts monthly source
-- rows separately from yearly convenience bundles.
create or replace function public.archive_reports_summary(p_station_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select report.*
    from public.archive_reports as report
    where p_station_id is null or upper(report.station_id) = upper(p_station_id)
  ),
  station_counts as (
    select coalesce(jsonb_object_agg(station_id, item_count), '{}'::jsonb) as value
    from (select station_id, count(*) as item_count from filtered group by station_id) grouped
  ),
  type_counts as (
    select coalesce(jsonb_object_agg(report_type, item_count), '{}'::jsonb) as value
    from (select report_type, count(*) as item_count from filtered group by report_type) grouped
  ),
  grain_counts as (
    select coalesce(jsonb_object_agg(granularity, item_count), '{}'::jsonb) as value
    from (select granularity, count(*) as item_count from filtered group by granularity) grouped
  ),
  oem_counts as (
    select coalesce(jsonb_object_agg(coalesce(manufacturer.slug, 'unmapped'), item_count), '{}'::jsonb) as value
    from (
      select oem_id, count(*) as item_count
      from filtered
      group by oem_id
    ) grouped
    left join public.oem_manufacturers as manufacturer on manufacturer.id = grouped.oem_id
  )
  select jsonb_build_object(
    'totalReports', count(*),
    'totalRows', coalesce(sum(row_count) filter (where granularity = 'monthly'), 0),
    'totalBundleRows', coalesce(sum(row_count), 0),
    'totalSizeMb', round(coalesce(sum(byte_size), 0)::numeric / 1048576, 2),
    'storageQuotaMb', 1024,
    'byStation', (select value from station_counts),
    'byType', (select value from type_counts),
    'byGranularity', (select value from grain_counts),
    'byOem', (select value from oem_counts),
    'dateRange', jsonb_build_object('earliest', min(period_start), 'latest', max(period_start))
  )
  from filtered;
$$;

-- Retention can remove only readings whose exact station-month has a non-empty,
-- checksummed archive record covering that reading date. The bounded batch prevents a
-- long lock/WAL spike and allows the nightly job to resume safely on the next run.
create or replace function public.prune_archived_daily_meter_readings(
  p_before date default (current_date - interval '120 days')::date,
  p_batch_size integer default 10000
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count bigint := 0;
begin
  with candidates as (
    select readings.ctid
    from public.daily_meter_readings as readings
    where readings.reading_date < p_before
      and exists (
        select 1
        from public.archive_reports as report
        where report.station_id = readings.station_id
          and report.report_type = 'readings'
          and report.granularity = 'monthly'
          and report.period_start = date_trunc('month', readings.reading_date)::date
          and report.covers_from <= readings.reading_date
          and report.covers_to >= readings.reading_date
          and report.byte_size > 0
          and nullif(report.content_sha256, '') is not null
          and nullif(report.object_path, '') is not null
      )
    order by readings.reading_date, readings.station_id, readings.meter_id
    limit greatest(1, least(coalesce(p_batch_size, 10000), 50000))
  )
  delete from public.daily_meter_readings as readings
  using candidates
  where readings.ctid = candidates.ctid;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

drop policy if exists archive_reports_read on public.archive_reports;
revoke all on table public.archive_reports from anon, authenticated;
revoke all on function public.archive_candidate_partitions(date) from public, anon, authenticated;
revoke all on function public.archive_payment_partitions(date) from public, anon, authenticated;
revoke all on function public.archive_reports_summary(text) from public, anon, authenticated;
revoke all on function public.prune_archived_daily_meter_readings(date, integer) from public, anon, authenticated;
grant execute on function public.archive_candidate_partitions(date) to service_role;
grant execute on function public.archive_payment_partitions(date) to service_role;
grant execute on function public.archive_reports_summary(text) to service_role;
grant execute on function public.prune_archived_daily_meter_readings(date, integer) to service_role;

-- Run after the 01:00 UTC Vercel archive sweep. Failures cannot delete unarchived rows
-- because the function's archive existence/checksum predicate is the final interlock.
do $migration$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'prune-archived-daily-meter-readings';

    perform cron.schedule(
      'prune-archived-daily-meter-readings',
      '0 4 * * *',
      $job$select public.prune_archived_daily_meter_readings();$job$
    );
  end if;
end
$migration$;

notify pgrst, 'reload schema';
