-- Dynamic station coverage and date-bounded meter-read totals.

create or replace function public.get_station_meter_read_rollups_as_of(
  p_from date,
  p_to date,
  p_station_id text default null
)
returns table (
  station_id text,
  meters_with_latest integer,
  latest_odometer_kwh numeric,
  earliest_latest_reading date,
  latest_reading date
)
language sql
stable
security definer
set search_path = ''
as $$
  with relevant_meters as (
    select distinct d.station_id, d.meter_id
    from public.daily_meter_deltas d
    where d.reading_date between p_from and p_to
      and coalesce(d.meter_id, '') <> ''
      and (p_station_id is null or upper(d.station_id) = upper(p_station_id))
  ), as_of_reads as (
    select rm.station_id, rm.meter_id, latest.reading_date, latest.total1_snapshot
    from relevant_meters rm
    left join lateral (
      select d.reading_date, d.total1_snapshot
      from public.daily_meter_deltas d
      where upper(d.station_id) = upper(rm.station_id)
        and d.meter_id = rm.meter_id
        and d.reading_date <= p_to
        and d.total1_snapshot is not null
        and d.total1_snapshot >= 0
      order by d.reading_date desc
      limit 1
    ) latest on true
  )
  select a.station_id,
    count(*) filter (where total1_snapshot is not null)::integer,
    round(coalesce(sum(total1_snapshot), 0), 3),
    min(reading_date)::date,
    max(reading_date)::date
  from as_of_reads a
  group by a.station_id
  order by a.station_id
$$;

revoke all on function public.get_station_meter_read_rollups_as_of(date, date, text)
  from public, anon, authenticated;
grant execute on function public.get_station_meter_read_rollups_as_of(date, date, text)
  to service_role;

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
  with current_rows as materialized (
    select station_id, meter_id, customer_id, customer_name, period_start,
      kwh_total, reading_count, tariff_value_ngn, priced_kwh, unpriced_kwh
    from public.meter_consumption_aggregates
    where period_type = p_period_type
      and period_start between p_from and p_to
      and (p_station_id is null or upper(station_id) = upper(p_station_id))
  ), prior_rows as materialized (
    select station_id, kwh_total
    from public.meter_consumption_aggregates
    where period_type = p_period_type
      and period_start between p_prior_from and p_prior_to
      and (p_station_id is null or upper(station_id) = upper(p_station_id))
  ), station_rows as (
    select c.station_id, sum(c.kwh_total) total_kwh,
      coalesce(p.prior_kwh, 0) prior_kwh,
      count(distinct c.meter_id) meter_count,
      count(distinct coalesce(nullif(c.customer_id, ''), c.meter_id)) customer_count,
      count(distinct c.meter_id) filter (where c.kwh_total > 0) active_meter_count,
      sum(c.reading_count) reading_count,
      round(sum(c.tariff_value_ngn), 2) tariff_value_ngn,
      round(sum(c.priced_kwh), 3) priced_kwh,
      round(sum(c.unpriced_kwh), 3) unpriced_kwh
    from current_rows c
    left join (
      select station_id, sum(kwh_total) prior_kwh
      from prior_rows
      group by station_id
    ) p using (station_id)
    group by c.station_id, p.prior_kwh
  ), temporal_rows as (
    select station_id, period_start, sum(kwh_total) kwh_total
    from current_rows
    group by station_id, period_start
  ), top_rows as (
    select station_id, meter_id, max(customer_id) customer_id,
      max(customer_name) customer_name, sum(kwh_total) total_kwh,
      count(*) filter (where kwh_total > 0) active_periods,
      round(sum(tariff_value_ngn), 2) tariff_value_ngn,
      round(sum(priced_kwh), 3) priced_kwh,
      round(sum(unpriced_kwh), 3) unpriced_kwh
    from current_rows
    group by station_id, meter_id
    order by total_kwh desc
    limit least(greatest(p_top_limit, 1), 200)
  ), relevant_meters as (
    select distinct station_id, meter_id
    from current_rows
    where coalesce(meter_id, '') <> ''
  ), as_of_reads as (
    select rm.station_id, rm.meter_id, latest.reading_date, latest.total1_snapshot
    from relevant_meters rm
    left join lateral (
      select d.reading_date, d.total1_snapshot
      from public.daily_meter_deltas d
      where upper(d.station_id) = upper(rm.station_id)
        and d.meter_id = rm.meter_id
        and d.reading_date <= p_to
        and d.total1_snapshot is not null
        and d.total1_snapshot >= 0
      order by d.reading_date desc
      limit 1
    ) latest on true
  ), rollup_rows as (
    select station_id,
      count(*) filter (where total1_snapshot is not null)::integer meters_with_latest,
      round(coalesce(sum(total1_snapshot), 0), 3) latest_odometer_kwh,
      min(reading_date)::date earliest_latest_reading,
      max(reading_date)::date latest_reading
    from as_of_reads
    group by station_id
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
      'valueNgn', value_ngn, 'pricedKwh', priced_kwh,
      'unpricedKwh', unpriced_kwh, 'totalKwh', total_kwh,
      'coveragePct', case when total_kwh <= 0 then 100 else round(priced_kwh * 100 / total_kwh, 2) end,
      'complete', unpriced_kwh <= 0.0005, 'basis', 'historical-snapshot'
    ) from totals),
    'stations', coalesce((select jsonb_agg(to_jsonb(s) order by s.total_kwh desc) from station_rows s), '[]'::jsonb),
    'temporal', coalesce((select jsonb_agg(to_jsonb(t) order by t.period_start, t.station_id) from temporal_rows t), '[]'::jsonb),
    'tariffBreakdown', '[]'::jsonb,
    'topMeters', coalesce((select jsonb_agg(to_jsonb(m) order by m.total_kwh desc) from top_rows m), '[]'::jsonb),
    'rollups', coalesce((select jsonb_agg(to_jsonb(r) order by r.station_id) from rollup_rows r), '[]'::jsonb)
  )
