"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase", "migrations", "20260915120000_oem_installation_control_plane.sql");
const rollbackPath = path.join(root, "supabase", "rollbacks", "20260915120000_oem_installation_control_plane.rollback.sql");
const linksPath = path.join(root, "supabase", "migrations", "20260915130000_oem_installation_operational_links.sql");
const linksRollbackPath = path.join(root, "supabase", "rollbacks", "20260915130000_oem_installation_operational_links.rollback.sql");
const commandsPath = path.join(root, "supabase", "migrations", "20260915140000_oem_command_foundation.sql");
const commandsRollbackPath = path.join(root, "supabase", "rollbacks", "20260915140000_oem_command_foundation.rollback.sql");

assert(fs.existsSync(migrationPath), "missing installation migration");
assert(fs.existsSync(rollbackPath), "missing reviewed rollback script");
assert(fs.existsSync(linksPath), "missing operational link migration");
assert(fs.existsSync(linksRollbackPath), "missing operational link rollback");
assert(fs.existsSync(commandsPath), "missing command foundation migration");
assert(fs.existsSync(commandsRollbackPath), "missing command foundation rollback");

const migration = fs.readFileSync(migrationPath, "utf8").toLowerCase();
const rollback = fs.readFileSync(rollbackPath, "utf8").toLowerCase();
const links = fs.readFileSync(linksPath, "utf8").toLowerCase();
const linksRollback = fs.readFileSync(linksRollbackPath, "utf8").toLowerCase();
const commands = fs.readFileSync(commandsPath, "utf8").toLowerCase();
const commandsRollback = fs.readFileSync(commandsRollbackPath, "utf8").toLowerCase();

for (const table of [
  "tenants",
  "oem_adapter_versions",
  "oem_installations",
  "oem_installation_credentials",
  "oem_operation_configs",
  "oem_capability_manifests",
  "oem_config_revisions",
  "external_resource_mappings",
  "oem_sync_cursors"
]) {
  assert(migration.includes(`create table if not exists public.${table}`), `missing ${table}`);
  assert(migration.includes(`alter table public.${table} enable row level security`), `missing ${table} RLS`);
  assert(migration.includes(`alter table public.${table} force row level security`), `missing ${table} forced RLS`);
}

assert(migration.includes("unique (tenant_id, display_name)"), "installation names must be tenant-scoped");
assert(migration.includes("unique (oem_installation_id, resource_type, external_id)"), "external identities must be installation-scoped");
assert(migration.includes("check (status in ('draft', 'active', 'suspended', 'retired'))"), "installation lifecycle missing");
assert(migration.includes("check (environment in ('sandbox', 'production'))"), "installation environment missing");
assert(migration.includes("auth.role() = ''service_role''"), "service-role policy missing");
assert(!migration.includes("encrypted_bearer_token"), "legacy credential fields must not spread");
assert(!migration.includes("insert into public.tenants"), "tenant ownership must not be guessed");
assert(!migration.includes("insert into public.oem_installations"), "installation ownership must not be guessed");
assert(rollback.includes("refuses automatic execution"), "rollback must require operator review");
assert(rollback.includes("drop table if exists public.oem_installations"), "rollback must cover installations");

for (const table of [
  "purchase_orders",
  "meter_purchase_orders",
  "customer_meters",
  "daily_meter_readings",
  "daily_meter_raw_duplicates",
  "daily_meter_deltas",
  "meter_consumption_aggregates",
  "station_meter_read_rollups",
  "consumption_aggregates",
  "consumption_sync_station_state",
  "archive_reports",
  "meter_token_overrides",
  "sgc_token_rules"
]) {
  assert(
    links.includes(`alter table if exists public.${table} add column if not exists oem_installation_id uuid`),
    `missing nullable installation link: ${table}`
  );
  assert(
    linksRollback.includes(`alter table if exists public.${table} drop column if exists oem_installation_id`),
    `missing installation link rollback: ${table}`
  );
}

assert(!/oem_installation_id uuid\s+not null/.test(links), "operational links must remain nullable");
assert(!/update\s+public\./.test(links), "ownership backfill must remain separate");
assert(!/drop\s+(constraint|column|table)/.test(links), "expand migration must remain additive");
assert(linksRollback.includes("refuses automatic execution"), "link rollback must require operator review");

for (const table of [
  "oem_commands",
  "oem_command_attempts",
  "oem_raw_events",
  "oem_webhook_events",
  "outbox_events",
  "oem_health_snapshots"
]) {
  assert(commands.includes(`create table if not exists public.${table}`), `missing ${table}`);
  assert(commands.includes(`alter table public.${table} force row level security`), `missing forced RLS: ${table}`);
  assert(commandsRollback.includes(`drop table if exists public.${table}`), `missing command rollback: ${table}`);
}

assert(commands.includes("unique (oem_installation_id, operation_key, idempotency_key)"), "command idempotency must be installation-scoped");
assert(commands.includes("'pending', 'leased', 'submitted', 'succeeded', 'failed', 'unknown', 'manual_review', 'cancelled'"), "recoverable command states missing");
assert(commands.includes("request_fingerprint text not null"), "request fingerprint missing");
assert(commands.includes("raw_response_reference text"), "secured evidence reference missing");
assert(commands.includes("unique (oem_installation_id, event_id)"), "webhook replay protection missing");
assert(commands.includes("unique (aggregate_type, aggregate_id, event_type, idempotency_key)"), "outbox deduplication missing");
assert(commandsRollback.includes("refuses automatic execution"), "command rollback must require operator review");

console.log(JSON.stringify({ status: "OEM installation migration contract passed" }, null, 2));
