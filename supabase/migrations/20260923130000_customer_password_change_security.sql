alter table public.customers
  add column if not exists password_changed_at timestamptz,
  add column if not exists password_session_id text;

create table if not exists public.customer_password_change_attempts (
  id bigint generated always as identity primary key,
  auth_user_id uuid not null,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists customer_password_change_attempts_account_idx
  on public.customer_password_change_attempts(auth_user_id, created_at desc);

alter table public.customer_password_change_attempts enable row level security;
alter table public.customer_password_change_attempts force row level security;
revoke all on table public.customer_password_change_attempts from public, anon, authenticated;

create or replace function public.fn_claim_customer_password_change_attempt(
  p_auth_user_id uuid,
  p_ip_address text default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare recent_attempts integer;
begin
  delete from public.customer_password_change_attempts where created_at < now() - interval '1 day';
  select count(*) into recent_attempts from public.customer_password_change_attempts
    where auth_user_id = p_auth_user_id and created_at >= now() - interval '15 minutes';
  if recent_attempts >= 5 then return false; end if;
  insert into public.customer_password_change_attempts(auth_user_id, ip_address)
    values (p_auth_user_id, nullif(trim(p_ip_address), ''));
  return true;
end;
$$;

revoke all on function public.fn_claim_customer_password_change_attempt(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_claim_customer_password_change_attempt(uuid, text) to service_role;
