alter table public.users
  add column if not exists station_ids text[] not null default '{}'::text[];

update public.users
set station_ids = array[upper(station_id)]
where coalesce(station_id, '') <> ''
  and cardinality(station_ids) = 0;

create or replace function public.current_station_ids()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when cardinality(u.station_ids) > 0 then
        array(select upper(value) from unnest(u.station_ids) value where value <> '')
      when coalesce(u.station_id, '') <> '' then array[upper(u.station_id)]
      else '{}'::text[]
    end
    from public.users u
    where u.auth_user_id = (select auth.uid())
       or lower(u.user_id) = lower((select auth.uid())::text)
    limit 1
  ), '{}'::text[])
$$;

create or replace function public.current_station_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (public.current_station_ids())[1]), '')
$$;

grant execute on function public.current_station_ids() to authenticated;

drop policy if exists "Consumption staff read scoped meters" on public.daily_meter_readings;
create policy "Consumption staff read scoped meters"
  on public.daily_meter_readings for select to authenticated
  using (
    (select private.has_permission('wallet.consumption.view'))
    and (
      (select private.current_staff_role()) = 'super-admin'
      or upper(station_id) = any(public.current_station_ids())
    )
  );
