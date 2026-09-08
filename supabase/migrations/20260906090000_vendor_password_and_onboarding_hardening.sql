-- Vendor first-login security and onboarding delivery state.

alter type public.wallet_security_event_type add value if not exists 'password_change_failure';

alter table public.vendor_users
  add column if not exists password_changed_at timestamptz,
  add column if not exists invitation_status text not null default 'pending',
  add column if not exists invitation_message_id text,
  add column if not exists invitation_sent_at timestamptz,
  add column if not exists invitation_error text;

alter table public.vendor_users drop constraint if exists vendor_users_invitation_status_check;
alter table public.vendor_users add constraint vendor_users_invitation_status_check
  check (invitation_status in ('pending', 'sent', 'failed'));

alter table public.vendor_organizations
  add column if not exists provisioning_status text not null default 'active',
  add column if not exists provisioning_key text;

alter table public.vendor_organizations drop constraint if exists vendor_organizations_provisioning_status_check;
alter table public.vendor_organizations add constraint vendor_organizations_provisioning_status_check
  check (provisioning_status in ('pending', 'active', 'failed'));

create unique index if not exists vendor_organizations_provisioning_key_uidx
  on public.vendor_organizations(provisioning_key)
  where provisioning_key is not null;

create table if not exists public.vendor_password_change_attempts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists vendor_password_change_attempts_account_idx
  on public.vendor_password_change_attempts(auth_user_id, created_at desc);

alter table public.vendor_password_change_attempts enable row level security;
revoke all on table public.vendor_password_change_attempts from public, anon, authenticated;

create or replace function public.fn_claim_vendor_password_change_attempt(
  p_auth_user_id uuid,
  p_ip_address text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_attempts integer;
begin
  delete from public.vendor_password_change_attempts
  where created_at < now() - interval '24 hours';

  perform pg_advisory_xact_lock(hashtext(p_auth_user_id::text));
  select count(*) into recent_attempts
  from public.vendor_password_change_attempts
  where auth_user_id = p_auth_user_id
    and created_at >= now() - interval '15 minutes';

  if recent_attempts >= 5 then return false; end if;

  insert into public.vendor_password_change_attempts(auth_user_id, ip_address)
  values (p_auth_user_id, nullif(trim(p_ip_address), ''));
  return true;
end;
$$;

revoke all on function public.fn_claim_vendor_password_change_attempt(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_claim_vendor_password_change_attempt(uuid, text) to service_role;

-- Bearer-static integrations authenticate with their bearer token. Clear any
-- legacy username/password values that were incorrectly copied from temporary
-- portal credentials without disturbing real bearer-login/OAuth credentials.
update public.oem_credentials
set encrypted_username = '', encrypted_password = '', updated_at = now()
where auth_strategy = 'bearer_static'
  and (encrypted_username <> '' or encrypted_password <> '');

notify pgrst, 'reload schema';
