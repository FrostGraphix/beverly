create index if not exists meter_consumption_agg_period_range_idx
  on public.meter_consumption_aggregates(period_type, period_start, station_id, meter_id);

