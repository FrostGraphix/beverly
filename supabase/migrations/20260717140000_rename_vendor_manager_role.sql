begin;

alter table public.vendor_users
  alter column role set default 'vendor';

update public.vendor_users
set role = 'vendor',
    updated_at = now()
where lower(role) in ('vendor_manager', 'vendor-manager');

update auth.users au
set raw_user_meta_data = coalesce(au.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'vendor', 'role_key', 'vendor')
from public.vendor_users vu
where vu.auth_user_id = au.id
  and vu.role = 'vendor';

create or replace function public.normalized_role_key(input text)
returns text
language sql
immutable
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
    when 'finance_checker' then 'finance-checker'
    when 'finance-checker' then 'finance-checker'
    when 'checker' then 'finance-checker'
    when 'vendor' then 'vendor'
    when 'vendor-manager' then 'vendor'
    when 'vendor_manager' then 'vendor'
    when 'vendor-user' then 'vendor_user'
    when 'vendor_user' then 'vendor_user'
    else lower(coalesce(input, ''))
  end
$$;

create or replace function public.current_role_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.current_staff_role(),
    (
      select public.normalized_role_key(vu.role)
      from public.vendor_users vu
      where vu.auth_user_id = (select auth.uid())
        and vu.status = 'active'
      limit 1
    ),
    case when private.current_customer_id() is not null then 'customer' end,
    ''
  )
$$;

commit;
