"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase", "migrations", "20260924150000_sparkmeter_production_canary_guard.sql");
const rollbackPath = path.join(root, "supabase", "rollbacks", "20260924150000_sparkmeter_production_canary_guard.rollback.sql");

assert(fs.existsSync(migrationPath), "missing SparkMeter canary guard migration");
assert(fs.existsSync(rollbackPath), "missing SparkMeter canary guard rollback");

const migration = fs.readFileSync(migrationPath, "utf8").toLowerCase();
const rollback = fs.readFileSync(rollbackPath, "utf8").toLowerCase();

assert(migration.includes("create table if not exists public.oem_canary_authorizations"), "canary authorization table missing");
assert(migration.includes("remaining_uses = 1"), "single-use authorization guard missing");
assert(migration.includes("write_contract_acknowledged"), "write-contract acknowledgement missing");
assert(migration.includes("for update skip locked"), "atomic authorization claim missing");
assert(!migration.includes("oem_canary_authorizations authorization"), "reserved authorization alias is unsafe");
assert(migration.includes("grant execute on function public.claim_oem_canary_authorization"), "service-role claim grant missing");
assert(!migration.includes("owner_consent"), "owner consent must not become a runtime gate");
assert(rollback.includes("drop function if exists public.claim_oem_canary_authorization"), "claim rollback missing");
assert(rollback.includes("drop table if exists public.oem_canary_authorizations"), "authorization rollback missing");

console.log(JSON.stringify({ status: "SparkMeter production canary guard contract passed" }, null, 2));
