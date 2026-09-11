begin;

create table if not exists public.consumption_sync_runs (
  id uuid primary key default gen_random_uuid(),
  station_id text not null check (station_id = upper(btrim(station_id)) and btrim(station_id) <> ''),
  mode text not null check (mode in ('incremental', 'backfill')),
  status text not null check (status in ('running', 'succeeded', 'failed', 'quota_paused')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  attempts integer not null default 1 check (attempts > 0),
  from_date date,
  to_date date,
  pages_fetched integer not null default 0 check (pages_fetched >= 0),
  fetched_rows integer not null default 0 check (fetched_rows >= 0),
  stored_rows integer not null default 0 check (stored_rows >= 0),
  source_earliest_date date,
  source_latest_date date,
  stop_reason text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists consumption_sync_runs_station_started_idx
  on public.consumption_sync_runs (station_id, started_at desc);

create index if not exists consumption_sync_runs_status_started_idx
  on public.consumption_sync_runs (status, started_at desc);

create table if not exists public.consumption_sync_station_state (
  station_id text primary key check (station_id = upper(btrim(station_id)) and btrim(station_id) <> ''),
  last_mode text check (last_mode is null or last_mode in ('incremental', 'backfill')),
  last_status text not null default 'pending'
    check (last_status in ('pending', 'running', 'succeeded', 'failed', 'quota_paused')),
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  cursor_date date,
  source_latest_date date,
  last_fetched_rows integer not null default 0 check (last_fetched_rows >= 0),
  last_stored_rows integer not null default 0 check (last_stored_rows >= 0),
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.consumption_sync_runs enable row level security;
alter table public.consumption_sync_station_state enable row level security;

create or replace function public.claim_consumption_sync_station(p_station_ids text[])
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed_station text;
begin
  insert into public.consumption_sync_station_state (station_id)
  select distinct upper(btrim(value))
  from unnest(coalesce(p_station_ids, array[]::text[])) as station(value)
  where btrim(value) <> ''
  on conflict (station_id) do nothing;

  select station_id
  into claimed_station
  from public.consumption_sync_station_state
  where station_id in (
    select upper(btrim(value))
    from unnest(coalesce(p_station_ids, array[]::text[])) as station(value)
    where btrim(value) <> ''
  )
  order by last_started_at asc nulls first, station_id asc
  for update skip locked
  limit 1;

  if claimed_station is not null then
    update public.consumption_sync_station_state
    set last_status = 'running',
        last_started_at = now(),
        updated_at = now()
    where station_id = claimed_station;
  end if;

  return claimed_station;
end;
$$;

create or replace function public.consumption_database_usage()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'bytes', pg_database_size(current_database()),
    'megabytes', round(pg_database_size(current_database()) / 1048576.0, 2),
    'measuredAt', now()
  );
$$;

create or replace function public.archive_reports_summary(p_station_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
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
    'dateRange', jsonb_build_object('earliest', min(period_start), 'latest', max(period_start)),
    'coverageRange', jsonb_build_object('earliest', min(covers_from), 'latest', max(covers_to)),
    'refreshRange', jsonb_build_object('earliest', min(updated_at), 'latest', max(updated_at))
  )
  from filtered;
$$;

revoke all on table public.consumption_sync_runs from anon, authenticated;
revoke all on table public.consumption_sync_station_state from anon, authenticated;
revoke all on function public.claim_consumption_sync_station(text[]) from public, anon, authenticated;
revoke all on function public.consumption_database_usage() from public, anon, authenticated;
revoke all on function public.archive_reports_summary(text) from public, anon, authenticated;
grant execute on function public.claim_consumption_sync_station(text[]) to service_role;
grant execute on function public.consumption_database_usage() to service_role;
grant execute on function public.archive_reports_summary(text) to service_role;
grant select, insert, update on table public.consumption_sync_runs to service_role;
grant select, insert, update on table public.consumption_sync_station_state to service_role;

commit;
