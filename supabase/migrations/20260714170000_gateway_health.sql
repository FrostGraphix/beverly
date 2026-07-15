create table if not exists public.gateway_health_incidents (
  id text primary key,
  station_id text not null,
  gateway_id text not null,
  gateway_name text not null,
  status text not null check (status in ('open', 'recovered')),
  started_at timestamptz not null,
  ended_at timestamptz,
  last_status text not null,
  success_rate numeric,
  last_reported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'open' and ended_at is null) or (status = 'recovered' and ended_at is not null))
);

create table if not exists public.gateway_health_state (
  station_id text not null,
  gateway_id text not null,
  gateway_name text not null,
  is_down boolean not null,
  last_status text not null,
  success_rate numeric,
  last_reported_at timestamptz,
  changed_at timestamptz not null,
  checked_at timestamptz not null,
  open_incident_id text references public.gateway_health_incidents(id),
  primary key (station_id, gateway_id)
);

create index if not exists gateway_health_incidents_station_started_idx
  on public.gateway_health_incidents(station_id, started_at desc);

create index if not exists gateway_health_incidents_open_idx
  on public.gateway_health_incidents(station_id, gateway_id)
  where status = 'open';

alter table public.gateway_health_state enable row level security;
alter table public.gateway_health_incidents enable row level security;

drop policy if exists "gateway health service role" on public.gateway_health_state;
create policy "gateway health service role" on public.gateway_health_state
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "gateway incidents service role" on public.gateway_health_incidents;
create policy "gateway incidents service role" on public.gateway_health_incidents
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
