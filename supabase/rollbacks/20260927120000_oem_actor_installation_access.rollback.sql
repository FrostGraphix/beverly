-- Refuses automatic execution. Set the transaction-local guard only after review.
-- A populated grant table must be retained; deploy the previous code instead.
begin;
do $rollback_guard$
begin
  if current_setting('beverly.allow_oem_access_rollback', true) is distinct from 'reviewed' then
    raise exception 'Manual rollback review required';
  end if;
end
$rollback_guard$;
lock table public.oem_actor_installation_access in access exclusive mode;
do $empty_guard$
begin
  if exists (select 1 from public.oem_actor_installation_access) then
    raise exception 'Retain populated installation grants';
  end if;
end
$empty_guard$;
drop table public.oem_actor_installation_access;
notify pgrst, 'reload schema';
commit;
