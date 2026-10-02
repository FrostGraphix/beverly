-- Reviewed emergency rollback only.
-- This script refuses automatic execution.
-- Verify every table remains empty first.
-- Replace the guard manually afterwards.

do $rollback_guard$
begin
  raise exception 'Manual rollback review required';
end
$rollback_guard$;

begin;
drop table if exists public.oem_sync_cursors;
drop table if exists public.external_resource_mappings;
drop table if exists public.oem_config_revisions;
drop table if exists public.oem_capability_manifests;
drop table if exists public.oem_operation_configs;
drop table if exists public.oem_installation_credentials;
drop table if exists public.oem_installations;
drop table if exists public.oem_adapter_versions;
drop table if exists public.tenants;
commit;
