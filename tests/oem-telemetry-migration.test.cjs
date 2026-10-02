"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20261001150000_oem_telemetry.sql"), "utf8").toLowerCase();
const rollback = fs.readFileSync(path.join(root, "supabase/rollbacks/20261001150000_oem_telemetry.rollback.sql"), "utf8").toLowerCase();
const reads = fs.readFileSync(path.join(root, "supabase/migrations/20261001160000_oem_telemetry_reads.sql"), "utf8").toLowerCase();
const readsRollback = fs.readFileSync(path.join(root, "supabase/rollbacks/20261001160000_oem_telemetry_reads.rollback.sql"), "utf8").toLowerCase();

for (const table of ["oem_telemetry_readings", "oem_telemetry_quarantine"]) {
  assert(migration.includes(`create table if not exists public.${table}`), `missing ${table}`);
  assert(migration.includes(`alter table public.${table} force row level security`), `missing forced RLS: ${table}`);
}
assert.match(migration, /unique \(oem_installation_id, external_site_id, external_meter_id, reading_at, reading_type\)/);
assert.match(migration, /energy_interpretation text not null default 'provider_total_unknown_semantics'/);
assert.match(migration, /function public\.apply_oem_telemetry_page/);
assert.match(migration, /jsonb_array_length\(p_readings\) > 200/);
assert.match(migration, /status = 'active'/);
assert.match(migration, /'telemetry_' \|\| p_mode/);
assert.doesNotMatch(migration, /delete from public\.oem_telemetry/);
assert.match(rollback, /manual rollback review required/);
assert.match(reads, /function public\.list_authorized_oem_telemetry/);
assert.match(reads, /join public\.oem_tenant_memberships/);
assert.match(reads, /join public\.oem_actor_installation_access/);
assert.match(reads, /p_limit < 1 or p_limit > 100/);
assert.doesNotMatch(reads, /provider_payload/);
assert.match(readsRollback, /drop function if exists public\.list_authorized_oem_telemetry/);
console.log("OEM telemetry migration contract passed");
