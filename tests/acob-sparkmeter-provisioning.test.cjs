"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase", "migrations", "20260918120000_acob_sparkmeter_sandbox_provisioning.sql");
const rollbackPath = path.join(root, "supabase", "rollbacks", "20260918120000_acob_sparkmeter_sandbox_provisioning.rollback.sql");

assert(fs.existsSync(migrationPath), "missing ACOB SparkMeter provisioning migration");
assert(fs.existsSync(rollbackPath), "missing ACOB SparkMeter provisioning rollback");

const migration = fs.readFileSync(migrationPath, "utf8").toLowerCase();
const rollback = fs.readFileSync(rollbackPath, "utf8").toLowerCase();

assert(migration.includes("'unsupported'"), "uncertified vending must remain representable");
assert(migration.includes("'acob-lighting'"), "confirmed tenant slug missing");
assert(migration.includes("'acob lighting technology limited'"), "confirmed installation name missing");
assert(migration.includes("alexander obiechina"), "ownership authority evidence missing");
assert(migration.includes("'sandbox'"), "sandbox environment missing");
assert(migration.includes("'https://www.sparkmeter.cloud'"), "observed SparkMeter base URL missing");
assert(migration.includes("'draft'"), "uncertified installation must remain draft");
assert(migration.includes('"write_operations_certified": false'), "write operations must fail closed");
assert(migration.includes('"production_activation_authorized": false'), "production activation must remain blocked");
assert(migration.includes('"configured_meter_owner_count": 3072'), "verified owner count missing");
assert(migration.includes('"corrected_unassigned_meter_count": 1365'), "corrected unassigned count missing");
assert(migration.includes('"unclassified_customer_delta": 39'), "unresolved aggregate delta missing");
assert(!migration.includes("insert into public.oem_installation_credentials"), "plaintext credentials must never enter migrations");
assert(!migration.includes("encrypted_secret_bundle"), "credential ciphertext requires separate provisioning");
assert(!migration.includes("'production'"), "production installation must not be provisioned");
assert(!/values\s*\([^;]*'active'/s.test(migration), "draft resources must not activate");

assert(rollback.includes("manual rollback review required"), "rollback must require operator review");
assert(rollback.includes("delete from public.oem_installations"), "installation rollback missing");
assert(rollback.includes("delete from public.tenants"), "tenant rollback missing");
assert(rollback.includes("delete from public.oem_manufacturers"), "manufacturer rollback missing");
assert(!rollback.includes("drop table"), "provisioning rollback must preserve shared tables");

console.log(JSON.stringify({ status: "ACOB SparkMeter provisioning contract passed" }, null, 2));
