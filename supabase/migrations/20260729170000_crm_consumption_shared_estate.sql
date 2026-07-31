-- Make the CRM's station consumption analytics share the wallet's estate
-- definition instead of carrying its own copy.
--
-- get_station_consumption_analytics filtered on a hardcoded
-- array['TUNGA','UMAISHA','OGUFA','KYAKALE','MUSHA'] in three separate places.
-- That is the same defect the wallet portal had: onboard a sixth station and
-- the CRM's consumption page silently omits it, with no error and no clue —
-- the totals simply read low. It also meant the CRM and the wallet could
-- disagree about which stations exist.
--
-- Both now read public.list_consumption_station_ids(), so the estate is
-- defined once and every consumption surface agrees.

create or replace function public.get_station_consumption_analytics(
  p_from date, p_to date, p_prior_from date, p_prior_to date,
  p_station_id text default null, p_period_type text default 'day',
  p_top_limit integer default 25
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with estate as (
    select s.station_id from public.list_consumption_station_ids() s
  ), current_rows as materialized (
    select station_id, meter_id, customer_id, customer_name, period_start,
      kwh_total, reading_count, tariff_value_ngn, priced_kwh, unpriced_kwh
    from public.meter_consumption_aggregates
    where period_type = p_period_type and period_start between p_from and p_to
      and (p_station_id is null or upper(station_id) = upper(p_station_id))
      and upper(station_id) in (select e.station_id from estate e)
  ), prior_rows as materialized (
    select station_id, kwh_total from public.meter_consumption_aggregates
    where period_type = p_period_type and period_start between p_prior_from and p_prior_to
      and (p_station_id is null or upper(station_id) = upper(p_station_id))
      and upper(station_id) in (select e.station_id from estate e)
  ), station_rows as (
    select c.station_id, sum(c.kwh_total) total_kwh, coalesce(p.prior_kwh, 0) prior_kwh,
      count(distinct c.meter_id) meter_count,
      count(distinct coalesce(nullif(c.customer_id, ''), c.meter_id)) customer_count,
      count(distinct c.meter_id) filter (where c.kwh_total > 0) active_meter_count,
      sum(c.reading_count) reading_count, round(sum(c.tariff_value_ngn), 2) tariff_value_ngn,
      round(sum(c.priced_kwh), 3) priced_kwh, round(sum(c.unpriced_kwh), 3) unpriced_kwh
    from current_rows c left join (
      select station_id, sum(kwh_total) prior_kwh from prior_rows group by station_id
    ) p using (station_id)
    group by c.station_id, p.prior_kwh
  ), temporal_rows as (
    select station_id, period_start, sum(kwh_total) kwh_total
    from current_rows group by station_id, period_start order by period_start, station_id
  ), top_rows as (
    select station_id, meter_id, max(customer_id) customer_id,
      max(customer_name) customer_name, sum(kwh_total) total_kwh,
      count(*) filter (where kwh_total > 0) active_periods,
      round(sum(tariff_value_ngn), 2) tariff_value_ngn,
      round(sum(priced_kwh), 3) priced_kwh, round(sum(unpriced_kwh), 3) unpriced_kwh
    from current_rows group by station_id, meter_id
    order by total_kwh desc limit least(greatest(p_top_limit, 1), 200)
  ), totals as (
    select round(coalesce(sum(tariff_value_ngn), 0), 2) value_ngn,
      round(coalesce(sum(priced_kwh), 0), 3) priced_kwh,
      round(coalesce(sum(unpriced_kwh), 0), 3) unpriced_kwh,
      round(coalesce(sum(kwh_total), 0), 3) total_kwh
    from current_rows
  )
  select jsonb_build_object(
    'sourceRows', (select count(*) from current_rows),
    'customerCount', (select count(distinct coalesce(nullif(customer_id, ''), meter_id)) from current_rows),
    'valuation', (select jsonb_build_object(
      'valueNgn', value_ngn, 'pricedKwh', priced_kwh, 'unpricedKwh', unpriced_kwh,
      'totalKwh', total_kwh,
      'coveragePct', case when total_kwh <= 0 then 100 else round(priced_kwh * 100 / total_kwh, 2) end,
      'complete', unpriced_kwh <= 0.0005, 'basis', 'historical-snapshot'
    ) from totals),
    'stations', coalesce((select jsonb_agg(to_jsonb(s) order by s.total_kwh desc) from station_rows s), '[]'::jsonb),
    'temporal', coalesce((select jsonb_agg(to_jsonb(t) order by t.period_start, t.station_id) from temporal_rows t), '[]'::jsonb),
    'tariffBreakdown', '[]'::jsonb,
    'topMeters', coalesce((select jsonb_agg(to_jsonb(m) order by m.total_kwh desc) from top_rows m), '[]'::jsonb),
    'rollups', coalesce((select jsonb_agg(to_jsonb(r) order by r.station_id)
      from public.station_meter_read_rollups r
      where (p_station_id is null or upper(r.station_id) = upper(p_station_id))
        and upper(r.station_id) in (select e.station_id from estate e)), '[]'::jsonb)
  )
$$;

revoke all on function public.get_station_consumption_analytics(date, date, date, date, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.get_station_consumption_analytics(date, date, date, date, text, text, integer)
  to service_role;

notify pgrst, 'reload schema';
