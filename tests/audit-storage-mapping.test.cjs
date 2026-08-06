"use strict";

const assert = require("node:assert");
const { mapAuditRow } = require("../backend/src/services/storage-adapter");

// Non-client-error actions (the ~97% case: login/download/create/remote_command)
// must NOT carry the full response body -- nothing reads it (see mapAuditRow's
// own comment). outcome/statusCode/method must land in real columns instead.
const liveRow = mapAuditRow({
  method: "POST",
  path: "/api/RemoteMeterTask/CreateReadingTask",
  outcome: "success",
  statusCode: 200,
  proxySource: "live",
  userId: "admin",
  requestId: "not-a-uuid",
  details: { authorizationPassword: "secret", meterId: "47005306650" }
});

assert.equal(liveRow.action, "remote_command");
assert.equal(liveRow.resource, "/api/RemoteMeterTask/CreateReadingTask");
assert.equal(liveRow.user_id, null);
assert.equal(liveRow.request_id, null);
assert.equal(liveRow.outcome, "success");
assert.equal(liveRow.status_code, 200);
assert.equal(liveRow.method, "POST");
assert.equal(liveRow.source, "live");
assert.deepEqual(liveRow.detail, {}, "non-client-error rows must not carry the response body -- nothing reads it");
assert.equal(liveRow.metadata, undefined, "metadata is retired -- must not appear on the mapped row at all");

// client-error is the one genuinely-read slice (client-error-service.js's
// listClientErrors) -- detail must still be populated, and secrets still
// stripped by sanitizeValue.
const clientErrorRow = mapAuditRow({
  method: "POST",
  path: "/client-error",
  outcome: "api-response-error",
  statusCode: 401,
  proxySource: "client-error",
  details: { authorizationPassword: "secret", message: "Invalid session" }
});

assert.equal(clientErrorRow.source, "client-error");
assert.equal(clientErrorRow.detail.authorizationPassword, undefined);
assert.equal(clientErrorRow.detail.message, "Invalid session");
assert.equal(clientErrorRow.detail.outcome, "api-response-error");
assert.equal(clientErrorRow.detail.statusCode, 401);

console.log("audit storage mapping ok");
