"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase", "migrations", "20260812145901_admin_vendor_balance_transfers.sql");
assert.ok(fs.existsSync(migrationPath), "vendor transfer migration must exist");
const sql = fs.readFileSync(migrationPath, "utf8").toLowerCase();

for (const contract of [
  "create table if not exists public.vendor_wallet_transfers",
  "create table if not exists public.wallet_rate_limit_counters",
  "alter table public.wallet_rate_limit_counters force row level security",
  "create or replace function public.fn_observe_wallet_rate_limit",
  "grant execute on function public.fn_observe_wallet_rate_limit",
  "alter table public.vendor_wallet_transfers enable row level security",
  "alter table public.vendor_wallet_transfers force row level security",
  "create or replace function public.fn_admin_transfer_vendor_balance",
  "create or replace function public.fn_preview_admin_vendor_balance_transfer",
  "security definer",
  "set search_path = ''",
  "order by id for update",
  "source and destination vendors must differ",
  "insufficient available balance",
  "idempotency key payload mismatch",
  "'vendor_transfer_debit'",
  "'vendor_transfer_credit'",
  "'refund_credit'",
  "recipient_type",
  "vendor_organization_id",
  "revoke all on function public.fn_admin_transfer_vendor_balance",
  "grant execute on function public.fn_admin_transfer_vendor_balance",
  "to service_role",
  "('developer', 'wallet.vendor_transfers.manage')",
  "('super-admin', 'wallet.vendor_transfers.manage')",
]) {
  assert.ok(sql.includes(contract), `missing migration contract: ${contract}`);
}

assert.ok(/revoke all on function public\.fn_admin_transfer_vendor_balance\([\s\S]*?from public, anon, authenticated/.test(sql), "transfer RPC must be unavailable to untrusted roles");
assert.ok(!sql.includes("using (true)"), "transfer migration must not add permissive RLS");
assert.ok((sql.match(/insert into public\.wallet_ledger_entries/g) || []).length >= 2, "transfer RPC must append both ledger legs");
assert.ok((sql.match(/insert into public\.notifications/g) || []).length >= 2, "transfer RPC must create both vendor inbox notifications");
assert.ok(!/insert into public\.roles\s*\(name,/.test(sql), "developer role must not write an unsupported legacy role enum");

console.log("vendor transfer migration contract passed");
