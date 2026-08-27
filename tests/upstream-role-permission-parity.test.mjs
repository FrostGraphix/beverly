import assert from "node:assert/strict";
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

console.log("upstream role permission parity passed");
