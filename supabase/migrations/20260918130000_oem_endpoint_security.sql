-- Expand-only endpoint security metadata.
-- Empty allowlists fail closed during runtime routing.

alter table public.oem_installations
  add column if not exists approved_hostnames text[] not null default '{}'::text[];

alter table public.oem_installations
  drop constraint if exists oem_installations_active_production_endpoint_check;

alter table public.oem_installations
  add constraint oem_installations_active_production_endpoint_check
  check (
    environment <> 'production'
    or status <> 'active'
    or (
      base_url ~ '^https://'
      and cardinality(approved_hostnames) > 0
    )
  ) not valid;

notify pgrst, 'reload schema';
