"use strict";

const assert = require("node:assert");
const { mapAuditRow } = require("../backend/src/services/storage-adapter");

const row = mapAuditRow({
  method: "POST",
  path: "/api/RemoteMeterTask/CreateReadingTask",
  outcome: "success",
  statusCode: 200,
  proxySource: "live",
  userId: "admin",
  requestId: "not-a-uuid",
  details: { authorizationPassword: "secret", meterId: "47005306650" }
});

assert.equal(row.action, "remote_command");
assert.equal(row.resource, "/api/RemoteMeterTask/CreateReadingTask");
assert.equal(row.user_id, null);
assert.equal(row.request_id, null);
assert.equal(row.metadata.authorizationPassword, undefined);
assert.equal(row.metadata.meterId, "47005306650");

console.log("audit storage mapping ok");
