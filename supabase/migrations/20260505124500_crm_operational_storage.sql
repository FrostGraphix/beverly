create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  role_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.roles add column if not exists role_key text;
alter table public.roles add column if not exists role_name text;
alter table public.roles add column if not exists name text;
alter table public.roles add column if not exists label text;
alter table public.roles add column if not exists description text;
alter table public.roles add column if not exists updated_at timestamptz not null default now();

update public.roles
set
  role_key = coalesce(
    role_key,
    case
      when lower(coalesce(name::text, '')) = 'admin' then 'super-admin'
      when lower(coalesce(name::text, '')) in ('account', 'accountant', 'finance') then 'account'
      when lower(coalesce(name::text, '')) in ('operations', 'operator', 'operations-manager') then 'operations-manager'
      else lower(regexp_replace(coalesce(name::text, label::text, description::text, id::text), '[^a-zA-Z0-9]+', '-', 'g'))
    end
  ),
  role_name = coalesce(role_name, label::text, name::text, role_key::text)
where role_key is null
   or role_name is null;

create unique index if not exists roles_role_key_idx on public.roles(role_key);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  user_id text not null unique,
  user_name text not null,
  email text unique,
  role_key text not null references public.roles(role_key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  role_key text not null references public.roles(role_key) on delete cascade,
  route_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(role_key, route_hash)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  method text not null,
  path text not null,
  outcome text not null,
  status_code integer not null,
  proxy_source text not null,
  detail_json jsonb not null default '{}'::jsonb,
  user_id text,
  request_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.api_cache (
  id uuid primary key default gen_random_uuid(),
  method text not null,
  path text not null,
  request_key text not null,
  status_code integer not null,
  response_json jsonb not null default '{}'::jsonb,
  source text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(method, path, request_key)
);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  route_hash text not null,
  file_name text not null,
  storage_bucket text,
  storage_path text,
  row_count integer not null default 0,
  status text not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  route_hash text not null,
  storage_bucket text,
  storage_path text,
  row_count integer not null default 0,
  format text not null,
  status text not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  route_hash text not null,
  storage_bucket text,
  storage_path text,
  receipt_type text not null,
  status text not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.write_confirmations (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  action text not null,
  confirmation_text text not null default '',
  authorization_provided boolean not null default false,
  status text not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_bindings (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  meter_id text not null,
  tariff_id text,
  ct_ratio text,
  station_id text,
  remark text,
  source text not null default 'supabase',
  status text not null default 'active',
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id, meter_id)
);

create table if not exists public.automation_deliveries (
  id uuid primary key default gen_random_uuid(),
  incident_id text not null,
  incident_kind text not null,
  incident_title text not null,
  webhook_id text,
  webhook_name text,
  attempt_number integer not null default 1,
  ok boolean not null default false,
  status_code integer not null default 0,
  error_text text,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_path_created_at_idx on public.audit_logs(path, created_at desc);
create index if not exists audit_logs_outcome_created_at_idx on public.audit_logs(outcome, created_at desc);
create index if not exists api_cache_path_updated_at_idx on public.api_cache(path, updated_at desc);
create index if not exists api_cache_expires_at_idx on public.api_cache(expires_at) where expires_at is not null;
create index if not exists import_jobs_route_created_at_idx on public.import_jobs(route_hash, created_at desc);
create index if not exists export_jobs_route_created_at_idx on public.export_jobs(route_hash, created_at desc);
create index if not exists print_jobs_route_created_at_idx on public.print_jobs(route_hash, created_at desc);
create index if not exists write_confirmations_endpoint_created_at_idx on public.write_confirmations(endpoint, created_at desc);
create index if not exists account_bindings_station_updated_at_idx on public.account_bindings(station_id, updated_at desc);
create index if not exists automation_deliveries_created_at_idx on public.automation_deliveries(created_at desc);

drop trigger if exists set_roles_updated_at on public.roles;
create trigger set_roles_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists set_permissions_updated_at on public.permissions;
create trigger set_permissions_updated_at
before update on public.permissions
for each row execute function public.set_updated_at();

drop trigger if exists set_api_cache_updated_at on public.api_cache;
create trigger set_api_cache_updated_at
before update on public.api_cache
for each row execute function public.set_updated_at();

drop trigger if exists set_import_jobs_updated_at on public.import_jobs;
create trigger set_import_jobs_updated_at
before update on public.import_jobs
for each row execute function public.set_updated_at();

drop trigger if exists set_export_jobs_updated_at on public.export_jobs;
create trigger set_export_jobs_updated_at
before update on public.export_jobs
for each row execute function public.set_updated_at();

drop trigger if exists set_print_jobs_updated_at on public.print_jobs;
create trigger set_print_jobs_updated_at
before update on public.print_jobs
for each row execute function public.set_updated_at();

drop trigger if exists set_write_confirmations_updated_at on public.write_confirmations;
create trigger set_write_confirmations_updated_at
before update on public.write_confirmations
for each row execute function public.set_updated_at();

drop trigger if exists set_account_bindings_updated_at on public.account_bindings;
create trigger set_account_bindings_updated_at
before update on public.account_bindings
for each row execute function public.set_updated_at();

alter table public.roles enable row level security;
alter table public.users enable row level security;
alter table public.permissions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.api_cache enable row level security;
alter table public.import_jobs enable row level security;
alter table public.export_jobs enable row level security;
alter table public.print_jobs enable row level security;
alter table public.write_confirmations enable row level security;
alter table public.account_bindings enable row level security;
alter table public.automation_deliveries enable row level security;

insert into public.roles (role_key, role_name)
values
  ('super-admin', 'Super Admin'),
  ('operations-manager', 'Operations Manager'),
  ('account-officer', 'Account Officer')
on conflict (role_key) do update
set role_name = excluded.role_name;

insert into public.users (user_id, user_name, email, role_key)
values
  ('admin', 'System Admin', 'admin@acoblighting.com', 'super-admin'),
  ('ops', 'Operations Lead', null, 'operations-manager'),
  ('acct', 'Account Officer', null, 'account-officer')
on conflict (user_id) do update
set user_name = excluded.user_name,
    email = excluded.email,
    role_key = excluded.role_key;

insert into public.permissions (role_key, route_hash)
values
  ('super-admin', '*'),
  ('operations-manager', '#/remote-operation-record/remote-meter-reading-task'),
  ('operations-manager', '#/remote-operation-record/remote-meter-control-task'),
  ('account-officer', '#/management/account'),
  ('account-officer', '#/token/credit-token-record')
on conflict (role_key, route_hash) do nothing;
