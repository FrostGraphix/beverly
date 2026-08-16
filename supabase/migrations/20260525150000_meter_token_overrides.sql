-- Per-meter STS token-format (S1/S2) overrides.
-- The credit-token isS2 flag is normally guessed from meter phase, but phase does
-- not reliably imply the STS standard. These rows pin the correct format per meter
-- so token generation (and remote send) uses the format the meter actually accepts.

create table if not exists public.meter_token_overrides (
  meter_id   text primary key,
  is_s2      boolean not null,
  note       text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create index if not exists meter_token_overrides_updated_idx
  on public.meter_token_overrides (updated_at desc);

-- Access is mediated by the CRM proxy (service role); no public client policies.
alter table public.meter_token_overrides enable row level security;

notify pgrst, 'reload schema';
