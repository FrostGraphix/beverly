"use strict";

const assert = require("assert");
const { resolveImportConnectionString, resolveImportTarget } = require("../tools/import-sparkmeter-sandbox.cjs");

const sandboxTarget = resolveImportTarget([]);
assert.strictEqual(sandboxTarget.environment, "sandbox");
assert.strictEqual(sandboxTarget.connectionEnvironmentVariable, "OEM_RESTORE_POOLER_DB_URL");

assert.throws(
  () => resolveImportTarget(["--production"]),
  /requires --apply/i,
  "production import planning must not select production"
);

const productionTarget = resolveImportTarget(["--apply", "--production"]);
assert.strictEqual(productionTarget.environment, "production");
assert.strictEqual(productionTarget.status, "draft");
assert.strictEqual(productionTarget.connectionEnvironmentVariable, "OEM_PRODUCTION_POOLER_DB_URL");
assert.strictEqual(productionTarget.installationId, "53f12390-74f7-40b3-b1db-e907c256986d");
assert.strictEqual(productionTarget.manufacturerId, "e1532892-e09d-44f9-a9cb-b99b5c9ebecf");

assert.strictEqual(
  resolveImportConnectionString(productionTarget, { SUPABASE_DB_URL: "postgresql://production.example.test/postgres" }),
  "postgresql://production.example.test/postgres",
  "production import may use the explicit linked production URL fallback"
);
assert.throws(
  () => resolveImportConnectionString(productionTarget, {}),
  /OEM_PRODUCTION_POOLER_DB_URL/i,
  "production import must fail closed without an approved database URL"
);

console.log(JSON.stringify({ status: "SparkMeter production import target contract passed" }, null, 2));
