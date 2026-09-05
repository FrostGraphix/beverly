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
const exportMenuTypes = read('packages/tokens/WalletExportMenu.vue.d.ts');
const exportWizard = read('packages/tokens/WalletExportWizard.vue');

assert.match(adminRoutes, /const invitationDelivery = await notifyStaffInvitation/);
assert.match(adminRoutes, /const emailReadiness = await staffInvitationReadiness/);
assert.match(adminRoutes, /staff_invitation_delivery_failed/);
assert.match(adminRoutes, /accountRolledBack: !rollbackFailed/);
assert.match(adminRoutes, /invitationEmailStatus: invitationDelivery\.status/);
assert.match(adminRoutes, /temporaryPassword: password, invitationDelivery/);
assert.match(notifications, /isResendConfigured\(\)/);
assert.match(notifications, /export async function staffInvitationReadiness/);
assert.match(notifications, /status: 'not_sent', reason: 'provider_error'/);
assert.match(roles, /Verification and welcome emails sent to \$\{invitedEmail\}/);
assert.match(roles, /Creation completes only after Resend confirms both the verification and welcome emails/);
assert.match(roles, /allStations/);
assert.match(roles, /All current and future stations/);
assert.match(adminRoutes, /email_confirm: false/);
assert.match(adminRoutes, /auth\.admin\.generateLink/);
assert.match(adminRoutes, /@acoblighting\.com/);
assert.match(notifications, /staffEmailVerificationEmail/);
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
