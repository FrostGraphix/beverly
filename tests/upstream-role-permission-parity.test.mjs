import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  applyUpstreamRoutePermissions,
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
const { upstreamCapabilitiesFromRows } = require("../api/reference")._test;

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

const readOnlyStationRoute = applyUpstreamRoutePermissions(stationRoute, {
  stationManagement: false,
});
assert.deepEqual(
  readOnlyStationRoute.actions,
  ["Sort", "Search", "Reset", "Export", "Cancel", "Confirm"],
  "station mutations must disappear when upstream denies them",
);
assert.match(readOnlyStationRoute.readOnlyReason, /Management\.Station/);

console.log("upstream role permission parity passed");
