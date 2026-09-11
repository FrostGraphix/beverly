"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260910120000_consumption_sync_governance.sql"
);

assert.equal(fs.existsSync(migrationPath), true, "consumption governance migration must exist");
const sql = fs.readFileSync(migrationPath, "utf8");

assert.match(sql, /create table if not exists public\.consumption_sync_runs/i);
assert.match(sql, /create table if not exists public\.consumption_sync_station_state/i);
assert.match(sql, /create or replace function public\.claim_consumption_sync_station/i);
assert.match(sql, /for update skip locked/i);
assert.match(sql, /create or replace function public\.consumption_database_usage/i);
assert.match(sql, /pg_database_size\(current_database\(\)\)/i);
assert.match(sql, /create or replace function public\.archive_reports_summary/i);
assert.match(sql, /'coverageRange'/i);
assert.match(sql, /min\(covers_from\)/i);
assert.match(sql, /max\(covers_to\)/i);
assert.match(sql, /alter table public\.consumption_sync_runs enable row level security/i);
assert.match(sql, /revoke all on function public\.claim_consumption_sync_station/i);

console.log("consumption sync governance passed");
