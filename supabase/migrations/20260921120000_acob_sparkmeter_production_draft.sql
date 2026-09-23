-- Provisions a non-routable production database import target.
-- No credentials, operation configuration, mappings, or write capability is seeded.

begin;

insert into public.oem_installations (
  id,
  tenant_id,
  oem_id,
  adapter_version_id,
  environment,
  display_name,
  base_url,
  status,
  station_scope_mode,
  config_version
)
values (
  '53f12390-74f7-40b3-b1db-e907c256986d',
  'd43a9029-8002-4015-a272-b9c835c8909f',
  'e1532892-e09d-44f9-a9cb-b99b5c9ebecf',
  null,
  'production',
  'ACOB Lighting Technology Limited Production',
  'https://www.sparkmeter.cloud',
  'draft',
  'explicit',
  1
)
on conflict (tenant_id, display_name) do nothing;

do $validated_installation$
begin
  if not exists (
    select 1
    from public.oem_installations
    where id = '53f12390-74f7-40b3-b1db-e907c256986d'
      and tenant_id = 'd43a9029-8002-4015-a272-b9c835c8909f'
      and oem_id = 'e1532892-e09d-44f9-a9cb-b99b5c9ebecf'
      and adapter_version_id is null
      and environment = 'production'
      and display_name = 'ACOB Lighting Technology Limited Production'
      and base_url = 'https://www.sparkmeter.cloud'
      and status = 'draft'
      and station_scope_mode = 'explicit'
      and config_version = 1
  ) then
    raise exception 'Conflicting ACOB SparkMeter production-draft installation identity';
  end if;
end
$validated_installation$;

insert into public.oem_capability_manifests (
  oem_installation_id,
  revision,
  capabilities
)
values (
  '53f12390-74f7-40b3-b1db-e907c256986d',
  1,
  '{"inventory_reads_observed":true,"write_operations_certified":false,"production_activation_authorized":false,"configured_meter_owner_count":3072,"unclassified_customer_delta":39}'::jsonb
)
on conflict (oem_installation_id, revision) do nothing;

insert into public.oem_config_revisions (
  oem_installation_id,
  revision,
  configuration,
  configuration_checksum
)
values (
  '53f12390-74f7-40b3-b1db-e907c256986d',
  1,
  '{"authority":"Alexander Obiechina","environment":"production","installation_slug":"acob-lighting-production","organization_id":"64bfd8cd-d361-4368-98c9-c0ea3730559d","portfolio_id":"64bfd8cd-d361-4368-98c9-c0ea3730559d","production_activation_authorized":false,"write_operations_certified":false}'::jsonb,
  'a4c9373c383994580d24c516dce34c32ebbd2281bf0c28427a431c0f12713982'
)
on conflict (oem_installation_id, revision) do nothing;

commit;

notify pgrst, 'reload schema';
