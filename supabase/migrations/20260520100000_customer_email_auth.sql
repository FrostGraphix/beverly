-- Customer email/password account support.

alter table public.customers
  add column if not exists full_name text,
  add column if not exists kyc_tier integer not null default 0,
  add column if not exists kyc_status text not null default 'unverified',
  add column if not exists auth_provider text not null default 'phone_otp',
  add column if not exists email_verified_at timestamptz;

update public.customers
set full_name = coalesce(full_name, name, customer_name)
where full_name is null;

create unique index if not exists customers_email_lower_idx
  on public.customers (lower(email))
  where email is not null;

create index if not exists customers_auth_provider_idx
  on public.customers (auth_provider, created_at desc);

notify pgrst, 'reload schema';
