"use strict";

process.env.LOCAL_DB_MODE = "memory";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

async function main() {
  const { resetForTests } = require("../backend/src/services/local-database");
  const { ingestClientErrors, listClientErrors } = require("../backend/src/services/client-error-service");

  resetForTests();

  // Ingest: sanitizes, clamps, drops empty messages.
  const ingested = await ingestClientErrors([
    {
      reference: "ERR-TEST-1",
      event: "api-response-error",
      message: "Request failed with status 500",
      status: 500,
      url: "/api/dashboard/readPanelGroup",
      method: "post",
      route: "#/dashboard",
      at: "2026-07-15T10:00:00.000Z"
    },
    { message: "x".repeat(2000), event: "window-error" },
    { message: "" },
    "not-an-object"
  ], { userId: "admin", roleId: "super-admin" });

  assert.equal(ingested.accepted, 2, "two valid entries accepted");
  assert.equal(ingested.dropped, 2, "invalid entries dropped");

  const listed = await listClientErrors({ limit: 10 });
  assert.equal(listed.total, 2, "two entries listed");
  const first = listed.errors.find((row) => row.reference === "ERR-TEST-1");
  assert.ok(first, "reference survives round trip");
  assert.equal(first.statusCode, 500, "status code persisted");
  assert.equal(first.method, "POST", "method uppercased");
  assert.equal(first.actorUserId, "admin", "actor recorded");
  const clamped = listed.errors.find((row) => row.event === "window-error");
  assert.ok(clamped.message.length <= 500, "long messages clamped");

  // Batch cap: more than 20 entries are truncated.
  resetForTests();
  const flood = Array.from({ length: 40 }, (_, index) => ({ message: `error ${index}` }));
  const capped = await ingestClientErrors(flood, {});
  assert.equal(capped.accepted, 20, "batch capped at 20");

  // Gateway contract.
  const gateway = read("api/reference.js");
  assert.ok(gateway.includes("/api/system/client-errors"), "gateway exposes client-errors endpoint");
  assert.ok(gateway.includes("ingestClientErrors"), "gateway ingests client errors");
  assert.ok(gateway.includes("Client error telemetry requires staff role"), "gateway gates telemetry reads by staff role");

  // Frontend contract.
  const logger = read("src/services/error-logger.mjs");
  assert.ok(logger.includes("/api/system/client-errors"), "logger ships to telemetry endpoint");
  assert.ok(logger.includes("installGlobalErrorHandlers"), "logger installs global handlers");
  assert.ok(logger.includes("unhandledrejection"), "logger captures unhandled rejections");
  assert.ok(logger.includes("keepalive: true"), "logger uses keepalive for pagehide flushes");

  const main = read("src/main.js");
  assert.ok(main.includes("installGlobalErrorHandlers()"), "main installs global error handlers");
  assert.ok(main.includes("app.config.errorHandler"), "main wires the Vue error handler");

  console.log(JSON.stringify({ status: "client error telemetry passed" }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