$$;

revoke all on function public.get_station_consumption_analytics(date, date, date, date, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.get_station_consumption_analytics(date, date, date, date, text, text, integer)
  to service_role;

create or replace function public.refresh_meter_reading_aggregates_dynamic()
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '30min'
as $$
declare
  v_station text;
  v_results jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtext('refresh-meter-reading-aggregates-dynamic')) then
    return jsonb_build_object('status', 'already-running', 'results', v_results, 'errors', v_errors);
  end if;

  for v_station in
    select distinct upper(station_id)
    from public.daily_meter_readings
    where coalesce(station_id, '') <> ''
    order by 1
  loop
    begin
      v_results := v_results || jsonb_build_array(
        public.refresh_meter_reading_aggregates_for_station(v_station)
      );
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'station', v_station,
        'sqlstate', sqlstate,
        'message', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'status', case when jsonb_array_length(v_errors) = 0 then 'success' else 'partial' end,
    'results', v_results,
    'errors', v_errors,
    'refreshed_at', now()
  );
end;
$$;

revoke all on function public.refresh_meter_reading_aggregates_dynamic()
  from public, anon, authenticated;
grant execute on function public.refresh_meter_reading_aggregates_dynamic()
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname in (
      'refresh-meter-reading-aggregates',
      'refresh-meter-agg-tunga',
      'refresh-meter-agg-umaisha',
      'refresh-meter-agg-ogufa',
      'refresh-meter-agg-kyakale',
      'refresh-meter-agg-musha',
      'refresh-meter-aggregates-dynamic'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'refresh-meter-aggregates-dynamic',
  '30 */6 * * *',
  $$select public.refresh_meter_reading_aggregates_dynamic()$$
);

notify pgrst, 'reload schema';
