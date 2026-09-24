"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const view = read("apps/admin/src/views/RolesPermissions.vue");
const routes = read("backend/wallet/src/routes/admin.ts");
const rbac = read("backend/wallet/src/services/rbac.ts");
const permissionEndpoint = routes.slice(
  routes.indexOf("fastify.put('/access/roles/:roleKey/permissions'"),
  routes.indexOf("fastify.post('/access/roles'"),
);

assert.match(
  view,
  /requestToggle[\s\S]*?selectedRole\.value === 'super-admin'/,
  "Super Admin must edit non-root system roles through the permission matrix"
);
assert.match(
  view,
  /:disabled="saving \|\| !canManage \|\| selectedRole === 'super-admin'"/,
  "Only the root role permission switches must remain locked"
);
assert.doesNotMatch(
  permissionEndpoint,
  /SYSTEM_ROLE_KEYS\.has\(roleKey\).*system_role_locked.*permissions/s,
  "The permission endpoint must not reject every system role"
);
assert.match(
  permissionEndpoint,
  /roleKey === 'super-admin'.*system_role_locked/s,
  "The permission endpoint must keep Super Admin immutable"
);
assert.match(permissionEndpoint, /error: 'invalid_permissions'/, "Unknown permission keys must be rejected");
assert.match(
  permissionEndpoint,
  /rpc\('admin_replace_role_permissions'/,
  "Permission replacement must use one database transaction"
);
assert.doesNotMatch(
  rbac,
  /for \(const \[roleKey, permissions\] of Object\.entries\(DEFAULT_ROLE_PERMISSIONS\)\)/,
  "Runtime startup must not restore permissions revoked by Super Admin"
);
assert.match(permissionEndpoint, /action: 'access\.permissions\.update'/, "Permission changes must remain audited");
assert.match(permissionEndpoint, /notifyStaffAccountChange/, "Affected staff must remain notified");

const migration = read("supabase/migrations/20260924121000_atomic_role_permission_updates.sql");
assert.match(migration, /security definer/, "Permission replacement must run through a secured function");
assert.match(migration, /p_role_key = 'super-admin'/, "The database must protect Super Admin permissions");
assert.match(migration, /revoke all .* from authenticated/, "Signed-in clients must not invoke the function directly");
assert.match(migration, /grant execute .* to service_role/, "Only the backend service may replace permissions");

console.log("system role permission editing passed");
