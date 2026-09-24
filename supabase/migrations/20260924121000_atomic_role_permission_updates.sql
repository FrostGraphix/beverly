create or replace function public.admin_replace_role_permissions(
  p_role_key text,
  p_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role_key = 'super-admin' then
    raise exception using errcode = '42501', message = 'Super Admin permissions cannot be changed.';
  end if;

  if not exists (
    select 1
    from public.roles
    where role_key = p_role_key
  ) then
    raise exception using errcode = 'P0002', message = 'Role was not found.';
  end if;

  delete from public.permissions
  where role_key = p_role_key;

  insert into public.permissions (role_key, route_hash)
  select p_role_key, permission
  from unnest(coalesce(p_permissions, array[]::text[])) as permission
  where permission is not null
    and btrim(permission) <> ''
  on conflict (role_key, route_hash) do nothing;
end;
$$;

revoke all on function public.admin_replace_role_permissions(text, text[]) from public;
revoke all on function public.admin_replace_role_permissions(text, text[]) from anon;
revoke all on function public.admin_replace_role_permissions(text, text[]) from authenticated;
grant execute on function public.admin_replace_role_permissions(text, text[]) to service_role;
