"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const routes = read("backend/wallet/src/routes/admin.ts");
const view = read("apps/admin/src/views/RolesPermissions.vue");
const adminVite = read("apps/admin/vite.config.ts");
const migration = read("supabase/migrations/20260924133000_atomic_role_lifecycle.sql");
const permissionRoute = routes.slice(
  routes.indexOf("fastify.put('/access/roles/:roleKey/permissions'"),
  routes.indexOf("fastify.post('/access/roles'"),
);

const createRoute = routes.slice(
  routes.indexOf("fastify.post('/access/roles'"),
  routes.indexOf("fastify.patch('/access/roles/:roleKey'"),
);
const deleteRoute = routes.slice(
  routes.indexOf("fastify.delete('/access/roles/:roleKey'"),
  routes.indexOf("fastify.post('/access/users'"),
);

assert.match(createRoute, /error: 'invalid_permissions'/, "Creation must reject unknown permissions");
assert.match(createRoute, /error: 'restricted_permissions'/, "Creation must reject system-only permissions");
assert.match(createRoute, /rpc\('admin_create_custom_role'/, "Creation must be atomic");
assert.doesNotMatch(createRoute, /message: .*\.message/, "Creation must not expose database messages");
assert.match(createRoute, /action: 'access\.role\.created'/, "Creation must be audited");
assert.match(permissionRoute, /CUSTOM_ROLE_RESTRICTED_PERMISSIONS/, "Later edits must preserve custom-role restrictions");

assert.match(deleteRoute, /rpc\('admin_delete_custom_role'/, "Deletion must lock usage checks atomically");
assert.match(deleteRoute, /role_not_found/, "Missing roles must return not found");
assert.match(deleteRoute, /role_in_use/, "Assigned roles must remain protected");
assert.doesNotMatch(deleteRoute, /message: .*\.message/, "Deletion must not expose database messages");
assert.match(deleteRoute, /action: 'access\.role\.deleted'/, "Deletion must be audited");

assert.match(migration, /security definer/g, "Lifecycle functions must be secured");
assert.match(migration, /for update/, "Deletion must lock the role before checking assignments");
assert.match(migration, /p_role_key not like 'custom-%'/, "Database functions must protect system roles");
assert.match(migration, /'dev\.console' = any/, "Database functions must protect developer access");
assert.match(migration, /p_role_key like 'custom-%'[\s\S]*'dev\.console' = any/, "Permission replacement must preserve custom-role restrictions");
assert.match(migration, /grant execute .* to service_role/g, "Only backend services may mutate roles");

assert.match(view, /title: 'Delete custom role'/, "Deletion must require confirmation");
assert.match(view, /editorCriticalPermissions/, "Critical grants must require confirmation");
assert.match(view, /await load\(\)/, "The interface must refresh after mutations");
assert.match(adminVite, /registerType: 'autoUpdate'/, "Deployed permission fixes must activate automatically");
assert.match(adminVite, /skipWaiting: true/, "Updated admin workers must not remain waiting");
assert.match(adminVite, /clientsClaim: true/, "Updated admin workers must control existing pages");
assert.match(adminVite, /emptyOutDir: true/, "Admin builds must remove obsolete bundles");

console.log("role lifecycle contract passed");
