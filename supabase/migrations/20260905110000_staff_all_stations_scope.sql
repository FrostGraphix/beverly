-- Durable estate-wide staff scope. The '*' marker is intentionally resolved at
-- authorization time, so stations created after a staff account are included
-- without rewriting that account.
create or replace function public.current_staff_has_all_stations()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select '*' = any(u.station_ids)
    from public.users u
    where u.auth_user_id = (select auth.uid())
       or lower(u.user_id) = lower((select auth.uid())::text)
    limit 1
  ), false)
$$;

grant execute on function public.current_staff_has_all_stations() to authenticated;

create or replace function public.current_station_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.current_staff_has_all_stations() then ''
    else coalesce((select (public.current_station_ids())[1]), '')
  end
$$;

drop policy if exists "Consumption staff read scoped meters" on public.daily_meter_readings;
create policy "Consumption staff read scoped meters"
  on public.daily_meter_readings for select to authenticated
  using (
    (select private.has_permission('wallet.consumption.view'))
    and (
      (select private.current_staff_role()) = 'super-admin'
      or public.current_staff_has_all_stations()
      or upper(station_id) = any(public.current_station_ids())
    )
  );

drop policy if exists "consumption aggregates staff scope" on public.meter_consumption_aggregates;
create policy "consumption aggregates staff scope"
  on public.meter_consumption_aggregates for select to authenticated
  using (
    (select private.has_permission('wallet.consumption.view'))
    and (
      (select private.current_staff_role()) = 'super-admin'
      or public.current_staff_has_all_stations()
      or upper(station_id) = any(public.current_station_ids())
    )
  );

drop policy if exists "meter deltas staff scope" on public.daily_meter_deltas;
create policy "meter deltas staff scope"
  on public.daily_meter_deltas for select to authenticated
  using (
    (select private.has_permission('wallet.consumption.view'))
    and (
      (select private.current_staff_role()) = 'super-admin'
      or public.current_staff_has_all_stations()
      or upper(station_id) = any(public.current_station_ids())
    )
  );
