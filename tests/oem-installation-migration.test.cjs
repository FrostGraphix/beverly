"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase", "migrations", "20260915120000_oem_installation_control_plane.sql");
const rollbackPath = path.join(root, "supabase", "rollbacks", "20260915120000_oem_installation_control_plane.rollback.sql");

assert(fs.existsSync(migrationPath), "missing installation migration");
assert(fs.existsSync(rollbackPath), "missing reviewed rollback script");

const migration = fs.readFileSync(migrationPath, "utf8").toLowerCase();
const rollback = fs.readFileSync(rollbackPath, "utf8").toLowerCase();

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

console.log(JSON.stringify({ status: "OEM installation migration contract passed" }, null, 2));
