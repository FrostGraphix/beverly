"use strict";

const assert = require("assert");
const http = require("http");
const { createServer } = require("../backend/reference-facade/server");
const { routes } = require("../backend/reference-facade/handlers");
const manifest = require("../reference-route-manifest.json");

function request(port, path, body = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Authorization: "Bearer test"
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
      }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

function getRequest(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "GET",
      headers: { Authorization: "Bearer test" }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
      }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const visibleApis = new Set(manifest.flatMap((route) => route.apis));
    for (const apiPath of visibleApis) {
      assert(routes.has(`POST ${apiPath}`), `missing handler: ${apiPath}`);
      const response = await request(port, apiPath);
      assert.strictEqual(response.status, 200, apiPath);
      assert.strictEqual(response.body.code, 200, apiPath);
    }

    const login = await request(port, "/api/user/login", {
      userId: "admin",
      password: "admin",
      verifycode: "s3b9"
    });
    assert.strictEqual(login.status, 200);
    assert.strictEqual(login.body.data.token, "reference-compatible-token");

    const failedLogin = await request(port, "/api/user/login", {});
    assert.strictEqual(failedLogin.status, 400);

    const roles = await request(port, "/api/role/read");
    assert.strictEqual(roles.status, 200);
    assert(roles.body.data.records.some((role) => role.name === "Super Admin"));

    const hidden = await request(port, "/api/log/read");
    assert.strictEqual(hidden.status, 200);

    const readMore = await getRequest(port, "/api/token/creditTokenRecord/readMore?FROM=2026-01-01T00:00:00.000Z&TO=2026-01-17T00:00:00.000Z&SITE_ID=KYAKALE");
    assert.strictEqual(readMore.status, 200);

    const hourly = await getRequest(port, "/api/DailyDataMeter/readHourly?offset=0&pageLimit=100&SITE_ID=KYAKALE");
    assert.strictEqual(hourly.status, 200);

    console.log(JSON.stringify({
      visibleApis: visibleApis.size,
      status: "reference facade tests passed"
    }, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
