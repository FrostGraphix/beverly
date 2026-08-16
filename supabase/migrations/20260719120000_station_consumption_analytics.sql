create or replace function public.get_station_consumption_analytics(
  p_from date,
  p_to date,
  p_prior_from date,
  p_prior_to date,
  p_station_id text default null,
  p_period_type text default 'day',
  p_top_limit integer default 25
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with current_rows as materialized (
    select station_id, meter_id, customer_id, customer_name, period_start,
           kwh_total, reading_count
    from public.meter_consumption_aggregates
    where period_type = p_period_type
      and period_start between p_from and p_to
      and (p_station_id is null or upper(station_id) = upper(p_station_id))
      and upper(station_id) = any(array['TUNGA','UMAISHA','OGUFA','KYAKALE','MUSHA'])
  ),
  prior_rows as materialized (
    select station_id, kwh_total
    from public.meter_consumption_aggregates
    where period_type = p_period_type
      and period_start between p_prior_from and p_prior_to
      and (p_station_id is null or upper(station_id) = upper(p_station_id))
      and upper(station_id) = any(array['TUNGA','UMAISHA','OGUFA','KYAKALE','MUSHA'])
  ),
  station_rows as (
    select c.station_id,
           sum(c.kwh_total) as total_kwh,
           coalesce(p.prior_kwh, 0) as prior_kwh,
           count(distinct c.meter_id) as meter_count,
           count(distinct c.meter_id) filter (where c.kwh_total > 0) as active_meter_count,
           sum(c.reading_count) as reading_count
    from current_rows c
    left join (
      select station_id, sum(kwh_total) as prior_kwh
      from prior_rows
      group by station_id
    ) p using (station_id)
    group by c.station_id, p.prior_kwh
  ),
  temporal_rows as (
    select station_id, period_start, sum(kwh_total) as kwh_total
    from current_rows
    group by station_id, period_start
    order by period_start, station_id
  ),
  top_rows as (
    select station_id, meter_id,
           max(customer_id) as customer_id,
           max(customer_name) as customer_name,
           sum(kwh_total) as total_kwh,
           count(*) filter (where kwh_total > 0) as active_periods
    from current_rows
    group by station_id, meter_id
    order by total_kwh desc
    limit least(greatest(p_top_limit, 1), 200)
  )
  select jsonb_build_object(
    'sourceRows', (select count(*) from current_rows),
    'stations', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.total_kwh desc)
      from station_rows s
    ), '[]'::jsonb),
    'temporal', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.period_start, t.station_id)
      from temporal_rows t
    ), '[]'::jsonb),
    'topMeters', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.total_kwh desc)
      from top_rows m
    ), '[]'::jsonb),
    'rollups', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.station_id)
      from public.station_meter_read_rollups r
      where (p_station_id is null or upper(r.station_id) = upper(p_station_id))
        and upper(r.station_id) = any(array['TUNGA','UMAISHA','OGUFA','KYAKALE','MUSHA'])
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.get_station_consumption_analytics(date, date, date, date, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.get_station_consumption_analytics(date, date, date, date, text, text, integer)
  to service_role;

notify pgrst, 'reload schema';
