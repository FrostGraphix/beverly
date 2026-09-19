"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migrationName = "20260918100000_vendor_organization_status_alignment.sql";
const migrationPath = path.join(root, "supabase", "migrations", migrationName);

assert.ok(fs.existsSync(migrationPath), `${migrationName} must exist`);

const migration = fs.readFileSync(migrationPath, "utf8");

assert.match(
  migration,
  /update public\.vendor_organizations\s+set status = 'pending'\s+where status = 'pending_review'/i,
  "legacy pending_review vendors must become pending"
);
assert.match(
  migration,
  /check\s*\(status in \('pending', 'approved', 'suspended', 'frozen', 'closed', 'rejected'\)\)/i,
  "the live vendor status constraint must accept the canonical pending status"
);
assert.doesNotMatch(
  migration,
  /check\s*\([^;]*pending_review/i,
  "the repaired constraint must not preserve two pending states"
);
assert.match(
  migration,
  /notify pgrst, 'reload schema'/i,
  "PostgREST must reload the repaired schema"
);

console.log("vendor creation status alignment contract passed");
