create or replace function public.refresh_consumption_tariff_values_for_range(
  p_station_id text,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
declare
  v_period text;
  v_daily_count int := 0;
  v_aggregate_count int := 0;
  v_updated int := 0;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid tariff valuation date range';
  end if;

  with resolved as materialized (
    select dmd.station_id, dmd.meter_id, dmd.reading_date,
      coalesce(ath.tariff_id, '') tariff_id,
      case when trh.is_valid and trh.effective_price_ngn > 0 then trh.effective_price_ngn end effective_price_ngn
    from public.daily_meter_deltas dmd
    left join lateral (
      select h.tariff_id from public.account_tariff_history h
      where upper(h.station_id) = upper(dmd.station_id) and h.meter_id = dmd.meter_id
        and h.effective_from <= dmd.reading_date
      order by h.effective_from desc, h.observed_at desc limit 1
    ) ath on true
    left join lateral (
      select h.effective_price_ngn, h.is_valid from public.tariff_rate_history h
      where upper(h.tariff_id) = upper(coalesce(ath.tariff_id, ''))
        and h.effective_from <= dmd.reading_date
        and (upper(h.station_scope) = upper(dmd.station_id) or h.station_scope = '*')
      order by (upper(h.station_scope) = upper(dmd.station_id)) desc,
               h.effective_from desc, h.observed_at desc limit 1
    ) trh on true
    where dmd.station_id = p_station_id and dmd.reading_date between p_from and p_to
  )
  update public.daily_meter_deltas dmd set
    tariff_id = r.tariff_id,
    effective_price_ngn = r.effective_price_ngn,
    tariff_value_ngn = case when r.effective_price_ngn is not null then round(dmd.delta_kwh * r.effective_price_ngn, 2) else 0 end,
    priced_kwh = case when r.effective_price_ngn is not null then dmd.delta_kwh else 0 end,
    unpriced_kwh = case when r.effective_price_ngn is null then dmd.delta_kwh else 0 end,
    last_refreshed_at = now()
  from resolved r
  where dmd.station_id = r.station_id and dmd.meter_id = r.meter_id and dmd.reading_date = r.reading_date;
  get diagnostics v_daily_count = row_count;

  foreach v_period in array array['day','week','month','year'] loop
    with rollups as materialized (
      select dmd.station_id, dmd.meter_id, date_trunc(v_period, dmd.reading_date)::date period_start,
        round(sum(dmd.tariff_value_ngn), 2) tariff_value_ngn,
        round(sum(dmd.priced_kwh), 3) priced_kwh,
        round(sum(dmd.unpriced_kwh), 3) unpriced_kwh
      from public.daily_meter_deltas dmd
      where dmd.station_id = p_station_id
        and date_trunc(v_period, dmd.reading_date)::date between
          date_trunc(v_period, p_from)::date and date_trunc(v_period, p_to)::date
      group by dmd.station_id, dmd.meter_id, date_trunc(v_period, dmd.reading_date)::date
    )
    update public.meter_consumption_aggregates mca set
      tariff_value_ngn = r.tariff_value_ngn,
      priced_kwh = r.priced_kwh,
      unpriced_kwh = r.unpriced_kwh,
      last_refreshed_at = now()
    from rollups r
    where mca.station_id = r.station_id and mca.meter_id = r.meter_id
      and mca.period_type = v_period and mca.period_start = r.period_start;
    get diagnostics v_updated = row_count;
    v_aggregate_count := v_aggregate_count + v_updated;
  end loop;

  return jsonb_build_object('station', p_station_id, 'from', p_from, 'to', p_to,
    'daily_rows', v_daily_count, 'aggregate_rows', v_aggregate_count,
    'refreshed_at', now());
end;
$$;

revoke all on function public.refresh_consumption_tariff_values_for_range(text, date, date)
  from public, anon, authenticated;
grant execute on function public.refresh_consumption_tariff_values_for_range(text, date, date)
  to service_role;

notify pgrst, 'reload schema';
