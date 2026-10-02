"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase", "migrations", "20260918200000_oem_api_key_pair.sql");
const rollbackPath = path.join(root, "supabase", "rollbacks", "20260918200000_oem_api_key_pair.rollback.sql");

assert(fs.existsSync(migrationPath), "missing API-key pair migration");
assert(fs.existsSync(rollbackPath), "missing API-key pair rollback");

const migration = fs.readFileSync(migrationPath, "utf8").toLowerCase();
const rollback = fs.readFileSync(rollbackPath, "utf8").toLowerCase();

assert(migration.includes("'api_key_pair'"), "dual-header strategy missing");
assert(migration.includes("not valid"), "expand-only constraint guard missing");
assert(rollback.includes("manual rollback review required"), "rollback review guard missing");
assert(rollback.includes("auth_strategy = 'api_key_pair'"), "rollback dependency guard missing");

console.log(JSON.stringify({ status: "OEM API-key pair migration contract passed" }, null, 2));
