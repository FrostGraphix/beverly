"use strict";

process.env.LOCAL_DB_MODE = "memory";
process.env.SESSION_STORE_MODE = "local";
process.env.JWT_SECRET = "oem-hub-resilience-test-secret-32-characters";
process.env.OEM_CREDENTIALS_ENCRYPTION_KEY = Buffer.from("oem-hub-test-encryption-key-32bytes").subarray(0, 32).toString("base64");

const assert = require("node:assert/strict");
const http = require("node:http");
const handler = require("../api/reference.js");
const localDatabase = require("../backend/src/services/local-database.js");

function startServer(listener) {
  return new Promise((resolve) => {
    const server = http.createServer(listener);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function createFacadeServer() {
  return startServer((request, response) => {
    const facadeResponse = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, value) {
        response.setHeader(name, value);
        return this;
      },
      json(body) {
        response.statusCode = this.statusCode;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify(body));
      }
    };
    Promise.resolve(handler(request, facadeResponse)).catch((error) => {
      response.statusCode = 500;
      response.end(JSON.stringify({ code: 500, reason: error.message }));
    });
  });
}

function request(port, pathname) {
  const now = Date.now();
  const token = "local-dev-token";
  const session = handler._test.signCrmSession({
    startedAt: now,
    lastActiveAt: now,
    tokenFingerprint: handler._test.crmTokenFingerprint(token)
  });
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `bev_token=${encodeURIComponent(token)}; bev_session=${encodeURIComponent(session)}`
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        resolve({ status: response.statusCode, headers: response.headers, body });
      });
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

async function withEnvironment(values, run) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  handler._test.resetContractCache();
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    handler._test.resetContractCache();
  }
}

async function main() {
  process.env.LOCAL_DB_MODE = "memory";
  process.env.SESSION_STORE_MODE = "local";
  let stationRequests = 0;
  const upstream = await startServer((request, response) => {
    if (String(request.url).toLowerCase().includes("/station/read")) stationRequests += 1;
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end("");
  });
  const facade = await createFacadeServer();

  try {
    await withEnvironment({
      LIVE_API_PROXY_ENABLED: "true",
      LIVE_READ_MODE: "live",
      LIVE_API_BASE_URL: `http://127.0.0.1:${upstream.address().port}`,
      LIVE_API_BEARER_TOKEN: "test-token",
      DEMO_AUTH_ENABLED: "true",
      LOCAL_DB_MODE: "memory",
      SESSION_STORE_MODE: "local",
      OEM_HUB_STATION_TIMEOUT_MS: "1000"
    }, async () => {
      const seed = localDatabase.upsertOemManufacturer({
        id: "b0e00000-0000-0000-0000-000000000001",
        slug: "calinmeter",
        displayName: "Calinmeter",
        status: "active",
        isSeedDefault: true
      });
      localDatabase.upsertOemStationMapping({
        oemId: seed.id,
        stationId: "KYAKALE",
        communityLabel: "Kyakale"
      });
      assert.equal(localDatabase.listOemManufacturers().length, 1, "test registry is seeded");

      const result = await request(facade.address().port, "/api/system/oem/list");

      assert.equal(result.status, 200, "OEM inventory remains available");
      assert.equal(result.body.data.degraded, true, "response declares degraded mode");
      assert.equal(result.body.data.dependencies.stationApi.status, "unavailable");
      assert.equal(result.body.data.dependencies.stationApi.code, "STATION_API_UNAVAILABLE");
      assert.match(result.headers["x-request-id"], /^REQ-[0-9a-f-]{36}$/i);
      assert.equal(result.body.data.dependencies.stationApi.reference, result.headers["x-request-id"]);
      assert.equal(result.body.data.oems.length, 1, "registry rows remain visible");
      assert.equal(result.body.data.oems[0].communityCount, 1, "durable mappings provide counts");
      assert.equal(result.body.data.oems[0].communityCountStatus, "stale");
      assert.equal(result.body.data.oems[0].stations[0].stationId, "KYAKALE");
      assert.ok(stationRequests >= 1, "live station read was attempted");
    });
  } finally {
    await closeServer(facade);
    await closeServer(upstream);
    localDatabase.resetForTests();
  }

  console.log(JSON.stringify({ status: "OEM hub resilience passed" }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
