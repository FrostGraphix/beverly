begin;
do $$
declare
  v_uid uuid;
  v_tenant constant uuid := 'd43a9029-8002-4015-a272-b9c835c8909f';
  v_sandbox constant uuid := 'ed0eefb2-f017-43ad-a52e-82169684803b';
  v_production constant uuid := '53f12390-74f7-40b3-b1db-e907c256986d';
begin
  select au.id into strict v_uid
  from auth.users au
  join public.users u on u.auth_user_id=au.id
  where lower(au.email)=lower('admin@acoblighting.com')
    and lower(u.email)=lower('admin@acoblighting.com')
    and u.role_key='super-admin';

  if not exists(select 1 from public.tenants where id=v_tenant and slug='acob-lighting' and status='draft') then
    raise exception 'ACOB tenant state mismatch';
  end if;
  if (select count(*) from public.oem_installations
      where id in (v_sandbox,v_production) and tenant_id=v_tenant and status='draft') <> 2 then
    raise exception 'ACOB installation state mismatch';
  end if;
  if exists(select 1 from public.oem_tenant_memberships where tenant_id=v_tenant and auth_user_id=v_uid)
    or exists(select 1 from public.oem_actor_installation_access
      where auth_user_id=v_uid and oem_installation_id in (v_sandbox,v_production)) then
    raise exception 'ACOB authority already provisioned';
  end if;

  insert into public.oem_tenant_memberships(tenant_id,auth_user_id,status)
    values(v_tenant,v_uid,'active');
  insert into public.oem_actor_installation_access(auth_user_id,oem_installation_id,status)
    values(v_uid,v_sandbox,'active'),(v_uid,v_production,'active');
  update public.tenants set status='active',updated_at=now() where id=v_tenant;
end $$;
commit;
