const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const adminRoutes = read('backend/wallet/src/routes/admin.ts');
const notifications = read('backend/wallet/src/services/admin-notifications.ts');
const roles = read('apps/admin/src/views/RolesPermissions.vue');
const vendors = read('apps/admin/src/views/Vendors.vue');
const vendorDetail = read('apps/admin/src/views/VendorDetail.vue');
const customers = read('apps/admin/src/views/Customers.vue');
const customerDetail = read('apps/admin/src/views/CustomerDetail.vue');
const exportMenu = read('packages/tokens/WalletExportMenu.vue');

assert.match(adminRoutes, /const invitationDelivery = await notifyStaffInvitation/);
assert.match(adminRoutes, /const emailReadiness = await staffInvitationReadiness/);
assert.match(adminRoutes, /staff_invitation_delivery_failed/);
assert.match(adminRoutes, /accountRolledBack: !rollbackFailed/);
assert.match(adminRoutes, /invitationEmailStatus: invitationDelivery\.status/);
assert.match(adminRoutes, /temporaryPassword: password, invitationDelivery/);
assert.match(notifications, /isResendConfigured\(\)/);
assert.match(notifications, /export async function staffInvitationReadiness/);
assert.match(notifications, /status: 'not_sent', reason: 'provider_error'/);
assert.match(roles, /Invitation sent to \$\{invitedEmail\}/);
assert.match(roles, /Creation completes only after Resend confirms delivery/);

assert.match(adminRoutes, /stationId: rawStationId/);
assert.match(adminRoutes, /query = query\.eq\('station_id', stationId\)/);
assert.match(vendors, /Filter by station ID/);
assert.match(vendors, /<th>Station ID<\/th>/);
assert.match(vendors, /v\.station_id \|\| 'Unassigned'/);
assert.match(vendorDetail, /Station ID · \{\{ detail\.vendor\.station_id/);

assert.match(adminRoutes, /select\('customer_id, station_id'\)/);
assert.match(adminRoutes, /station_ids:\s+stationsByCustomer\.get\(c\.id\)/);
assert.match(customers, /<th>Station IDs<\/th>/);
assert.match(customerDetail, /detail\.customer\.station_ids\?\.join/);

assert.match(exportMenu, /class="bw-btn bw-export-trigger"/);
assert.doesNotMatch(exportMenu, /class="bw-btn sm bw-export-trigger"/);

console.log('admin staff invitation and station identity contracts passed');
