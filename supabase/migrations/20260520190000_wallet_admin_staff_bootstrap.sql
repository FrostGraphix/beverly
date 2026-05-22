-- Ensure the canonical Beverly wallet admin can resolve as staff.
-- This repairs environments where auth.users exists but public.users was empty.

insert into public.roles (name, role_key, role_name, label, description)
values
  ('admin', 'super-admin', 'Super Admin', 'Super Admin', 'Full wallet administration and access control.')
on conflict (role_key) do update
set
  role_name = excluded.role_name,
  label = excluded.label,
  description = excluded.description;

with admin_auth as (
  select
    id,
    email,
    coalesce(
      raw_user_meta_data ->> 'full_name',
      raw_user_meta_data ->> 'user_name',
      'Beverly Admin'
    ) as full_name
  from auth.users
  where lower(email) = 'admin@acoblighting.com'
  limit 1
)
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'role_key', 'super-admin',
    'role', 'super-admin',
    'user_id', 'admin',
    'user_name', coalesce((select full_name from admin_auth), 'Beverly Admin')
  )
where id in (select id from admin_auth);

with admin_auth as (
  select
    id,
    email,
    coalesce(
      raw_user_meta_data ->> 'full_name',
      raw_user_meta_data ->> 'user_name',
      'Beverly Admin'
    ) as full_name
  from auth.users
  where lower(email) = 'admin@acoblighting.com'
  limit 1
)
update public.users u
set
  auth_user_id = admin_auth.id,
  user_id = coalesce(nullif(u.user_id, ''), 'admin'),
  user_name = coalesce(nullif(u.user_name, ''), admin_auth.full_name),
  email = admin_auth.email,
  role_key = 'super-admin',
  updated_at = now()
from admin_auth
where lower(u.email) = lower(admin_auth.email);

with admin_auth as (
  select
    id,
    email,
    coalesce(
      raw_user_meta_data ->> 'full_name',
      raw_user_meta_data ->> 'user_name',
      'Beverly Admin'
    ) as full_name
  from auth.users
  where lower(email) = 'admin@acoblighting.com'
  limit 1
)
insert into public.users (auth_user_id, user_id, user_name, email, role_key)
select id, 'admin', full_name, email, 'super-admin'
from admin_auth
where not exists (
  select 1
  from public.users
  where user_id = 'admin'
     or lower(email) = lower(admin_auth.email)
)
on conflict (user_id) do update
set
  auth_user_id = excluded.auth_user_id,
  user_name = excluded.user_name,
  email = excluded.email,
  role_key = excluded.role_key,
  updated_at = now();
