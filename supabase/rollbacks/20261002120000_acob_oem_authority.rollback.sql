begin;
do $$
declare
  v_uid uuid;
  v_tenant constant uuid := 'd43a9029-8002-4015-a272-b9c835c8909f';
  v_sandbox constant uuid := 'ed0eefb2-f017-43ad-a52e-82169684803b';
  v_production constant uuid := '53f12390-74f7-40b3-b1db-e907c256986d';
begin
  select au.id into strict v_uid from auth.users au
    where lower(au.email)=lower('admin@acoblighting.com');
  if exists(select 1 from public.oem_installations where tenant_id=v_tenant and status<>'draft') then
    raise exception 'Manual rollback review required: installation state changed';
  end if;
  if exists(select 1 from public.oem_tenant_memberships where tenant_id=v_tenant and auth_user_id<>v_uid) then
    raise exception 'Manual rollback review required: additional memberships exist';
  end if;
  delete from public.oem_actor_installation_access
    where auth_user_id=v_uid and oem_installation_id in (v_sandbox,v_production) and status='active';
  delete from public.oem_tenant_memberships
    where tenant_id=v_tenant and auth_user_id=v_uid and status='active';
  update public.tenants set status='draft',updated_at=now()
    where id=v_tenant and slug='acob-lighting' and status='active';
end $$;
commit;
