-- Staff (admin) app-level 2FA foundation.
-- Mirrors vendor MFA but keys on auth.users.id directly (staff identity is the
-- Supabase auth user; there is no separate staff_users table). Secrets are
-- encrypted by the wallet backend before storage; recovery codes are hashed.

create table if not exists public.staff_mfa_factors (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  factor_type text not null default 'totp',
  status text not null default 'pending',
  secret_ciphertext text not null,
  verified_at timestamptz,
  last_verified_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_mfa_factors_type_check check (factor_type in ('totp')),
  constraint staff_mfa_factors_status_check check (status in ('pending', 'active', 'disabled', 'replaced'))
);

create unique index if not exists staff_mfa_one_active_factor_idx
  on public.staff_mfa_factors(auth_user_id)
  where status = 'active';

create index if not exists staff_mfa_factors_user_status_idx
  on public.staff_mfa_factors(auth_user_id, status, created_at desc);

create table if not exists public.staff_mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (auth_user_id, code_hash)
);

create index if not exists staff_mfa_recovery_codes_user_unused_idx
  on public.staff_mfa_recovery_codes(auth_user_id, used_at)
  where used_at is null;

create table if not exists public.staff_mfa_sessions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists staff_mfa_sessions_user_expiry_idx
  on public.staff_mfa_sessions(auth_user_id, expires_at desc);

alter table public.staff_mfa_factors enable row level security;
alter table public.staff_mfa_recovery_codes enable row level security;
alter table public.staff_mfa_sessions enable row level security;

drop policy if exists "wallet service role all staff mfa factors" on public.staff_mfa_factors;
create policy "wallet service role all staff mfa factors"
  on public.staff_mfa_factors for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all staff mfa recovery codes" on public.staff_mfa_recovery_codes;
create policy "wallet service role all staff mfa recovery codes"
  on public.staff_mfa_recovery_codes for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "wallet service role all staff mfa sessions" on public.staff_mfa_sessions;
create policy "wallet service role all staff mfa sessions"
  on public.staff_mfa_sessions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.staff_mfa_factors is 'Encrypted staff TOTP factors managed only by wallet backend.';
comment on table public.staff_mfa_recovery_codes is 'Hashed one-time staff MFA recovery codes.';
comment on table public.staff_mfa_sessions is 'Short-lived app-level staff MFA grants bound to access-token hash.';
