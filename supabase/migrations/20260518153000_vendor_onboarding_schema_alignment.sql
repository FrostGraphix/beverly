-- Align live wallet-admin onboarding schema with backend/wallet/src/services/vendor-onboarding.ts.
-- This migration is intentionally additive/idempotent so it can repair environments
-- where the earlier wallet foundation tables were not applied or were created with
-- older column names.

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.vendor_organizations (
  id uuid primary key default gen_random_uuid()
);

alter table public.vendor_organizations
  add column if not exists legal_name text,
  add column if not exists trading_name text,
  add column if not exists cac_number text,
  add column if not exists tin text,
  add column if not exists business_type text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists operating_address text,
  add column if not exists operating_stations text[] not null default '{}'::text[],
  add column if not exists daily_limit_minor bigint not null default 1000000000,
  add column if not exists status text not null default 'approved',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.vendor_organizations
  alter column legal_name set default 'Unnamed vendor',
  alter column contact_email set default 'unknown@example.invalid',
  alter column contact_phone set default '';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vendor_organizations'
      and column_name = 'organization_name'
  ) then
    update public.vendor_organizations
    set legal_name = coalesce(legal_name, organization_name, 'Unnamed vendor')
    where legal_name is null;

    alter table public.vendor_organizations alter column organization_name drop not null;
  end if;
end $$;

update public.vendor_organizations
set
  legal_name = coalesce(legal_name, 'Unnamed vendor'),
  contact_email = coalesce(contact_email, 'unknown@example.invalid'),
  contact_phone = coalesce(contact_phone, '')
where legal_name is null
   or contact_email is null
   or contact_phone is null;

alter table public.vendor_organizations
  alter column legal_name set not null,
  alter column contact_email set not null,
  alter column contact_phone set not null;

alter table public.vendor_organizations
  drop constraint if exists vendor_organizations_status_check;

alter table public.vendor_organizations
  add constraint vendor_organizations_status_check
  check (status in ('approved', 'suspended', 'frozen', 'closed', 'pending_review', 'rejected'));

create index if not exists vendor_organizations_legal_name_idx
  on public.vendor_organizations using gin (legal_name gin_trgm_ops);
create index if not exists vendor_organizations_status_created_idx
  on public.vendor_organizations(status, created_at desc);

create table if not exists public.vendor_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  vendor_organization_id uuid not null references public.vendor_organizations(id) on delete cascade,
  role text not null default 'vendor_manager',
  full_name text not null,
  email text not null,
  phone text,
  password_reset_required boolean not null default true,
  mfa_enrolled boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auth_user_id),
  unique (vendor_organization_id, email)
);

alter table public.vendor_users
  drop constraint if exists vendor_users_status_check;
alter table public.vendor_users
  add constraint vendor_users_status_check check (status in ('active', 'disabled', 'invited'));

create index if not exists vendor_users_auth_user_idx on public.vendor_users(auth_user_id);
create index if not exists vendor_users_org_idx on public.vendor_users(vendor_organization_id);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null,
  owner_id uuid not null,
  currency text not null default 'NGN',
  status text not null default 'active',
  balance_minor bigint not null default 0,
  daily_debit_cap_minor bigint,
  monthly_debit_cap_minor bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_type, owner_id)
);

alter table public.wallets
  drop constraint if exists wallets_owner_type_check,
  drop constraint if exists wallets_status_check;
alter table public.wallets
  add constraint wallets_owner_type_check check (owner_type in ('vendor', 'customer')),
  add constraint wallets_status_check check (status in ('active', 'frozen', 'closed'));

create index if not exists wallets_owner_idx on public.wallets(owner_type, owner_id);

create table if not exists public.vendor_applications (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  business_type text,
  operating_stations text[],
  notes text,
  source_ip text,
  user_agent text,
  status text not null default 'submitted',
  converted_org_id uuid references public.vendor_organizations(id) on delete set null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vendor_applications
  drop constraint if exists vendor_applications_status_check;
alter table public.vendor_applications
  add constraint vendor_applications_status_check
  check (status in ('submitted', 'converted', 'rejected'));

create index if not exists vendor_applications_status_created_idx
  on public.vendor_applications(status, created_at asc);

create table if not exists public.wallet_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_type text not null,
  actor_role text,
  action text not null,
  target_type text not null,
  target_id text not null,
  before_json jsonb,
  after_json jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wallet_audit_log_created_at_idx on public.wallet_audit_log(created_at desc);
create index if not exists wallet_audit_log_action_idx on public.wallet_audit_log(action, created_at desc);

create table if not exists public.wallet_security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'info',
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wallet_security_events_created_at_idx on public.wallet_security_events(created_at desc);
create index if not exists wallet_security_events_type_idx on public.wallet_security_events(event_type, created_at desc);

alter table public.vendor_organizations enable row level security;
alter table public.vendor_users enable row level security;
alter table public.wallets enable row level security;
alter table public.vendor_applications enable row level security;
alter table public.wallet_audit_log enable row level security;
alter table public.wallet_security_events enable row level security;

drop policy if exists "wallet service role all vendor organizations" on public.vendor_organizations;
create policy "wallet service role all vendor organizations"
  on public.vendor_organizations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all vendor users" on public.vendor_users;
create policy "wallet service role all vendor users"
  on public.vendor_users for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all wallets" on public.wallets;
create policy "wallet service role all wallets"
  on public.wallets for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all vendor applications" on public.vendor_applications;
create policy "wallet service role all vendor applications"
  on public.vendor_applications for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all audit log" on public.wallet_audit_log;
create policy "wallet service role all audit log"
  on public.wallet_audit_log for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all security events" on public.wallet_security_events;
create policy "wallet service role all security events"
  on public.wallet_security_events for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
