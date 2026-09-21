"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase", "migrations", "20260921120000_acob_sparkmeter_production_draft.sql");
const rollbackPath = path.join(root, "supabase", "rollbacks", "20260921120000_acob_sparkmeter_production_draft.rollback.sql");

assert(fs.existsSync(migrationPath), "missing ACOB SparkMeter production-draft migration");
assert(fs.existsSync(rollbackPath), "missing ACOB SparkMeter production-draft rollback");

const migration = fs.readFileSync(migrationPath, "utf8").toLowerCase();
const rollback = fs.readFileSync(rollbackPath, "utf8").toLowerCase();

assert(migration.includes("'acob lighting technology limited production'"), "production draft display name missing");
assert(migration.includes("'production'"), "production environment missing");
assert(migration.includes("'draft'"), "draft status missing");
assert(migration.includes('"write_operations_certified":false'), "write denial missing");
assert(migration.includes('"production_activation_authorized":false'), "activation denial missing");
assert(!migration.includes("oem_installation_credentials"), "credentials must not enter the production-draft migration");
assert(!migration.includes("external_resource_mappings"), "mappings must not enter the production-draft migration");
assert(rollback.includes("dependent operational data"), "rollback dependency guard missing");
assert(rollback.includes("delete from public.oem_installations"), "installation rollback missing");
assert(!rollback.includes("delete from public.tenants"), "rollback must retain the tenant");
assert(!rollback.includes("delete from public.oem_manufacturers"), "rollback must retain the manufacturer");

console.log(JSON.stringify({ status: "ACOB SparkMeter production-draft provisioning contract passed" }, null, 2));
