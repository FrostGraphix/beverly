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

  const requiredTables = [
    "roles",
    "users",
    "permissions",
    "audit_logs",
    "api_cache",
    "import_jobs",
    "export_jobs",
    "print_jobs",
    "write_confirmations"
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

  console.log(JSON.stringify({
    migrations: 4,
    tables: requiredTables.length + 2,
    buckets: 4,
    status: "supabase migrations passed"
  }, null, 2));
}

main();
