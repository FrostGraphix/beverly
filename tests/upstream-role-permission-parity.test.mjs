import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  normalizeRoleId,
  roleAllowsRoute,
  routeManifest,
} from "../src/data/route-manifest.js";

const upstreamAdminPermissions = [
  "Token.CreditToken",
  "Management.Gateway",
  "Management.Customer",
  "Management.Tariff",
  "Management.Account",
].join(",");

const require = createRequire(import.meta.url);
const { authorizeRequest, upstreamCapabilitiesFromRows } = require("../api/reference")._test;

assert.deepEqual(
  upstreamCapabilitiesFromRows([{ userId: "admin", roleId: "admin", roleContent: upstreamAdminPermissions }], "admin"),
  { known: true, stationManagement: false, roleId: "admin" },
);
assert.deepEqual(
  upstreamCapabilitiesFromRows([{ userId: "station-admin", roleId: "admin", roleContent: "Management.Station" }], "station-admin"),
  { known: true, stationManagement: true, roleId: "admin" },
);

const stationRoute = routeManifest.find((route) => route.hash === "#/admin/station");
const gatewayRoute = routeManifest.find((route) => route.hash === "#/management/gateway");
const customerRoute = routeManifest.find((route) => route.hash === "#/management/customer");

assert.equal(normalizeRoleId("admin"), "admin", "upstream admin is not Beverly super-admin");
assert.equal(
  roleAllowsRoute(stationRoute, "admin", upstreamAdminPermissions),
  false,
  "upstream admin must not receive ungranted station management",
);
assert.equal(
  roleAllowsRoute(gatewayRoute, "admin", upstreamAdminPermissions),
  true,
  "upstream admin must retain explicitly granted management routes",
);
assert.equal(
  roleAllowsRoute(customerRoute, "admin", "Management.Gateway"),
  false,
  "one management grant must not unlock its sibling routes",
);
assert.equal(
  roleAllowsRoute(stationRoute, "super-admin", ""),
  true,
  "Beverly super-admin keeps full station management",
);

assert.ok(stationRoute.actions.includes("Add"), "Beverly super-admin keeps station creation available");
assert.ok(stationRoute.actions.includes("Edit"), "Beverly super-admin keeps station editing available");

const previousDemoAuth = process.env.DEMO_AUTH_ENABLED;
const previousUpstreamUsername = process.env.UPSTREAM_USERNAME;
process.env.DEMO_AUTH_ENABLED = "true";
process.env.UPSTREAM_USERNAME = "";
require("../api/reference")._test.resetContractCache();
try {
  const authorization = await authorizeRequest(
    {
      method: "POST",
      headers: { authorization: "Bearer local-dev-token" },
    },
    "/api/station/create",
    { parsedBody: { stationId: "TEST", name: "Test Station" } },
  );
  assert.equal(
    authorization,
    null,
    "Beverly authorization must allow the upstream station endpoint to decide mutation access",
  );
} finally {
  if (previousDemoAuth === undefined) delete process.env.DEMO_AUTH_ENABLED;
  else process.env.DEMO_AUTH_ENABLED = previousDemoAuth;
  if (previousUpstreamUsername === undefined) delete process.env.UPSTREAM_USERNAME;
  else process.env.UPSTREAM_USERNAME = previousUpstreamUsername;
  require("../api/reference")._test.resetContractCache();
}

console.log("upstream role permission parity passed");
