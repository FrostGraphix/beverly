-- Explicitly authorized ACOB Lighting sandbox provisioning.
-- No credential, write operation, production activation, or ownership backfill occurs here.

begin;

alter table public.oem_manufacturers
  drop constraint if exists oem_manufacturers_vending_strategy_check;

alter table public.oem_manufacturers
  add constraint oem_manufacturers_vending_strategy_check
  check (vending_strategy in ('sts_token', 'direct_credit', 'unsupported'));

insert into public.oem_manufacturers (
  id,
  slug,
  display_name,
  status,
  is_seed_default,
  capabilities,
  vending_strategy
)
values (
  'e1532892-e09d-44f9-a9cb-b99b5c9ebecf',
  'sparkmeter',
  'SparkMeter',
  'draft',
  false,
  '{"inventory_reads_observed": true, "write_operations_certified": false, "production_activation_authorized": false}'::jsonb,
  'unsupported'
)
on conflict (slug) do nothing;

insert into public.tenants (
  id,
  slug,
  display_name,
  status
)
values (
  'd43a9029-8002-4015-a272-b9c835c8909f',
  'acob-lighting',
  'ACOB Lighting',
  'draft'
)
on conflict (slug) do nothing;

do $validated_identity$
begin
  if not exists (
    select 1
    from public.oem_manufacturers
    where id = 'e1532892-e09d-44f9-a9cb-b99b5c9ebecf'
      and slug = 'sparkmeter'
      and display_name = 'SparkMeter'
      and status = 'draft'
      and vending_strategy = 'unsupported'
  ) then
    raise exception 'Conflicting SparkMeter manufacturer identity';
  end if;

  if not exists (
    select 1
    from public.tenants
    where id = 'd43a9029-8002-4015-a272-b9c835c8909f'
      and slug = 'acob-lighting'
      and display_name = 'ACOB Lighting'
      and status = 'draft'
  ) then
    raise exception 'Conflicting ACOB Lighting tenant identity';
  end if;
end
$validated_identity$;

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
  'ed0eefb2-f017-43ad-a52e-82169684803b',
  'd43a9029-8002-4015-a272-b9c835c8909f',
  'e1532892-e09d-44f9-a9cb-b99b5c9ebecf',
  null,
  'sandbox',
  'ACOB Lighting Technology Limited',
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
    where id = 'ed0eefb2-f017-43ad-a52e-82169684803b'
      and tenant_id = 'd43a9029-8002-4015-a272-b9c835c8909f'
      and oem_id = 'e1532892-e09d-44f9-a9cb-b99b5c9ebecf'
      and adapter_version_id is null
      and environment = 'sandbox'
      and display_name = 'ACOB Lighting Technology Limited'
      and base_url = 'https://www.sparkmeter.cloud'
      and status = 'draft'
      and station_scope_mode = 'explicit'
      and config_version = 1
  ) then
    raise exception 'Conflicting ACOB SparkMeter installation identity';
  end if;
end
$validated_installation$;

insert into public.oem_capability_manifests (
  oem_installation_id,
  revision,
  capabilities
)
values (
  'ed0eefb2-f017-43ad-a52e-82169684803b',
  1,
  '{"inventory_reads_observed": true, "write_operations_certified": false, "production_activation_authorized": false, "configured_meter_owner_count": 3072, "corrected_unassigned_meter_count": 1365, "unclassified_customer_delta": 39}'::jsonb
)
on conflict (oem_installation_id, revision) do nothing;

insert into public.oem_config_revisions (
  oem_installation_id,
  revision,
  configuration,
  configuration_checksum
)
values (
  'ed0eefb2-f017-43ad-a52e-82169684803b',
  1,
  '{"authority":"Alexander Obiechina","credential_source":"environment","environment":"sandbox","installation_slug":"acob-lighting","organization_id":"64bfd8cd-d361-4368-98c9-c0ea3730559d","portfolio_id":"64bfd8cd-d361-4368-98c9-c0ea3730559d","production_activation_authorized":false,"write_operations_certified":false}'::jsonb,
  '7196dfc5b914911377f1068127d68b644b59345449206ff3987a7b7ba94f827d'
)
on conflict (oem_installation_id, revision) do nothing;

commit;

notify pgrst, 'reload schema';
