"use strict";

// Guards supabase/migrations going forward:
//  1. Unique version prefixes (Supabase CLI requires them).
//  2. Full YYYYMMDDHHMMSS version format.
//  3. Idempotent DDL (create table must use IF NOT EXISTS).
// Applied migrations that already violate these are grandfathered below —
// never rename or edit an applied migration to satisfy this check.

const fs = require("fs");
const path = require("path");

const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");

// Applied before this guard existed. Do not extend this list.
const grandfathered = new Set([
  "20260708_vapt_security_remediation.sql",
  "20260709_vapt_phase2_hardening.sql",
  "20260714120000_notifications_legacy_compatibility.sql",
  "20260714120000_rename_vendor_manager_role.sql",
  "20260518100000_meter_purchase_orders.sql",
  "20260518110000_fraud_risk_engine.sql",
  "20260518120000_operations_hardening.sql",
  "20260518130000_compliance_launch.sql",
  "20260525130000_wallet_support_system.sql"
]);

const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
const problems = [];
const seenVersions = new Map();

for (const file of files) {
  const version = file.split("_")[0];
  const skipChecks = grandfathered.has(file);

  if (!skipChecks && !/^\d{14}$/.test(version)) {
    problems.push(`${file}: version must be YYYYMMDDHHMMSS`);
  }

  if (seenVersions.has(version) && !(grandfathered.has(file) && grandfathered.has(seenVersions.get(version)))) {
    problems.push(`${file}: duplicate version with ${seenVersions.get(version)}`);
  }
  seenVersions.set(version, file);

  if (!skipChecks) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const createTables = sql.match(/create\s+table\s+(?!if\s+not\s+exists)[a-z_."]+/gi) || [];
    for (const statement of createTables) {
      problems.push(`${file}: non-idempotent "${statement.trim()}" — use CREATE TABLE IF NOT EXISTS`);
    }
  }
}

if (problems.length) {
  console.error(JSON.stringify({ status: "migration-hygiene-failed", problems }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "migration-hygiene-passed", migrations: files.length }, null, 2));
