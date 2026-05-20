-- Align customer auth linkage across older wallet schemas (`user_id`) and
-- newer backend code (`auth_user_id`). Both are kept populated so existing
-- RLS policies and newer service code can resolve the same Supabase auth user.

alter table public.customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

alter table public.customers
  add column if not exists user_id text;

update public.customers
set auth_user_id = user_id::uuid
where auth_user_id is null
  and user_id is not null
  and user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

update public.customers
set user_id = auth_user_id::text
where user_id is null
  and auth_user_id is not null;

create unique index if not exists customers_auth_user_id_idx
  on public.customers(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists customers_user_id_idx
  on public.customers(user_id)
  where user_id is not null;
