-- Customer-linked meters used by customer token purchases.
-- Some environments predate this wallet table, so create it idempotently.

create table if not exists public.customer_meters (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  meter_id text not null,
  meter_type text check (meter_type is null or meter_type in ('single_phase', 'three_phase')),
  station_id text,
  tariff_id text,
  nickname text,
  alias text,
  meter_name text,
  registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id, meter_id)
);

create index if not exists customer_meters_customer_created_idx
  on public.customer_meters(customer_id, created_at desc);

create index if not exists customer_meters_meter_id_idx
  on public.customer_meters(meter_id);

create index if not exists customer_meters_meter_type_idx
  on public.customer_meters(meter_type);

drop trigger if exists customer_meters_updated_at on public.customer_meters;
create trigger customer_meters_updated_at
  before update on public.customer_meters
  for each row execute function public.fn_set_updated_at();

alter table public.customer_meters enable row level security;

drop policy if exists "service role manages customer meters" on public.customer_meters;
create policy "service role manages customer meters"
  on public.customer_meters for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
