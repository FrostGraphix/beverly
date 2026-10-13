"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase", "migrations", "20260918130000_oem_endpoint_security.sql");
const rollbackPath = path.join(root, "supabase", "rollbacks", "20260918130000_oem_endpoint_security.rollback.sql");

assert(fs.existsSync(migrationPath), "missing endpoint security migration");
assert(fs.existsSync(rollbackPath), "missing endpoint security rollback");

const migration = fs.readFileSync(migrationPath, "utf8").toLowerCase();
const rollback = fs.readFileSync(rollbackPath, "utf8").toLowerCase();

assert(migration.includes("approved_hostnames"), "approved hostname allowlist missing");
assert(migration.includes("cardinality(approved_hostnames) > 0"), "active production allowlist guard missing");
assert(migration.includes("base_url ~ '^https://'"), "active production HTTPS guard missing");
assert(migration.includes("not valid"), "existing rows must avoid blocking validation scans");
assert(rollback.includes("manual rollback review required"), "rollback review guard missing");
assert(rollback.includes("drop column if exists approved_hostnames"), "allowlist rollback missing");

console.log(JSON.stringify({ status: "OEM endpoint security migration contract passed" }, null, 2));
