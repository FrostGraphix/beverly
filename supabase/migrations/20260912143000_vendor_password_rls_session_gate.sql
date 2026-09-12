-- Enforce vendor password transitions inside direct Supabase reads.
-- Backend guards already apply these rules. RLS must match them.

update public.vendor_users
set password_session_id = 'migration:' || gen_random_uuid()::text
where password_changed_at is not null
  and password_session_id is null;

create or replace function private.current_vendor_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select vu.vendor_organization_id
  from public.vendor_users vu
  where vu.auth_user_id = (select auth.uid())
    and vu.status = 'active'
    and vu.password_reset_required is not true
    and (
      vu.password_changed_at is null
      or vu.password_session_id = (select auth.jwt() ->> 'session_id')
    )
  limit 1
$$;

revoke all on function private.current_vendor_organization_id() from public, anon;
grant execute on function private.current_vendor_organization_id() to authenticated, service_role;

drop policy if exists "vendor users read own" on public.vendor_users;
drop policy if exists "Vendors read own user records" on public.vendor_users;

create policy "Vendors read own user records"
  on public.vendor_users for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    and password_reset_required is not true
    and (
      password_changed_at is null
      or password_session_id = (select auth.jwt() ->> 'session_id')
    )
  );
