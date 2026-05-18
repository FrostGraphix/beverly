create table if not exists public.daily_meter_raw_duplicates (
  id uuid primary key default gen_random_uuid(),
  station_id text not null,
  meter_id text,
  reading_date date,
  duplicate_index integer not null,
  event_type text not null default 'duplicate',
  source_page integer,
  source_row integer,
  row_json jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(station_id, meter_id, reading_date, duplicate_index)
);

alter table public.daily_meter_raw_duplicates
alter column meter_id drop not null;

alter table public.daily_meter_raw_duplicates
alter column reading_date drop not null;

alter table public.daily_meter_raw_duplicates
add column if not exists event_type text not null default 'duplicate';

create unique index if not exists daily_meter_raw_duplicates_event_idx
on public.daily_meter_raw_duplicates(station_id, event_type, source_page, source_row);

create index if not exists daily_meter_raw_duplicates_station_date_idx
on public.daily_meter_raw_duplicates(station_id, reading_date);

drop trigger if exists set_daily_meter_raw_duplicates_updated_at on public.daily_meter_raw_duplicates;
create trigger set_daily_meter_raw_duplicates_updated_at
before update on public.daily_meter_raw_duplicates
for each row execute function public.set_updated_at();

alter table public.daily_meter_raw_duplicates enable row level security;
