alter table public.vendor_users
  add column if not exists vend_credential_type text,
  add column if not exists vend_credential_hash text,
  add column if not exists vend_credential_salt text,
  add column if not exists vend_credential_set_at timestamptz;

alter table public.vendor_users
  drop constraint if exists vendor_users_vend_credential_type_check;

alter table public.vendor_users
  add constraint vendor_users_vend_credential_type_check
  check (vend_credential_type is null or vend_credential_type in ('pin', 'password'));

create index if not exists vendor_users_vend_credential_set_idx
  on public.vendor_users(vend_credential_set_at)
  where vend_credential_set_at is not null;

notify pgrst, 'reload schema';
