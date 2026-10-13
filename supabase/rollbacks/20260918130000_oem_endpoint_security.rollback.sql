-- Reviewed emergency rollback only.
-- Removing endpoint allowlists weakens routing safety.
-- Replace this guard manually afterwards.

do $rollback_guard$
begin
  raise exception 'Manual rollback review required';
end
$rollback_guard$;

begin;

alter table public.oem_installations
  drop constraint if exists oem_installations_active_production_endpoint_check;

alter table public.oem_installations
  drop column if exists approved_hostnames;

commit;

notify pgrst, 'reload schema';
