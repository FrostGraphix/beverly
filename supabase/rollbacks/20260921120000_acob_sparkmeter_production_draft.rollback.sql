-- Run only after proving that no imported mappings or operational evidence remain.

begin;

do $rollback_guard$
begin
  if exists (
    select 1
    from public.external_resource_mappings
    where oem_installation_id = '53f12390-74f7-40b3-b1db-e907c256986d'
  ) or exists (
    select 1
    from public.oem_commands
    where oem_installation_id = '53f12390-74f7-40b3-b1db-e907c256986d'
  ) then
    raise exception 'ACOB SparkMeter production-draft installation has dependent operational data';
  end if;
end
$rollback_guard$;

delete from public.oem_config_revisions
where oem_installation_id = '53f12390-74f7-40b3-b1db-e907c256986d';

delete from public.oem_capability_manifests
where oem_installation_id = '53f12390-74f7-40b3-b1db-e907c256986d';

delete from public.oem_installations
where id = '53f12390-74f7-40b3-b1db-e907c256986d'
  and environment = 'production'
  and status = 'draft';

commit;

notify pgrst, 'reload schema';
