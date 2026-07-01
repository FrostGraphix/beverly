const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const page = read("apps/admin/src/views/Disputes.vue");
const routes = read("backend/wallet/src/routes/admin.ts");
const service = read("backend/wallet/src/services/disputes.ts");

assert.ok(page.includes("dispute-stat-grid"), "disputes page must expose compact summary stats");
assert.ok(page.includes("filteredDisputes"), "disputes page must support local search filtering");
assert.ok(page.includes("MobileActionMenu"), "disputes page must use mobile dots for row actions");
assert.ok(page.includes("dispute-modal"), "disputes page must use a scrollable detail modal");
assert.ok(page.includes("api.patch(`/api/v1/admin/disputes/${selected.value.id}`"), "disputes page must update cases");
assert.ok(routes.includes("fastify.get('/disputes'"), "admin dispute list route must exist");
assert.ok(routes.includes("fastify.get('/disputes/:id'"), "admin dispute detail route must exist");
assert.ok(routes.includes("fastify.patch('/disputes/:id'"), "admin dispute update route must exist");
assert.ok(service.includes("withPurchaseContexts"), "dispute service must attach purchase context");

console.log("admin disputes flow contract passed");
