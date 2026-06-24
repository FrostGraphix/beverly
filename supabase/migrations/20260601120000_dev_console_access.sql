-- Dev console access seed.
-- Account creation is intentionally not done in migrations. Use
-- `npm run dev-console:user` with explicit environment credentials for
-- local or controlled bootstrap runs.

alter table public.roles
  add column if not exists role_key text,
  add column if not exists role_name text,
  add column if not exists label text,
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.permissions
  add column if not exists role_key text,
  add column if not exists route_hash text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.users
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists user_id text,
  add column if not exists user_name text,
  add column if not exists email text,
  add column if not exists role_key text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists roles_role_key_idx
  on public.roles(role_key);

create unique index if not exists permissions_role_route_idx
  on public.permissions(role_key, route_hash);

create unique index if not exists users_auth_user_id_idx
  on public.users(auth_user_id)
  where auth_user_id is not null;

insert into public.roles (name, role_key, role_name, label, description)
values ('admin', 'super-admin', 'Super Admin', 'Super Admin', 'Full wallet administration and access control.')
on conflict (role_key) do update
set role_name = excluded.role_name,
    label = excluded.label,
    description = excluded.description,
    updated_at = now();

insert into public.permissions (role_key, route_hash)
values ('super-admin', 'dev.console')
on conflict (role_key, route_hash) do nothing;

create table if not exists public.dev_api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prefix text not null unique,
  key_hash text not null,
  org_id text,
  org_name text,
  org_type text check (org_type in ('vendor', 'customer', 'system')),
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  last_used_ip text,
  revoked_at timestamptz,
  revoked_by uuid,
  rotated_at timestamptz,
  rotated_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dev_webhooks (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  events text[] not null default '{}',
  secret_hash text not null,
  secret_prefix text not null,
  enabled boolean not null default true,
  failure_count integer not null default 0,
  last_delivery_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dev_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid references public.dev_webhooks(id) on delete set null,
  webhook_url text not null,
  event_type text not null,
  status text not null default 'retrying' check (status in ('delivered', 'failed', 'retrying')),
  http_status integer,
  attempt integer not null default 1,
  latency_ms integer,
  delivered_at timestamptz,
  request_body jsonb not null default '{}'::jsonb,
  response_body text,
  created_at timestamptz not null default now()
);

create table if not exists public.dev_queue_jobs (
  id uuid primary key default gen_random_uuid(),
  queue text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'failed', 'completed')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  error text,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dev_sys_config (
  key text primary key,
  value text not null,
  type text not null default 'string' check (type in ('string', 'number', 'boolean', 'json')),
  description text not null default '',
  category text not null default 'General',
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dev_notification_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null check (channel in ('sms', 'email')),
  event text not null,
  subject text,
  body text not null,
  variables text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event, channel)
);

create table if not exists public.dev_sandbox_activity (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  detail text not null,
  actor text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.dev_error_groups (
  fingerprint text primary key,
  message text not null,
  source text not null,
  severity text not null default 'error' check (severity in ('error', 'warning', 'critical')),
  count integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  affected_actors text[] not null default '{}',
  sample_stack text,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid
);

create table if not exists public.dev_slow_queries (
  id uuid primary key default gen_random_uuid(),
  query_preview text not null,
  duration_ms integer not null,
  table_hints text[] not null default '{}',
  source text,
  called_at timestamptz not null default now()
);

create table if not exists public.dev_service_incidents (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  service_name text not null,
  severity text not null check (severity in ('minor', 'major', 'critical')),
  title text not null,
  started_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.dev_deploy_log (
  id uuid primary key default gen_random_uuid(),
  sha text not null,
  message text not null,
  author text not null,
  environment text not null default 'dev' check (environment in ('production', 'staging', 'dev')),
  deployed_at timestamptz not null default now(),
  deploy_duration_s integer,
  status text not null default 'success' check (status in ('success', 'failed', 'rolling'))
);

create index if not exists dev_webhook_deliveries_created_idx
  on public.dev_webhook_deliveries(created_at desc);
create index if not exists dev_queue_jobs_status_idx
  on public.dev_queue_jobs(queue, status, created_at desc);
create index if not exists dev_sandbox_activity_created_idx
  on public.dev_sandbox_activity(created_at desc);
create index if not exists dev_error_groups_last_seen_idx
  on public.dev_error_groups(last_seen desc);
create index if not exists dev_slow_queries_called_idx
  on public.dev_slow_queries(called_at desc);

alter table public.dev_api_keys enable row level security;
alter table public.dev_webhooks enable row level security;
alter table public.dev_webhook_deliveries enable row level security;
alter table public.dev_queue_jobs enable row level security;
alter table public.dev_sys_config enable row level security;
alter table public.dev_notification_templates enable row level security;
alter table public.dev_sandbox_activity enable row level security;
alter table public.dev_error_groups enable row level security;
alter table public.dev_slow_queries enable row level security;
alter table public.dev_service_incidents enable row level security;
alter table public.dev_deploy_log enable row level security;

drop policy if exists "wallet service role all dev api keys" on public.dev_api_keys;
create policy "wallet service role all dev api keys"
  on public.dev_api_keys for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all dev webhooks" on public.dev_webhooks;
create policy "wallet service role all dev webhooks"
  on public.dev_webhooks for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all dev webhook deliveries" on public.dev_webhook_deliveries;
create policy "wallet service role all dev webhook deliveries"
  on public.dev_webhook_deliveries for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all dev queue jobs" on public.dev_queue_jobs;
create policy "wallet service role all dev queue jobs"
  on public.dev_queue_jobs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all dev sys config" on public.dev_sys_config;
create policy "wallet service role all dev sys config"
  on public.dev_sys_config for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all dev notification templates" on public.dev_notification_templates;
create policy "wallet service role all dev notification templates"
  on public.dev_notification_templates for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all dev sandbox activity" on public.dev_sandbox_activity;
create policy "wallet service role all dev sandbox activity"
  on public.dev_sandbox_activity for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all dev error groups" on public.dev_error_groups;
create policy "wallet service role all dev error groups"
  on public.dev_error_groups for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all dev slow queries" on public.dev_slow_queries;
create policy "wallet service role all dev slow queries"
  on public.dev_slow_queries for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all dev service incidents" on public.dev_service_incidents;
create policy "wallet service role all dev service incidents"
  on public.dev_service_incidents for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all dev deploy log" on public.dev_deploy_log;
create policy "wallet service role all dev deploy log"
  on public.dev_deploy_log for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
