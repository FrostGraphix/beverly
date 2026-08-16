const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const view = fs.readFileSync(path.join(root, 'apps/admin/src/views/RolesPermissions.vue'), 'utf8');
const appShell = fs.readFileSync(path.join(root, 'apps/admin/src/components/AppShell.vue'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'apps/admin/src/views/Profile.vue'), 'utf8');

assert.match(view, /Add staff/);
assert.match(view, /Add role/);
assert.match(view, /activeTab = 'matrix'; openRoleEditor\(\)/);
assert.match(view, /Custom access role/);
assert.match(view, /Create custom role/);
assert.match(view, /\/api\/v1\/admin\/access\/roles/);
assert.match(view, /roleEditor\.value\.permissions/);
assert.match(view, /\['Identity', 'Access', 'Review'\]/);
assert.match(view, /StationMultiSelect v-model="draft\.stationIds"/);
assert.match(view, /stationIds: draft\.value\.stationIds/);
assert.match(view, /updateStaffStations/);
assert.match(view, /station_ids\?\.length/);
assert.match(appShell, /replace\(\/\^custom\[-_\]\/i, ''\)/);
assert.match(profile, /replace\(\/\^custom\[-_\]\/i, ''\)/);

console.log('admin role creation UI contract passed');
