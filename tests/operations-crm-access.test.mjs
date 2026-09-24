import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeRoleId,
  roleAllowsRoute,
  routeManifest,
  visibleRoutes
} from "../src/data/route-manifest.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const operationalGroups = new Set([
  "Dashboard",
  "Token Record",
  "Remote Operation",
  "Remote Operation Task",
  "Data Report",
  "Management"
]);
const operationalRoles = ["operations-manager", "operations-officer"];

assert.equal(normalizeRoleId("Operations Officer"), "operations-officer");
assert.equal(normalizeRoleId("operations_officer"), "operations-officer");
assert.equal(normalizeRoleId("operations_manager"), "operations-manager");

for (const role of operationalRoles) {
  const routes = visibleRoutes(role);
  assert.ok(routes.length > 0, `${role} must receive CRM routes`);
  assert.deepEqual(
    new Set(routes.map((route) => route.group)),
    operationalGroups,
    `${role} must receive only the confirmed CRM groups`
  );
  for (const route of routeManifest) {
    assert.equal(
      roleAllowsRoute(route, role, "ALL super-admin"),
      operationalGroups.has(route.group),
      `${role} must not bypass its CRM boundary through legacy remarks: ${route.hash}`
    );
  }
}

for (const blockedRole of ["finance-checker", "developer", "vendor", "customer"]) {
  assert.equal(
    visibleRoutes(blockedRole).some((route) => operationalGroups.has(route.group)),
    false,
    `${blockedRole} must not inherit wallet-to-CRM access`
  );
}

assert.ok(visibleRoutes("account").length > 0, "existing CRM account access must remain unchanged");
assert.equal(visibleRoutes("super-admin").length, routeManifest.length, "super-admin CRM access must remain unchanged");

const walletAuth = read("backend/wallet/src/plugins/auth.ts");
assert.match(walletAuth, /['"]operations-officer['"]/, "wallet authentication must recognize operations officers");

const walletRbac = read("backend/wallet/src/services/rbac.ts");
assert.match(walletRbac, /['"]operations-officer['"]\s*:/, "wallet RBAC must define operations officers");

const adminShell = read("apps/admin/src/components/AppShell.vue");
assert.match(adminShell, /operations-officer/, "wallet navigation must expose CRM to operations officers");

const crmAuth = read("backend/src/services/supabase-service.js");
assert.match(crmAuth, /CRM_STAFF_ROLES/, "CRM login must use an explicit staff allowlist");
assert.match(crmAuth, /operations-officer/, "CRM login must admit operations officers");

const api = read("api/reference.js");
assert.match(api, /operations-officer/, "CRM API authorization must recognize operations officers");
assert.match(api, /operationalGroups/, "CRM API authorization must enforce operational route groups");
assert.match(api, /item\.stationId = actorStation/, "CRM API must inject assigned station scope");

const tableService = read("src/services/table-service.js");
assert.match(tableService, /"X-Route-Hash": String\(route\?\.hash \|\| ""\)/, "CRM table reads must send route context");

const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => read(`supabase/migrations/${name}`))
  .join("\n");
assert.match(migrations, /operations-officer/, "database roles must include operations officers");

console.log("operations CRM access seams passed");
