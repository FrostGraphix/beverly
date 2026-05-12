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
  role_key text,
  role_name text,
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
  role_key text references public.roles(role_key),
  station_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.users add column if not exists user_id text;
alter table public.users add column if not exists user_name text;
alter table public.users add column if not exists email text;
alter table public.users add column if not exists role_key text;
alter table public.users
add column if not exists station_id text;
alter table public.users add column if not exists created_at timestamptz not null default now();
alter table public.users add column if not exists updated_at timestamptz not null default now();
create unique index if not exists users_user_id_idx on public.users(user_id);
create unique index if not exists users_email_idx on public.users(email) where email is not null;

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  role_key text not null references public.roles(role_key) on delete cascade,
  route_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(role_key, route_hash)
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

drop trigger if exists set_roles_updated_at on public.roles;
create trigger set_roles_updated_at before update on public.roles for each row execute function public.set_updated_at();
drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at before update on public.users for each row execute function public.set_updated_at();
drop trigger if exists set_permissions_updated_at on public.permissions;
create trigger set_permissions_updated_at before update on public.permissions for each row execute function public.set_updated_at();
drop trigger if exists set_api_cache_updated_at on public.api_cache;
create trigger set_api_cache_updated_at before update on public.api_cache for each row execute function public.set_updated_at();
drop trigger if exists set_import_jobs_updated_at on public.import_jobs;
create trigger set_import_jobs_updated_at before update on public.import_jobs for each row execute function public.set_updated_at();
drop trigger if exists set_export_jobs_updated_at on public.export_jobs;
create trigger set_export_jobs_updated_at before update on public.export_jobs for each row execute function public.set_updated_at();
drop trigger if exists set_print_jobs_updated_at on public.print_jobs;
create trigger set_print_jobs_updated_at before update on public.print_jobs for each row execute function public.set_updated_at();
drop trigger if exists set_write_confirmations_updated_at on public.write_confirmations;
create trigger set_write_confirmations_updated_at before update on public.write_confirmations for each row execute function public.set_updated_at();
drop trigger if exists set_operational_snapshots_updated_at on public.operational_snapshots;
create trigger set_operational_snapshots_updated_at before update on public.operational_snapshots for each row execute function public.set_updated_at();
drop trigger if exists set_daily_meter_readings_updated_at on public.daily_meter_readings;
create trigger set_daily_meter_readings_updated_at before update on public.daily_meter_readings for each row execute function public.set_updated_at();
drop trigger if exists set_account_bindings_updated_at on public.account_bindings;
create trigger set_account_bindings_updated_at before update on public.account_bindings for each row execute function public.set_updated_at();

alter table public.roles enable row level security;
alter table public.users enable row level security;
alter table public.permissions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.api_cache enable row level security;
alter table public.import_jobs enable row level security;
alter table public.export_jobs enable row level security;
alter table public.print_jobs enable row level security;
alter table public.write_confirmations enable row level security;
alter table public.operational_snapshots enable row level security;
alter table public.daily_meter_readings enable row level security;
alter table public.account_bindings enable row level security;
alter table public.automation_deliveries enable row level security;

alter table public.roles force row level security;
alter table public.users force row level security;
alter table public.permissions force row level security;
alter table public.audit_logs force row level security;
alter table public.api_cache force row level security;
alter table public.import_jobs force row level security;
alter table public.export_jobs force row level security;
alter table public.print_jobs force row level security;
alter table public.write_confirmations force row level security;
alter table public.operational_snapshots force row level security;
alter table public.daily_meter_readings force row level security;
alter table public.account_bindings force row level security;
alter table public.automation_deliveries force row level security;

