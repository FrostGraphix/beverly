"use strict";

const assert = require("assert");

process.env.LOCAL_DB_MODE = "memory";
const localDatabase = require("../backend/src/services/local-database");

localDatabase.resetForTests();
localDatabase.ensureDatabase();
localDatabase.cacheApiResponse({
  method: "POST",
  path: "/api/account/read",
  requestKey: "{}",
  status: 200,
  source: "live",
  body: {
    code: 0,
    result: {
      data: [{ customerId: "1001" }]
    }
  }
});
localDatabase.recordAuditLog({
  method: "POST",
  path: "/api/account/read",
  outcome: "success",
  statusCode: 200,
  proxySource: "live",
  details: {}
});
localDatabase.recordWriteConfirmation({
  endpoint: "/api/account/create",
  action: "Add",
  confirmationText: "Confirm Add Account",
  authorizationProvided: true,
  status: "blocked",
  details: {
    authorizationPassword: "secret"
  }
});

const cached = localDatabase.readCachedApiResponse({
  method: "POST",
  path: "/api/account/read",
  requestKey: "{}"
});
const counts = localDatabase.tableCounts();

assert.strictEqual(cached.status, 200);
assert.strictEqual(cached.source, "live");
assert.strictEqual(cached.body.result.data[0].customerId, "1001");
assert.strictEqual(counts.users, 3);
assert.strictEqual(counts.roles, 3);
assert.strictEqual(counts.permissions, 5);
assert.strictEqual(counts.api_cache, 1);
assert.strictEqual(counts.audit_logs, 1);
assert.strictEqual(counts.write_confirmations, 1);

localDatabase.resetForTests();
delete process.env.LOCAL_DB_MODE;

process.env.VERCEL = "1";
const vercelDbPath = localDatabase.databasePath();
assert.strictEqual(vercelDbPath.includes("reference-crm.sqlite"), true);
assert.strictEqual(vercelDbPath.startsWith(localDatabase.writableRoot()), true);
process.env.LOCAL_DB_PATH = "backend/data/reference-crm.sqlite";
const redirectedVercelDbPath = localDatabase.databasePath();
assert.strictEqual(redirectedVercelDbPath.startsWith(localDatabase.writableRoot()), true);
assert.strictEqual(redirectedVercelDbPath.endsWith("reference-crm.sqlite"), true);
delete process.env.LOCAL_DB_PATH;
delete process.env.VERCEL;

console.log(JSON.stringify({
  cacheRows: counts.api_cache,
  auditRows: counts.audit_logs,
  status: "local database memory passed"
}, null, 2));
