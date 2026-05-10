create table if not exists public.operational_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_key text not null,
  snapshot_type text not null,
  scope_key text not null default 'global',
  title text not null,
  source_path text,
  request_key text,
  payload_json jsonb not null default '{}'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  freshness_seconds integer not null default 3600,
  captured_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(snapshot_key, scope_key)
);

create index if not exists operational_snapshots_type_captured_idx
on public.operational_snapshots(snapshot_type, captured_at desc);

create index if not exists operational_snapshots_scope_captured_idx
on public.operational_snapshots(scope_key, captured_at desc);

create index if not exists operational_snapshots_expires_idx
on public.operational_snapshots(expires_at);

drop trigger if exists set_operational_snapshots_updated_at on public.operational_snapshots;
create trigger set_operational_snapshots_updated_at
before update on public.operational_snapshots
for each row execute function public.set_updated_at();

alter table public.operational_snapshots enable row level security;
