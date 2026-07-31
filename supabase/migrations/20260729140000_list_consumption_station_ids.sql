-- Station discovery for the consumption pipeline.
--
-- Two bugs shared one root cause: the estate was a hardcoded five-station
-- constant. Refreshing aggregates only ever touched those five, so a newly
-- onboarded station's numbers were permanently stale; and the admin station
-- picker was derived from the first 5000 daily_meter_readings rows, which at
-- production volume covers a single station.
--
-- The constant was also doing a second, real job: keeping junk ids that land in
-- the raw tables from smoke tests and webhook probes out of analytics.
-- Replacing it with blind discovery would have leaked those.
--
-- What counts as a station here is therefore evidence-based:
--
--   * a station qualifies by having actual meter evidence — daily readings or
--     consumption aggregates. That auto-includes a newly onboarded site the
--     moment its first reading lands, with no deploy;
--   * a vendor assignment alone does NOT qualify one. vendor_organizations in
--     this database carries 'KADUNA' and 'SMOKE-STATION', neither of which has
--     a single reading or aggregate row — they are onboarding fixtures, and
--     unioning them in is what put phantom stations on the admin picker;
--   * ids that look like test fixtures (purely numeric such as '0001', or
--     containing "TEST"/"SMOKE") are excluded by heuristic;
--   * consumption_stations overrides everything — is_active = false hides an
--     id with real evidence, is_active = true admits one that has none yet.
--
-- Onboarding a station needs no deploy, and quarantining junk needs no code
-- change.

create table if not exists public.consumption_stations (
  station_id  text primary key,
  is_active   boolean not null default true,
  label       text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.consumption_stations enable row level security;

drop policy if exists consumption_stations_service_role on public.consumption_stations;
create policy consumption_stations_service_role on public.consumption_stations
  for all to service_role using (true) with check (true);

-- The five live sites, pinned active so no future heuristic can drop them.
insert into public.consumption_stations (station_id, is_active, label, note)
values
  ('TUNGA',   true, 'Tunga',   'live site'),
  ('UMAISHA', true, 'Umaisha', 'live site'),
  ('OGUFA',   true, 'Ogufa',   'live site'),
  ('KYAKALE', true, 'Kyakale', 'live site'),
  ('MUSHA',   true, 'Musha',   'live site')
on conflict (station_id) do update
  set is_active = excluded.is_active,
      label     = coalesce(excluded.label, public.consumption_stations.label),
      updated_at = now();

-- Known non-stations. '0001' carries 164 readings and 20 aggregate rows in
-- production and would otherwise pass the evidence test; the others are vendor
-- onboarding fixtures with no meter data at all.
insert into public.consumption_stations (station_id, is_active, note)
values
  ('0001',          false, 'placeholder id in OEM feed'),
  ('TEST_STATION',  false, 'smoke-test fixture'),
  ('SMOKE-STATION', false, 'smoke-test vendor fixture'),
  ('KADUNA',        false, 'vendor onboarding fixture — no meter data')
on conflict (station_id) do nothing;

-- daily_meter_readings is large, so DISTINCT is done as a loose index scan over
-- daily_meter_readings_station_date_idx (station_id, reading_date): one index
-- probe per distinct station rather than a full scan. Every column reference is
-- table-qualified because the RETURNS TABLE output name would otherwise be
-- ambiguous against the CTE columns.
create or replace function public.list_consumption_station_ids()
returns table (station_id text)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive reading_ids as (
    select (
      select d.station_id
        from public.daily_meter_readings d
       where d.station_id is not null
       order by d.station_id
       limit 1
    ) as found_id
    union all
    select (
      select d.station_id
        from public.daily_meter_readings d
       where d.station_id > r.found_id
       order by d.station_id
       limit 1
    )
      from reading_ids r
     where r.found_id is not null
  ),
  aggregate_ids as (
    select (
      select a.station_id
        from public.meter_consumption_aggregates a
       where a.station_id is not null
       order by a.station_id
       limit 1
    ) as found_id
    union all
    select (
      select a.station_id
        from public.meter_consumption_aggregates a
       where a.station_id > g.found_id
       order by a.station_id
       limit 1
    )
      from aggregate_ids g
     where g.found_id is not null
  ),
  registry_ids as (
    select c.station_id as found_id
      from public.consumption_stations c
     where c.is_active
  ),
  candidates as (
    select distinct upper(btrim(x.found_id)) as canonical_id
      from (
        select r.found_id from reading_ids r
        union all
        select g.found_id from aggregate_ids g
        union all
        select y.found_id from registry_ids y
      ) x
     where x.found_id is not null
       and btrim(x.found_id) <> ''
  )
  select c.canonical_id as station_id
    from candidates c
    left join public.consumption_stations reg
      on upper(btrim(reg.station_id)) = c.canonical_id
   where coalesce(
           reg.is_active,
           not (
             c.canonical_id ~ '^[0-9]+$'
             or c.canonical_id like '%TEST%'
             or c.canonical_id like '%SMOKE%'
           )
         )
   order by 1;
$$;

revoke all on function public.list_consumption_station_ids() from public, anon, authenticated;
grant execute on function public.list_consumption_station_ids() to service_role;

notify pgrst, 'reload schema';