create or replace function public.normalized_role_key(input text)
returns text
language sql
stable
as $$
  select case lower(coalesce(input, ''))
    when 'admin' then 'super-admin'
    when 'administrator' then 'super-admin'
    when 'superadmin' then 'super-admin'
    when 'super_admin' then 'super-admin'
    when 'super-admin' then 'super-admin'
    when '0' then 'super-admin'
    when '1' then 'super-admin'
    when 'operator' then 'operations-manager'
    when 'operations' then 'operations-manager'
    when 'operation-manager' then 'operations-manager'
    when 'operations-manager' then 'operations-manager'
    when 'account' then 'account'
    when 'accountant' then 'account'
    when 'finance' then 'account'
    when 'account-officer' then 'account'
    when 'account_officer' then 'account'
    else lower(coalesce(input, ''))
  end
$$;

create or replace function public.current_role_key()
returns text
language sql
stable
as $$
  select public.normalized_role_key(
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'role_key',
      auth.jwt() ->> 'role_key',
      ''
    )
  )
$$;

create or replace function public.current_user_id_text()
returns text
language sql
stable
as $$
  select lower(
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'user_id',
      auth.jwt() ->> 'user_id',
      ''
    )
  )
$$;

create or replace function public.current_station_id()
returns text
language sql
stable
as $$
  select upper(
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'station_id',
      auth.jwt() ->> 'station_id',
      ''
    )
  )
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select public.current_role_key() = 'super-admin'
$$;

create or replace function public.has_route_permission(route text)
returns boolean
language sql
stable
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.permissions p
      where public.normalized_role_key(p.role_key) = public.current_role_key()
        and (p.route_hash = '*' or p.route_hash = route)
    )
$$;

update public.roles set role_key = 'super-admin', role_name = 'Super Admin', label = 'Super Admin', description = 'Full system access' where name::text = 'admin';
update public.roles set role_key = 'operations-manager', role_name = 'Operations Manager', label = 'Operations Manager', description = 'Operations access' where name::text = 'ops';
update public.roles set role_key = 'account', role_name = 'Account Officer', label = 'Account Officer', description = 'Finance and token access' where name::text = 'finance';
update public.roles set role_key = 'vendor', role_name = 'Vendor', label = 'Vendor', description = 'Vendor token access' where name::text = 'field_agent';

insert into public.roles (name, label, description, role_key, role_name)
select 'admin', 'Super Admin', 'Full system access', 'super-admin', 'Super Admin'
where not exists (select 1 from public.roles where role_key = 'super-admin' or name::text = 'admin');

insert into public.roles (name, label, description, role_key, role_name)
select 'ops', 'Operations Manager', 'Operations access', 'operations-manager', 'Operations Manager'
where not exists (select 1 from public.roles where role_key = 'operations-manager' or name::text = 'ops');

insert into public.roles (name, label, description, role_key, role_name)
select 'finance', 'Account Officer', 'Finance and token access', 'account', 'Account Officer'
where not exists (select 1 from public.roles where role_key = 'account' or name::text = 'finance');

insert into public.roles (name, label, description, role_key, role_name)
select 'field_agent', 'Vendor', 'Vendor token access', 'vendor', 'Vendor'
where not exists (select 1 from public.roles where role_key = 'vendor' or name::text = 'field_agent');

drop policy if exists "Roles readable by authenticated users" on public.roles;
create policy "Roles readable by authenticated users"
on public.roles
for select
to authenticated
using (true);

drop policy if exists "Roles managed by super admins" on public.roles;
create policy "Roles managed by super admins"
on public.roles
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Permissions readable by authenticated users" on public.permissions;
create policy "Permissions readable by authenticated users"
on public.permissions
for select
to authenticated
using (true);

drop policy if exists "Permissions managed by super admins" on public.permissions;
create policy "Permissions managed by super admins"
on public.permissions
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Users readable by self or super admins" on public.users;
create policy "Users readable by self or super admins"
on public.users
for select
to authenticated
using (
  public.is_super_admin()
  or lower(user_id) = public.current_user_id_text()
);

