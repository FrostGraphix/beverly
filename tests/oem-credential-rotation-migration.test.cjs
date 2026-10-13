"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase/migrations/20261001120000_oem_credential_rotation.sql");
const rollbackPath = path.join(root, "supabase/rollbacks/20261001120000_oem_credential_rotation.rollback.sql");

assert(fs.existsSync(migrationPath), "missing credential rotation migration");
assert(fs.existsSync(rollbackPath), "missing credential rotation rollback");

const migration = fs.readFileSync(migrationPath, "utf8").toLowerCase();
const rollback = fs.readFileSync(rollbackPath, "utf8").toLowerCase();

assert.match(migration, /create or replace function public\.rotate_oem_installation_credentials/);
assert.match(migration, /encrypted_secret_bundle = p_expected_encrypted_secret_bundle/);
assert.match(migration, /encryption_key_version = p_expected_encryption_key_version/);
assert.match(migration, /encryption_key_version = p_new_encryption_key_version/);
assert.match(migration, /encrypted_secret_bundle = p_new_encrypted_secret_bundle/);
assert.match(migration, /updated_by = p_updated_by/);
assert.match(migration, /get diagnostics affected_rows = row_count/);
assert.match(migration, /revoke all on function public\.rotate_oem_installation_credentials/);
assert.match(migration, /grant execute on function public\.rotate_oem_installation_credentials[\s\S]*to service_role/);
assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/);
assert.match(rollback, /drop function if exists public\.rotate_oem_installation_credentials/);

console.log("OEM credential rotation migration contract passed");
