-- Reviewed emergency rollback only.
-- This script refuses automatic execution.
-- Verify no mapping, credential, command, or operational row uses this installation.
-- Replace the guard manually afterwards.

do $rollback_guard$
begin
  raise exception 'Manual rollback review required';
end
$rollback_guard$;

begin;

do $dependency_guard$
begin
  if exists (
    select 1 from public.oem_installation_credentials
    where oem_installation_id = 'ed0eefb2-f017-43ad-a52e-82169684803b'
    union all
    select 1 from public.oem_operation_configs
    where oem_installation_id = 'ed0eefb2-f017-43ad-a52e-82169684803b'
    union all
    select 1 from public.external_resource_mappings
    where oem_installation_id = 'ed0eefb2-f017-43ad-a52e-82169684803b'
    union all
    select 1 from public.oem_sync_cursors
    where oem_installation_id = 'ed0eefb2-f017-43ad-a52e-82169684803b'
    union all
    select 1 from public.oem_commands
    where oem_installation_id = 'ed0eefb2-f017-43ad-a52e-82169684803b'
  ) then
    raise exception 'ACOB SparkMeter installation has dependent operational data';
  end if;
end
$dependency_guard$;

delete from public.oem_config_revisions
where oem_installation_id = 'ed0eefb2-f017-43ad-a52e-82169684803b';

delete from public.oem_capability_manifests
where oem_installation_id = 'ed0eefb2-f017-43ad-a52e-82169684803b';

delete from public.oem_installations
where id = 'ed0eefb2-f017-43ad-a52e-82169684803b'
  and status = 'draft';

delete from public.tenants
where id = 'd43a9029-8002-4015-a272-b9c835c8909f'
  and status = 'draft';

delete from public.oem_manufacturers
where id = 'e1532892-e09d-44f9-a9cb-b99b5c9ebecf'
  and status = 'draft';

do $unsupported_guard$
begin
  if exists (
    select 1 from public.oem_manufacturers
    where vending_strategy = 'unsupported'
  ) then
    raise exception 'Another unsupported OEM requires the expanded constraint';
  end if;
end
$unsupported_guard$;

alter table public.oem_manufacturers
  drop constraint if exists oem_manufacturers_vending_strategy_check;

alter table public.oem_manufacturers
  add constraint oem_manufacturers_vending_strategy_check
  check (vending_strategy in ('sts_token', 'direct_credit'));

commit;

notify pgrst, 'reload schema';
