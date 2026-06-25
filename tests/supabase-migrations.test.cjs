"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migrationsDir = path.join(root, "supabase", "migrations");

function readMigration(name) {
  return fs.readFileSync(path.join(migrationsDir, name), "utf8");
}

function main() {
  const schema = readMigration("20260505124500_crm_operational_storage.sql");
  const storage = readMigration("20260505125000_storage_buckets.sql");
  const snapshots = readMigration("20260507110000_operational_snapshots.sql");
  const dailyMeters = readMigration("20260508120000_daily_meter_readings.sql");
  const rawDuplicates = readMigration("20260516130000_daily_meter_raw_duplicates.sql");
  const hardening = readMigration("20260511150000_harden_role_permissions_rls.sql");
  const governance = readMigration("20260512100000_data_governance.sql");

  const requiredTables = [
    "roles",
    "users",
    "permissions",
    "audit_logs",
    "api_cache",
    "import_jobs",
    "export_jobs",
    "print_jobs",
    "write_confirmations",
    "account_bindings",
    "automation_deliveries"
  ];

  for (const table of requiredTables) {
    assert(
      schema.includes(`create table if not exists public.${table}`),
      `missing ${table} table`
    );
    assert(
      schema.includes(`alter table public.${table} enable row level security`),
      `missing ${table} RLS`
    );
  }

  for (const bucket of ["uploads", "imports", "exports", "receipts"]) {
    assert(storage.includes(`'${bucket}'`), `missing ${bucket} bucket`);
    assert(storage.includes(`bucket_id = '${bucket}'`), `missing ${bucket} policy`);
  }

  assert(schema.includes("jsonb not null"), "jsonb columns missing");
  assert(schema.includes("gen_random_uuid()"), "uuid defaults missing");
  assert(schema.includes("on conflict"), "idempotent seed missing");
  assert(
    snapshots.includes("create table if not exists public.operational_snapshots"),
    "missing operational snapshots table"
  );
  assert(
    snapshots.includes("alter table public.operational_snapshots enable row level security"),
    "missing operational snapshots RLS"
  );
  assert(snapshots.includes("unique(snapshot_key, scope_key)"), "missing snapshot uniqueness");
  assert(
    dailyMeters.includes("create table if not exists public.daily_meter_readings"),
    "missing daily meter readings table"
  );
  assert(
    dailyMeters.includes("unique(station_id, meter_id, reading_date)"),
    "missing daily meter uniqueness"
  );
  assert(
    dailyMeters.includes("alter table public.daily_meter_readings enable row level security"),
    "missing daily meter RLS"
  );
  assert(
    rawDuplicates.includes("create table if not exists public.daily_meter_raw_duplicates"),
    "missing raw duplicate readings table"
  );
  assert(
    rawDuplicates.includes("daily_meter_raw_duplicates_event_idx"),
    "missing raw duplicate event uniqueness"
  );
  assert(
    rawDuplicates.includes("alter table public.daily_meter_raw_duplicates enable row level security"),
    "missing raw duplicate RLS"
  );
  assert(hardening.includes("create or replace function public.normalized_role_key"), "missing normalized role function");
  assert(hardening.includes("create or replace function public.current_role_key"), "missing current role function");
  assert(hardening.includes("create or replace function public.current_station_id"), "missing current station function");
  assert(hardening.includes("create or replace function public.has_route_permission"), "missing route permission function");
  assert(hardening.includes("alter table public.users\n+add column if not exists station_id text;".replace("\n+","\n")), "missing users station_id column");
  for (const table of [...requiredTables, "operational_snapshots", "daily_meter_readings"]) {
    assert(hardening.includes(`alter table public.${table} force row level security;`), `missing forced RLS for ${table}`);
  }
  assert(hardening.includes('create policy "Users readable by self or super admins"'), "missing user self-read policy");
  assert(hardening.includes('create policy "Permissions managed by super admins"'), "missing permissions admin policy");
  assert(hardening.includes('create policy "Daily meter readings readable by station scope"'), "missing station scope policy");
  assert(hardening.includes('create policy "Operational snapshots readable by authenticated users"'), "missing snapshot read policy");
  assert(hardening.includes('create policy "Account bindings readable by permitted roles"'), "missing account binding policy");
  assert(hardening.includes('create policy "Automation deliveries readable by elevated roles"'), "missing automation delivery policy");
  assert(
    governance.includes("create table if not exists public.data_governance_runs"),
    "missing data governance runs table"
  );
  assert(governance.includes("cleanup_data_governance"), "missing cleanup function");

  console.log(JSON.stringify({
    migrations: 7,
    tables: requiredTables.length + 4,
    buckets: 4,
    status: "supabase migrations passed"
  }, null, 2));
}

main();
