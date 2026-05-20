"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260518153000_vendor_onboarding_schema_alignment.sql"),
  "utf8"
);
const service = fs.readFileSync(path.join(root, "backend/wallet/src/services/vendor-onboarding.ts"), "utf8");

for (const table of [
  "vendor_organizations",
  "vendor_users",
  "wallets",
  "vendor_applications",
  "wallet_audit_log",
  "wallet_security_events"
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`), `missing ${table}`);
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `missing ${table} RLS`);
}

for (const column of [
  "legal_name",
  "trading_name",
  "contact_email",
  "contact_phone",
  "operating_stations",
  "daily_limit_minor",
  "approved_by"
]) {
  assert.match(migration, new RegExp(column), `missing vendor organization column ${column}`);
  assert.match(service, new RegExp(column), `service should write ${column}`);
}

assert.match(migration, /status in \('approved', 'suspended', 'frozen', 'closed'/, "vendor status check must allow approved");
assert.match(migration, /unique \(owner_type, owner_id\)/, "wallets should be unique by owner");
assert.match(migration, /auth_user_id uuid not null references auth\.users/, "vendor users must link auth users");

console.log(JSON.stringify({
  status: "vendor onboarding schema contract passed",
  checks: 17
}, null, 2));
