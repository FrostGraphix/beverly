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

  if not exists (select 1 from public.roles where role_key = p_role_key) then
    raise exception using errcode = 'P0002', message = 'Role was not found.';
  end if;

  if p_role_key like 'custom-%'
     and 'dev.console' = any(coalesce(p_permissions, array[]::text[])) then
    raise exception using errcode = '42501', message = 'Custom roles cannot receive system-only permissions.';
  end if;

  delete from public.permissions where role_key = p_role_key;

  insert into public.permissions (role_key, route_hash)
  select p_role_key, permission
  from unnest(coalesce(p_permissions, array[]::text[])) as permission
  where permission is not null and btrim(permission) <> ''
  on conflict (role_key, route_hash) do nothing;
end;
$$;

create or replace function public.admin_create_custom_role(
  p_role_key text,
  p_role_name text,
  p_description text,
  p_permissions text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_role public.roles%rowtype;
begin
  if p_role_key not like 'custom-%'
     or p_role_key !~ '^custom-[a-z0-9]+(-[a-z0-9]+)*$' then
    return jsonb_build_object('status', 'invalid_role_key');
  end if;

  if cardinality(coalesce(p_permissions, array[]::text[])) = 0 then
    return jsonb_build_object('status', 'permissions_required');
  end if;

  if 'dev.console' = any(coalesce(p_permissions, array[]::text[])) then
    return jsonb_build_object('status', 'restricted_permissions');
  end if;

  insert into public.roles (name, role_key, role_name, label, description)
  values (p_role_key, p_role_key, p_role_name, p_role_name, nullif(p_description, ''))
  on conflict (role_key) do nothing
  returning * into created_role;

  if created_role.role_key is null then
    return jsonb_build_object('status', 'role_exists');
  end if;

  insert into public.permissions (role_key, route_hash)
  select created_role.role_key, permission
  from unnest(p_permissions) as permission
  where permission is not null
    and btrim(permission) <> ''
  on conflict (role_key, route_hash) do nothing;

  return jsonb_build_object(
    'status', 'created',
    'role', jsonb_build_object(
      'role_key', created_role.role_key,
      'role_name', created_role.role_name,
      'label', created_role.label,
      'description', created_role.description
    )
  );
end;
$$;

create or replace function public.admin_delete_custom_role(p_role_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_role_key text;
begin
  if p_role_key not like 'custom-%' then
    return 'system_role_locked';
  end if;

  select role_key
  into locked_role_key
  from public.roles
  where role_key = p_role_key
  for update;

  if locked_role_key is null then
    return 'role_not_found';
  end if;

  if exists (
    select 1
    from public.users
    where role_key = p_role_key
  ) then
    return 'role_in_use';
  end if;

  delete from public.roles
  where role_key = p_role_key;

  return 'deleted';
end;
$$;

revoke all on function public.admin_create_custom_role(text, text, text, text[]) from public;
revoke all on function public.admin_create_custom_role(text, text, text, text[]) from anon;
revoke all on function public.admin_create_custom_role(text, text, text, text[]) from authenticated;
grant execute on function public.admin_create_custom_role(text, text, text, text[]) to service_role;

revoke all on function public.admin_replace_role_permissions(text, text[]) from public;
revoke all on function public.admin_replace_role_permissions(text, text[]) from anon;
revoke all on function public.admin_replace_role_permissions(text, text[]) from authenticated;
grant execute on function public.admin_replace_role_permissions(text, text[]) to service_role;

revoke all on function public.admin_delete_custom_role(text) from public;
revoke all on function public.admin_delete_custom_role(text) from anon;
revoke all on function public.admin_delete_custom_role(text) from authenticated;
grant execute on function public.admin_delete_custom_role(text) to service_role;
