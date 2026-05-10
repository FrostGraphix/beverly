create table if not exists public.daily_meter_readings (
  id uuid primary key default gen_random_uuid(),
  station_id text not null,
  meter_id text not null,
  customer_id text,
  customer_name text,
  reading_date date not null,
  total1 numeric,
  remain1 numeric,
  row_json jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(station_id, meter_id, reading_date)
);

create index if not exists daily_meter_readings_station_date_idx
on public.daily_meter_readings(station_id, reading_date);

create index if not exists daily_meter_readings_meter_date_idx
on public.daily_meter_readings(meter_id, reading_date);

drop trigger if exists set_daily_meter_readings_updated_at on public.daily_meter_readings;
create trigger set_daily_meter_readings_updated_at
before update on public.daily_meter_readings
for each row execute function public.set_updated_at();

alter table public.daily_meter_readings enable row level security;
