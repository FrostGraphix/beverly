const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const adminRoutes = read('backend/wallet/src/routes/admin.ts');
const staffProvisioning = read('backend/wallet/src/services/staff-provisioning.ts');
const notifications = read('backend/wallet/src/services/admin-notifications.ts');
const roles = read('apps/admin/src/views/RolesPermissions.vue');
const vendors = read('apps/admin/src/views/Vendors.vue');
const vendorDetail = read('apps/admin/src/views/VendorDetail.vue');
const customers = read('apps/admin/src/views/Customers.vue');
const customerDetail = read('apps/admin/src/views/CustomerDetail.vue');
const exportMenu = read('packages/tokens/WalletExportMenu.vue');
const exportMenuTypes = read('packages/tokens/WalletExportMenu.vue.d.ts');
const exportWizard = read('packages/tokens/WalletExportWizard.vue');

assert.match(adminRoutes, /return await provisionStaff\(req\.body, req\.actor!, req\.log\)/);
assert.doesNotMatch(adminRoutes, /auth\.admin\.createUser/);
assert.match(staffProvisioning, /const invitationDelivery = await notifyStaffInvitation/);
assert.match(staffProvisioning, /const emailReadiness = await staffInvitationReadiness/);
assert.match(staffProvisioning, /staff_invitation_delivery_failed/);
assert.match(staffProvisioning, /accountRolledBack: !cleanup\.failed/);
assert.match(staffProvisioning, /invitationEmailStatus: invitationDelivery\.status/);
assert.doesNotMatch(staffProvisioning, /temporaryPassword/);
assert.match(notifications, /isResendConfigured\(\)/);
assert.match(notifications, /export async function staffInvitationReadiness/);
assert.match(notifications, /status: 'not_sent', reason: 'provider_error'/);
assert.match(roles, /Invitation sent to \$\{invitedEmail\}/);
assert.match(roles, /One secure invitation lets the staff member create their password/);
assert.match(roles, /allStations/);
assert.match(roles, /All current and future stations/);
assert.match(staffProvisioning, /email_confirm: true/);
assert.match(staffProvisioning, /auth\.admin\.generateLink/);
assert.match(staffProvisioning, /@acoblighting\.com/);
assert.match(notifications, /tag: 'staff-invitation'/);
assert.match(notifications, /sendBatch/);

assert.match(adminRoutes, /stationId: rawStationId/);
assert.match(adminRoutes, /query = query\.eq\('station_id', stationId\)/);
assert.match(vendors, /Filter by station ID/);
assert.match(vendors, /<th>Station ID<\/th>/);
assert.match(vendors, /v\.station_id \|\| 'Unassigned'/);
assert.match(vendors, /:formats="\['pdf'\]"/);
assert.match(vendors, /label="Export PDF"/);
assert.match(vendorDetail, /Station ID · \{\{ detail\.vendor\.station_id/);

assert.match(adminRoutes, /select\('customer_id, station_id'\)/);
assert.match(adminRoutes, /station_ids:\s+stationsByCustomer\.get\(c\.id\)/);
assert.match(customers, /<th>Station IDs<\/th>/);
assert.doesNotMatch(customers, /Export CSV/);
assert.match(customers, />Export PDF<\/button>/);
assert.match(customerDetail, /detail\.customer\.station_ids\?\.join/);

assert.match(exportMenu, /WalletExportWizard/);
assert.match(exportMenu, /:formats="formats"/);
assert.match(exportWizard, /class="bw-btn bw-export-wizard-trigger"/);
assert.match(exportWizard, /formats\.length > 1/);
assert.match(exportMenuTypes, /formats: \{ type: PropType<Array<'csv' \| 'pdf'>>/);

console.log('admin staff invitation and station identity contracts passed');
