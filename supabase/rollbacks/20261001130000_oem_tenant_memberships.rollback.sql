-- Reviewed emergency rollback. Populated memberships must be retained.
begin;
do $guard$ begin
  if current_setting('beverly.allow_oem_membership_rollback', true) is distinct from 'reviewed'
    then raise exception 'Manual rollback review required'; end if;
  if exists (select 1 from public.oem_tenant_memberships)
    then raise exception 'Retain populated tenant memberships'; end if;
end $guard$;
drop table public.oem_tenant_memberships;
notify pgrst, 'reload schema';
commit;
