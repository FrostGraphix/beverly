-- Durable OEM command and evidence foundation.
-- No existing dispatch path consumes these tables yet.

create table if not exists public.oem_commands (
  id uuid primary key default gen_random_uuid(),
  oem_installation_id uuid not null references public.oem_installations(id) on delete restrict,
  operation_key text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  canonical_request jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'leased', 'submitted', 'succeeded', 'failed', 'unknown', 'manual_review', 'cancelled')),
  provider_reference text,
  normalized_error_code text,
  normalized_error_message text,
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  next_reconcile_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (oem_installation_id, operation_key, idempotency_key)
);

create table if not exists public.oem_command_attempts (
  id uuid primary key default gen_random_uuid(),
  oem_command_id uuid not null references public.oem_commands(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  request_fingerprint text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null check (outcome in ('started', 'submitted', 'succeeded', 'failed', 'unknown')),
  http_status integer,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  normalized_error_code text,
  normalized_error_message text,
  raw_response_reference text,
  unique (oem_command_id, attempt_number)
);

create table if not exists public.oem_raw_events (
  id uuid primary key default gen_random_uuid(),
  oem_installation_id uuid not null references public.oem_installations(id) on delete restrict,
  source_kind text not null check (source_kind in ('poll', 'webhook', 'command_response', 'reconciliation')),
  operation_key text not null,
  external_event_id text,
  payload_checksum text not null,
  secured_payload_reference text not null,
  received_at timestamptz not null default now(),
  unique (oem_installation_id, source_kind, operation_key, payload_checksum)
);

create table if not exists public.oem_webhook_events (
  id uuid primary key default gen_random_uuid(),
  oem_installation_id uuid not null references public.oem_installations(id) on delete restrict,
  event_id text not null,
  nonce text not null,
  event_timestamp timestamptz not null,
  signature_valid boolean not null,
  payload_checksum text not null,
  raw_event_id uuid references public.oem_raw_events(id) on delete restrict,
  status text not null default 'received' check (status in ('received', 'verified', 'processed', 'rejected', 'failed')),
  retry_count integer not null default 0 check (retry_count >= 0),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (oem_installation_id, event_id),
  unique (oem_installation_id, nonce)
);

create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  idempotency_key text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'leased', 'published', 'failed')),
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (aggregate_type, aggregate_id, event_type, idempotency_key)
);

create table if not exists public.oem_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  oem_installation_id uuid not null references public.oem_installations(id) on delete cascade,
  operation_key text not null,
  circuit_state text not null check (circuit_state in ('closed', 'open', 'half_open')),
  auth_healthy boolean not null,
  success_rate numeric(7, 6) check (success_rate is null or (success_rate >= 0 and success_rate <= 1)),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  quota_remaining bigint,
  observed_at timestamptz not null default now()
);

create index if not exists oem_commands_reconciliation_idx
  on public.oem_commands (status, next_reconcile_at) where status in ('submitted', 'unknown', 'manual_review');
create index if not exists oem_commands_lease_idx
  on public.oem_commands (lease_expires_at) where status = 'leased';
create index if not exists outbox_events_delivery_idx
  on public.outbox_events (status, available_at) where status in ('pending', 'failed');
create index if not exists oem_health_snapshots_lookup_idx
  on public.oem_health_snapshots (oem_installation_id, operation_key, observed_at desc);

alter table public.oem_commands enable row level security;
alter table public.oem_command_attempts enable row level security;
alter table public.oem_raw_events enable row level security;
alter table public.oem_webhook_events enable row level security;
alter table public.outbox_events enable row level security;
alter table public.oem_health_snapshots enable row level security;
alter table public.oem_commands force row level security;
alter table public.oem_command_attempts force row level security;
alter table public.oem_raw_events force row level security;
alter table public.oem_webhook_events force row level security;
alter table public.outbox_events force row level security;
alter table public.oem_health_snapshots force row level security;

revoke all on public.oem_commands, public.oem_command_attempts, public.oem_raw_events,
  public.oem_webhook_events, public.outbox_events, public.oem_health_snapshots from anon, authenticated;
grant all on public.oem_commands, public.oem_command_attempts, public.oem_raw_events,
  public.oem_webhook_events, public.outbox_events, public.oem_health_snapshots to service_role;

notify pgrst, 'reload schema';
