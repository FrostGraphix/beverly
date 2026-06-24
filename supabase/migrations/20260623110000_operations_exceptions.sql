create table if not exists public.operations_exceptions (
  id uuid primary key default gen_random_uuid(),
  exception_key text not null unique,
  category text not null,
  target_type text not null,
  target_id text not null,
  severity text not null default 'high',
  status text not null default 'open',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.operations_exceptions enable row level security;
alter table public.operations_exceptions force row level security;
create policy "operations exceptions service role" on public.operations_exceptions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
