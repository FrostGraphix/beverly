import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRoute, routeGroups, visibleRoutes } from "../src/data/route-manifest.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "reference-contract.json"), "utf8"));
const contractPaths = new Set(contract.endpoints.flatMap((endpoint) => [endpoint.path, ...(endpoint.aliases || [])]).map((endpointPath) => endpointPath.toLowerCase()));
const superAdminRoutes = visibleRoutes("super-admin");
const operationsRoutes = visibleRoutes("operations-manager");
const accountRoutes = visibleRoutes("account");

for (const route of superAdminRoutes) {
  for (const apiPath of route.apis) {
    assert(contractPaths.has(apiPath.toLowerCase()), `Missing hidden route endpoint: ${apiPath}`);
  }
}

assert(superAdminRoutes.length > operationsRoutes.length, "Super admin should see more routes than operations");
assert(superAdminRoutes.length > accountRoutes.length, "Super admin should see more routes than account");
assert.strictEqual(findRoute("#/admin/user", "operations-manager").hash, "#/dashboard");
assert.strictEqual(findRoute("#/remote-support/gprs-tasks", "operations-manager").hash, "#/remote-support/gprs-tasks");
assert(superAdminRoutes.some((route) => route.hash === "#/admin/user"), "Admin user route missing");
assert(superAdminRoutes.some((route) => route.hash === "#/remote-support/file-upload"), "File upload route missing");
assert(routeGroups("super-admin").some((group) => group.name === "Administration"), "Administration group missing");
assert(routeGroups("super-admin").some((group) => group.name === "Remote Support"), "Remote Support group missing");

console.log(JSON.stringify({
  superAdminRoutes: superAdminRoutes.length,
  operationsRoutes: operationsRoutes.length,
  accountRoutes: accountRoutes.length,
  status: "hidden modules passed"
}, null, 2));
