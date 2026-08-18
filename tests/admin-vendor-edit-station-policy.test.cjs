"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const policyPath = path.join(root, "backend/wallet/src/contracts/route-policy.ts");
const referencePath = path.join(root, "api/reference.js");
const adminPath = path.join(root, "backend/wallet/src/routes/admin.ts");

// 1. Static contract assertions
const policy = fs.readFileSync(policyPath, "utf8");
assert.match(policy, /patch\('\/api\/v1\/admin\/vendors\/:id'\)/, "route-policy.ts must include patch('/api/v1/admin/vendors/:id')");
assert.match(policy, /patch\('\/api\/v1\/admin\/vendors\/:id\/station'\)/, "route-policy.ts must include patch('/api/v1/admin/vendors/:id/station')");

const reference = fs.readFileSync(referencePath, "utf8");
assert.ok(reference.includes('pathname.match(/^\\/api\\/v1\\/admin\\/vendors\\/[^/]+\\/station$/)'), "api/reference.js must include PATCH vendor station handler");
assert.ok(reference.includes('pathname.match(/^\\/api\\/v1\\/admin\\/vendors\\/[^/]+$/)'), "api/reference.js must include PATCH vendor detail handler");
assert.ok(reference.includes('/api/v1/admin/stations'), "api/reference.js must include GET admin stations handler");

const admin = fs.readFileSync(adminPath, "utf8");
assert.match(admin, /fastify\.patch\('\/vendors\/:id'/, "admin.ts must define fastify.patch('/vendors/:id')");
assert.match(admin, /fastify\.patch\('\/vendors\/:id\/station'/, "admin.ts must define fastify.patch('/vendors/:id/station')");

console.log("admin vendor edit & station route policy assertions passed");
