-- Synthetic, deliberately scoped fixture for the agreed HTTP contracts.
-- Not a production schema baseline or a full migration/ledger test.
-- Columns mirror the queries in plugins/auth.ts and routes/admin.ts.
create table public.roles (role_key text primary key, role_name text not null);
create table public.permissions (
  role_key text references public.roles(role_key), route_hash text not null,
  primary key(role_key, route_hash)
);
create table public.users (
  id uuid primary key default gen_random_uuid(), auth_user_id uuid references auth.users(id),
  user_id text unique not null, user_name text not null, email text unique,
  role_key text references public.roles(role_key), station_id text, station_ids text[],
  password_reset_required boolean default false, password_changed_at timestamptz, password_session_id text
);
create table public.vendor_organizations (
  id uuid primary key, status text, station_id text, operating_stations text[], station_ids_json jsonb
);
create table public.vendor_users (
  id uuid primary key, auth_user_id uuid references auth.users(id),
  vendor_organization_id uuid references public.vendor_organizations(id), role text, status text,
  mfa_enrolled boolean, password_reset_required boolean, password_changed_at timestamptz,
  password_session_id text, email text, email_verified_at timestamptz
);
create table public.customers (
  id uuid primary key, auth_user_id uuid references auth.users(id), user_id text,
  kyc_tier integer, status text, email text, phone text, auth_provider text,
  email_verified_at timestamptz, password_changed_at timestamptz, password_session_id text
);
create table public.feature_flags (
  key text primary key, description text, enabled boolean, rollout_percent integer,
  regions text[], created_at timestamptz default now(), updated_at timestamptz default now()
);
insert into public.roles values ('custom-ci-flags', 'Synthetic CI flag tester');
insert into public.permissions values ('custom-ci-flags', 'wallet.flags.manage');
insert into public.feature_flags values ('ci.synthetic.flag', 'Synthetic API fixture', false, 0, '{}', now(), now());

-- Backend service role only; a signed-in user cannot read these tables directly.
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.users enable row level security;
alter table public.vendor_organizations enable row level security;
alter table public.vendor_users enable row level security;
alter table public.customers enable row level security;
alter table public.feature_flags enable row level security;
revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
