-- Multi-tenant OEM control plane.
-- Expand-only: no legacy columns, constraints, or rows are changed.
-- Tenant and installation rows require explicit operator-owned provisioning.

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'suspended', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oem_adapter_versions (
  id uuid primary key default gen_random_uuid(),
  oem_id uuid not null references public.oem_manufacturers(id) on delete restrict,
  adapter_key text not null,
  version text not null,
  contract_version text not null,
  status text not null default 'draft' check (status in ('draft', 'certified', 'retired')),
  release_notes text not null default '',
  artifact_checksum text not null,
  created_at timestamptz not null default now(),
  unique (oem_id, adapter_key, version)
);

create table if not exists public.oem_installations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  oem_id uuid not null references public.oem_manufacturers(id) on delete restrict,
  adapter_version_id uuid references public.oem_adapter_versions(id) on delete restrict,
  environment text not null check (environment in ('sandbox', 'production')),
  display_name text not null,
  base_url text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'suspended', 'retired')),
  station_scope_mode text not null default 'explicit' check (station_scope_mode in ('explicit', 'all')),
  config_version bigint not null default 1 check (config_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, display_name)
);

create table if not exists public.oem_installation_credentials (
  oem_installation_id uuid primary key references public.oem_installations(id) on delete cascade,
  auth_strategy text not null check (auth_strategy in ('bearer_static', 'bearer_login', 'api_key_header', 'oauth2_client_credentials')),
  encrypted_secret_bundle text not null,
  encryption_key_version integer not null check (encryption_key_version > 0),
  token_endpoint text,
  token_expiry_policy jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.oem_operation_configs (
  id uuid primary key default gen_random_uuid(),
  oem_installation_id uuid not null references public.oem_installations(id) on delete cascade,
  operation_key text not null,
  revision bigint not null check (revision > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  method text not null check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  upstream_path text not null,
  mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (oem_installation_id, operation_key, revision)
);

create table if not exists public.oem_capability_manifests (
  oem_installation_id uuid not null references public.oem_installations(id) on delete cascade,
  revision bigint not null check (revision > 0),
  capabilities jsonb not null,
  created_at timestamptz not null default now(),
  primary key (oem_installation_id, revision)
);

create table if not exists public.oem_config_revisions (
  id uuid primary key default gen_random_uuid(),
  oem_installation_id uuid not null references public.oem_installations(id) on delete cascade,
  revision bigint not null check (revision > 0),
  configuration jsonb not null,
  configuration_checksum text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (oem_installation_id, revision)
);

create table if not exists public.external_resource_mappings (
  id uuid primary key default gen_random_uuid(),
  oem_installation_id uuid not null references public.oem_installations(id) on delete cascade,
  resource_type text not null check (resource_type in ('station', 'meter', 'customer', 'tariff', 'account', 'gateway', 'command')),
  internal_id uuid not null,
  external_id text not null,
  status text not null default 'active' check (status in ('active', 'quarantined', 'retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (oem_installation_id, resource_type, external_id),
  unique (oem_installation_id, resource_type, internal_id)
);

create table if not exists public.oem_sync_cursors (
  oem_installation_id uuid not null references public.oem_installations(id) on delete cascade,
  operation_key text not null,
  scope_key text not null default '',
  cursor jsonb not null default '{}'::jsonb,
  lease_owner text,
  lease_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (oem_installation_id, operation_key, scope_key)
);

create index if not exists oem_installations_tenant_status_idx
  on public.oem_installations (tenant_id, status);
create index if not exists external_resource_mappings_internal_idx
  on public.external_resource_mappings (resource_type, internal_id);

alter table public.tenants enable row level security;
alter table public.oem_adapter_versions enable row level security;
alter table public.oem_installations enable row level security;
alter table public.oem_installation_credentials enable row level security;
alter table public.oem_operation_configs enable row level security;
alter table public.oem_capability_manifests enable row level security;
alter table public.oem_config_revisions enable row level security;
alter table public.external_resource_mappings enable row level security;
alter table public.oem_sync_cursors enable row level security;

alter table public.tenants force row level security;
alter table public.oem_adapter_versions force row level security;
alter table public.oem_installations force row level security;
alter table public.oem_installation_credentials force row level security;
alter table public.oem_operation_configs force row level security;
alter table public.oem_capability_manifests force row level security;
alter table public.oem_config_revisions force row level security;
alter table public.external_resource_mappings force row level security;
alter table public.oem_sync_cursors force row level security;

do $policy$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenants', 'oem_adapter_versions', 'oem_installations',
    'oem_installation_credentials', 'oem_operation_configs',
    'oem_capability_manifests', 'oem_config_revisions',
    'external_resource_mappings', 'oem_sync_cursors'
  ] loop
    execute format('drop policy if exists "service role manages %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "service role manages %s" on public.%I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')',
      table_name,
      table_name
    );
  end loop;
end
$policy$;

revoke all on public.tenants, public.oem_adapter_versions, public.oem_installations,
  public.oem_installation_credentials, public.oem_operation_configs,
  public.oem_capability_manifests, public.oem_config_revisions,
  public.external_resource_mappings, public.oem_sync_cursors from anon, authenticated;
grant all on public.tenants, public.oem_adapter_versions, public.oem_installations,
  public.oem_installation_credentials, public.oem_operation_configs,
  public.oem_capability_manifests, public.oem_config_revisions,
  public.external_resource_mappings, public.oem_sync_cursors to service_role;

notify pgrst, 'reload schema';
