const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const rbac = read('backend/wallet/src/services/rbac.ts');
const routes = read('backend/wallet/src/routes/admin.ts');
const router = read('apps/admin/src/router/index.ts');
const shell = read('apps/admin/src/components/AppShell.vue');

const catalogBlock = rbac.match(/PERMISSION_CATALOG[\s\S]*?\n\];/)?.[0] ?? '';
const catalog = new Set([...catalogBlock.matchAll(/key:\s*'([^']+)'/g)].map((match) => match[1]));
const policyBlock = routes.match(/ADMIN_ROUTE_PERMISSIONS[\s\S]*?\n};/)?.[0] ?? '';
const mappedPermissions = [...policyBlock.matchAll(/:\s*'([^']+)'\s*,/g)].map((match) => match[1]);
const frontendPermissions = [...`${router}\n${shell}`.matchAll(/permission:\s*'([^']+)'/g)].map((match) => match[1]);

assert(catalog.size > 0, 'permission catalog must be readable');
for (const permission of [...mappedPermissions, ...frontendPermissions]) {
  assert(catalog.has(permission), `permission must exist in catalog: ${permission}`);
}

assert.doesNotMatch(
  rbac,
  /permissionsForRole[\s\S]*?ensureAccessDefaults\(/,
  'permission reads must never mutate production policy',
);
assert.match(
  rbac,
  /if \(error\) throw new PermissionResolutionError/,
  'database failures must deny permission resolution',
);
assert.doesNotMatch(
  routes,
  /const fallback = DEFAULT_ROLE_PERMISSIONS/,
  'database failures must not grant fallback permissions',
);

console.log('admin RBAC integrity contract passed');
