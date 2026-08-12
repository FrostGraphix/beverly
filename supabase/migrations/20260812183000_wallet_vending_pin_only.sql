-- Dedicated four-digit vending PINs for customer and vendor wallet debits.

alter table public.customers
  add column if not exists vend_pin_hash text,
  add column if not exists vend_pin_salt text,
  add column if not exists vend_pin_set_at timestamptz,
  add column if not exists vend_pin_failed_attempts integer not null default 0,
  add column if not exists vend_pin_locked_until timestamptz;

alter table public.vendor_users
  add column if not exists vend_credential_failed_attempts integer not null default 0,
  add column if not exists vend_credential_locked_until timestamptz;

alter type public.wallet_security_event_type add value if not exists 'vend_pin_set';
alter type public.wallet_security_event_type add value if not exists 'vend_pin_failure';

-- Existing vendor credentials may be passwords or non-four-digit PINs.
-- Clear them so every vendor explicitly creates the new PIN-only credential.
update public.vendor_users
set vend_credential_type = null,
    vend_credential_hash = null,
    vend_credential_salt = null,
    vend_credential_set_at = null,
    vend_credential_failed_attempts = 0,
    vend_credential_locked_until = null
where vend_credential_set_at is not null;

alter table public.vendor_users
  drop constraint if exists vendor_users_vend_credential_type_check;

alter table public.vendor_users
  add constraint vendor_users_vend_credential_type_check
  check (vend_credential_type is null or vend_credential_type = 'pin');

revoke insert, update, delete, truncate, references, trigger on public.customers from authenticated;
grant select on public.customers to authenticated;
grant all on public.customers to service_role;

notify pgrst, 'reload schema';
