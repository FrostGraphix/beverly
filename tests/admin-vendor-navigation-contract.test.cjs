"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const shell = read("apps/admin/src/components/AppShell.vue");
const vendors = read("apps/admin/src/views/Vendors.vue");
const router = read("apps/admin/src/router/index.ts");
const routes = read("backend/wallet/src/routes/admin.ts");
const analyticsRoutes = read("backend/wallet/src/routes/admin-vendor-analytics.ts");
const analytics = read("apps/admin/src/views/VendorAnalytics.vue");

assert.ok(!shell.includes("text: 'Vendor Analytics'"));
assert.ok(vendors.includes('to="/vendors/analytics"'));
assert.ok(vendors.includes('>View analytics</router-link>'));
assert.ok(router.includes("path: '/vendors/analytics'"));
assert.ok(routes.includes("'GET /vendors/analytics': 'wallet.vendors.review'"));
assert.ok(routes.includes("register(adminVendorAnalyticsRoutes)"));
assert.ok(analyticsRoutes.includes("fastify.get('/vendors/analytics'"));
assert.ok(analytics.includes('>Analytics unavailable</h2>'));
assert.ok(analytics.includes("'Try again'"));

console.log("admin vendor navigation contract passed");
