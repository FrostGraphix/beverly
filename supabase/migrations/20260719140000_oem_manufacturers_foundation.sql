-- OEM manufacturer registry foundation.
-- Introduces the multi-OEM abstraction (Calinmeter, Sparkmeter, Ihemeter, ...) as a
-- first-class tenant entity, following the same shape as vendor_organizations.
-- Access is mediated entirely by the CRM proxy (service role) — no public client
-- policies, matching the existing meter_token_overrides/sgc_token_rules convention.

create table if not exists public.oem_manufacturers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  logo_storage_path text not null default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'disabled')),
  is_seed_default boolean not null default false,
  capabilities jsonb not null default '{}'::jsonb,
  vending_strategy text not null default 'sts_token' check (vending_strategy in ('sts_token', 'direct_credit')),
  rate_limit_window_ms integer,
  rate_limit_max_requests integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oem_endpoint_configs (
  oem_id uuid not null references public.oem_manufacturers(id) on delete cascade,
  logical_key text not null,
  upstream_path text not null,
  method text not null default 'GET' check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  casing_variant text not null default '',
  request_field_map jsonb not null default '{}'::jsonb,
  response_field_map jsonb not null default '{}'::jsonb,
  payload_shape jsonb not null default '{}'::jsonb,
  pagination_style text not null default 'none' check (pagination_style in ('pageNumber', 'offset', 'none')),
  requires_live_read boolean not null default false,
  is_write_override boolean,
  adapter_fn_name text not null default '',
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (oem_id, logical_key)
);

-- Encrypted at rest by the caller (backend/src/services/oem-credential-crypto.js,
-- AES-256-GCM). This table only ever stores ciphertext — see that module for why
-- app-level envelope encryption was chosen over Supabase Vault (the proxy reads
-- these on a hot per-request path; Vault's per-decrypt round trip would add
-- latency there).
create table if not exists public.oem_credentials (
  oem_id uuid primary key references public.oem_manufacturers(id) on delete cascade,
  auth_strategy text not null default 'bearer_static'
    check (auth_strategy in ('bearer_static', 'bearer_login', 'api_key_header', 'oauth2_client_credentials')),
  base_url text not null default '',
  encrypted_bearer_token text not null default '',
  encrypted_client_secret text not null default '',
  encrypted_username text not null default '',
  encrypted_password text not null default '',
  token_endpoint_path text not null default '',
  encryption_key_version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

-- Drives each OEM card's "installed in N communities" count. "Community" here is
-- the existing station/site concept — confirmed via audit that no separate
-- community domain entity exists anywhere else in the schema.
create table if not exists public.oem_station_mappings (
  oem_id uuid not null references public.oem_manufacturers(id) on delete cascade,
  station_id text not null,
  community_label text not null default '',
  created_at timestamptz not null default now(),
  primary key (oem_id, station_id)
);

create index if not exists oem_manufacturers_status_idx on public.oem_manufacturers(status);
create index if not exists oem_endpoint_configs_oem_idx on public.oem_endpoint_configs(oem_id);
create index if not exists oem_station_mappings_oem_idx on public.oem_station_mappings(oem_id);

alter table public.oem_manufacturers enable row level security;
alter table public.oem_endpoint_configs enable row level security;
alter table public.oem_credentials enable row level security;
alter table public.oem_station_mappings enable row level security;

-- =============================================================================
-- Cross-cutting identity namespacing (see plan §1): retrofit a nullable oem_id
-- column onto every existing table that keys or scopes by a bare meter_id/
-- station_id string, so a second OEM sharing a station/meter identifier with
-- Calinmeter cannot silently collide. This is schema-only and purely additive —
-- primary keys/unique constraints stay as-is for now (existing single-OEM data
-- keeps working unchanged); tightening those into composite (oem_id, *) keys is
-- explicitly deferred until immediately before a second real OEM is onboarded
-- (Phase 5), not attempted here.
-- =============================================================================

-- Seed the Calinmeter row first so the backfill below has something to point at.
-- The full seed (encrypted credentials, ~153 endpoint configs, station mappings)
-- is done by backend/scripts/seed-calinmeter-oem.js, which upserts this same row
-- by slug and preserves this id.
insert into public.oem_manufacturers (slug, display_name, status, is_seed_default, capabilities, vending_strategy)
values ('calinmeter', 'Calinmeter', 'active', true, '{}'::jsonb, 'sts_token')
on conflict (slug) do nothing;

alter table public.account_bindings add column if not exists oem_id uuid references public.oem_manufacturers(id);
update public.account_bindings set oem_id = (select id from public.oem_manufacturers where slug = 'calinmeter')
where oem_id is null;

alter table public.purchase_orders add column if not exists oem_id uuid references public.oem_manufacturers(id);
update public.purchase_orders set oem_id = (select id from public.oem_manufacturers where slug = 'calinmeter')
where oem_id is null;

alter table public.meter_token_overrides add column if not exists oem_id uuid references public.oem_manufacturers(id);
update public.meter_token_overrides set oem_id = (select id from public.oem_manufacturers where slug = 'calinmeter')
where oem_id is null;

alter table public.sgc_token_rules add column if not exists oem_id uuid references public.oem_manufacturers(id);
update public.sgc_token_rules set oem_id = (select id from public.oem_manufacturers where slug = 'calinmeter')
where oem_id is null;

alter table public.station_meter_read_rollups add column if not exists oem_id uuid references public.oem_manufacturers(id);
update public.station_meter_read_rollups set oem_id = (select id from public.oem_manufacturers where slug = 'calinmeter')
where oem_id is null;

alter table public.consumption_aggregates add column if not exists oem_id uuid references public.oem_manufacturers(id);
update public.consumption_aggregates set oem_id = (select id from public.oem_manufacturers where slug = 'calinmeter')
where oem_id is null;

create index if not exists account_bindings_oem_idx on public.account_bindings(oem_id);
create index if not exists purchase_orders_oem_idx on public.purchase_orders(oem_id);
create index if not exists station_meter_read_rollups_oem_idx on public.station_meter_read_rollups(oem_id);
create index if not exists consumption_aggregates_oem_idx on public.consumption_aggregates(oem_id);

-- Service-role-only access (mediated by the CRM proxy / Node backend). No public
-- client (authenticated/anon) policies are defined, matching meter_token_overrides.
drop policy if exists "service role manages oem manufacturers" on public.oem_manufacturers;
create policy "service role manages oem manufacturers"
  on public.oem_manufacturers for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages oem endpoint configs" on public.oem_endpoint_configs;
create policy "service role manages oem endpoint configs"
  on public.oem_endpoint_configs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages oem credentials" on public.oem_credentials;
create policy "service role manages oem credentials"
  on public.oem_credentials for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages oem station mappings" on public.oem_station_mappings;
create policy "service role manages oem station mappings"
  on public.oem_station_mappings for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