drop policy if exists "Users managed by super admins" on public.users;
create policy "Users managed by super admins"
on public.users
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Audit logs readable by elevated roles" on public.audit_logs;
create policy "Audit logs readable by elevated roles"
on public.audit_logs
for select
to authenticated
using (public.current_role_key() in ('super-admin', 'operations-manager'));

drop policy if exists "Audit logs managed by super admins" on public.audit_logs;
create policy "Audit logs managed by super admins"
on public.audit_logs
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "API cache readable by elevated roles" on public.api_cache;
create policy "API cache readable by elevated roles"
on public.api_cache
for select
to authenticated
using (public.current_role_key() in ('super-admin', 'operations-manager'));

drop policy if exists "API cache managed by super admins" on public.api_cache;
create policy "API cache managed by super admins"
on public.api_cache
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Import jobs readable by permitted roles" on public.import_jobs;
create policy "Import jobs readable by permitted roles"
on public.import_jobs
for select
to authenticated
using (public.current_role_key() in ('super-admin', 'operations-manager'));

drop policy if exists "Import jobs managed by super admins" on public.import_jobs;
create policy "Import jobs managed by super admins"
on public.import_jobs
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Export jobs readable by permitted roles" on public.export_jobs;
create policy "Export jobs readable by permitted roles"
on public.export_jobs
for select
to authenticated
using (public.current_role_key() in ('super-admin', 'operations-manager', 'account'));

drop policy if exists "Export jobs managed by super admins" on public.export_jobs;
create policy "Export jobs managed by super admins"
on public.export_jobs
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Print jobs readable by permitted roles" on public.print_jobs;
create policy "Print jobs readable by permitted roles"
on public.print_jobs
for select
to authenticated
using (public.current_role_key() in ('super-admin', 'operations-manager', 'account'));

drop policy if exists "Print jobs managed by super admins" on public.print_jobs;
create policy "Print jobs managed by super admins"
on public.print_jobs
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Write confirmations readable by elevated roles" on public.write_confirmations;
create policy "Write confirmations readable by elevated roles"
on public.write_confirmations
for select
to authenticated
using (public.current_role_key() in ('super-admin', 'operations-manager'));

drop policy if exists "Write confirmations managed by super admins" on public.write_confirmations;
create policy "Write confirmations managed by super admins"
on public.write_confirmations
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Operational snapshots readable by authenticated users" on public.operational_snapshots;
create policy "Operational snapshots readable by authenticated users"
on public.operational_snapshots
for select
to authenticated
using (true);

drop policy if exists "Operational snapshots managed by super admins" on public.operational_snapshots;
create policy "Operational snapshots managed by super admins"
on public.operational_snapshots
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Daily meter readings readable by station scope" on public.daily_meter_readings;
create policy "Daily meter readings readable by station scope"
on public.daily_meter_readings
for select
to authenticated
using (
  public.is_super_admin()
  or (
    public.current_station_id() <> ''
    and upper(station_id) = public.current_station_id()
  )
);

drop policy if exists "Daily meter readings managed by super admins" on public.daily_meter_readings;
create policy "Daily meter readings managed by super admins"
on public.daily_meter_readings
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Account bindings readable by permitted roles" on public.account_bindings;
create policy "Account bindings readable by permitted roles"
on public.account_bindings
for select
to authenticated
using (
  public.is_super_admin()
  or public.current_role_key() in ('operations-manager', 'account')
  or (
    public.current_station_id() <> ''
    and upper(station_id) = public.current_station_id()
  )
);

drop policy if exists "Account bindings managed by super admins" on public.account_bindings;
create policy "Account bindings managed by super admins"
on public.account_bindings
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Automation deliveries readable by elevated roles" on public.automation_deliveries;
create policy "Automation deliveries readable by elevated roles"
on public.automation_deliveries
for select
to authenticated
using (public.current_role_key() in ('super-admin', 'operations-manager'));

drop policy if exists "Automation deliveries managed by super admins" on public.automation_deliveries;
create policy "Automation deliveries managed by super admins"
on public.automation_deliveries
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());
