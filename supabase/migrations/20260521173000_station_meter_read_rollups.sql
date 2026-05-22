create table if not exists public.station_meter_read_rollups (
  station_id text primary key,
  meters_with_latest integer not null default 0,
  earliest_latest_reading date,
  latest_reading date,
  latest_odometer_kwh numeric not null default 0,
  refreshed_at timestamptz not null default now()
);
