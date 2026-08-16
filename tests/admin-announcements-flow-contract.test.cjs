"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function main() {
  const adminRoutes = read("backend/wallet/src/routes/admin.ts");
  const vendorRoutes = read("backend/wallet/src/routes/vendor.ts");
  const adminRouter = read("apps/admin/src/router/index.ts");
  const adminShell = read("apps/admin/src/components/AppShell.vue");
  const adminPage = read("apps/admin/src/views/Announcements.vue");
  const successHover = read("apps/admin/src/components/MessageSuccessHover.vue");
  const vendorRouter = read("apps/vendor/src/router/index.ts");
  const vendorShell = read("apps/vendor/src/components/AppShell.vue");
  const vendorPage = read("apps/vendor/src/views/Notifications.vue");
  const customerPage = read("apps/customer/src/views/Notifications.vue");
  const customerRoutes = read("backend/wallet/src/routes/customer.ts");
  const notificationService = read("backend/wallet/src/services/notifications.ts");
  const migration = read("supabase/migrations/20260617120000_wallet_admin_announcements.sql");
  const compatibilityMigration = read("supabase/migrations/20260714120000_notifications_legacy_compatibility.sql");

  for (const route of [
    "fastify.get('/announcements/recipients'",
    "fastify.get('/announcements'",
    "fastify.post('/announcements'",
  ]) {
    assert(adminRoutes.includes(route), `Missing admin route: ${route}`);
  }

  for (const permission of [
    "'GET /announcements': 'wallet.announcements.manage'",
    "'GET /announcements/recipients': 'wallet.announcements.manage'",
    "'POST /announcements': 'wallet.announcements.manage'",
  ]) {
    assert(adminRoutes.includes(permission), `Missing route permission: ${permission}`);
  }

  assert(adminRoutes.includes("wallet.announcements.manage"), "Announcement permission missing.");
  assert(adminRoutes.includes("listAllAnnouncementRecipients"), "Send-all must page through all recipients.");
  assert(adminRoutes.includes("insertAnnouncementNotifications"), "Notification inserts must be chunked.");
  assert(adminRoutes.includes("insertAnnouncementDeliveries"), "Delivery inserts must be chunked.");
  assert(adminRoutes.includes("message: row.body"), "Legacy notification schemas must receive message values.");
  assert(adminRoutes.includes("announcement_delivery_failed"), "Delivery failures need a stable API error.");
  assert(adminRoutes.includes("notificationCleanupError") && adminRoutes.includes(".eq('announcement_id', announcement.id)"), "Failed sends must remove partial notifications.");
  assert(adminRoutes.includes(".from('admin_announcements').delete().eq('id', announcement.id)"), "Failed sends must remove orphan announcements.");
  assert(adminRoutes.includes("countAnnouncementRecipients"), "Recipient totals must come from backend counts.");
  assert(adminRoutes.includes(".from('wallets')"), "Customer recipients must come from wallet registration.");
  assert(adminRoutes.includes(".eq('owner_type', 'customer')"), "Announcement customer counts must use customer wallets.");
  assert(adminRoutes.includes(".eq('owner_type', 'vendor')"), "Announcement vendor counts must use vendor wallets.");
  assert(adminRoutes.includes(".in('id', walletCustomerIds)"), "Announcement customer rows must be limited to wallet customers.");
  assert(adminRoutes.includes(".in('id', walletVendorIds)"), "Announcement vendor rows must be limited to wallet vendors.");
  assert(!adminRoutes.includes("if (!walletCustomerIds.length) return recipients"), "Empty customer wallets must not hide vendor recipients.");
  assert(!adminRoutes.includes("if (!walletVendorIds.length) return recipients"), "Empty vendor wallets must not discard customer recipients.");
  assert(adminRoutes.includes("recipient_type: r.type"), "Admin delivery must persist recipient type.");
  assert(adminRoutes.includes("vendor_organization_id: r.type === 'vendor' ? r.id : null"), "Vendor notification delivery missing.");
  assert(adminRoutes.includes("customer_id: r.type === 'customer' ? r.id : null"), "Customer notification delivery missing.");
  assert(adminRoutes.includes("admin.announcement.sent"), "Announcement sends must be audit logged.");

  assert(adminRouter.includes("path: '/announcements'"), "Admin route missing.");
  assert(adminRouter.includes("wallet.announcements.manage"), "Admin route must require announcement permission.");
  assert(adminShell.includes("Announcements"), "Admin sidebar link missing.");
  assert(adminShell.includes("wallet.announcements.manage"), "Admin sidebar must use announcement permission.");
  assert(adminPage.includes("/api/v1/admin/announcements/recipients"), "Admin page must load recipients.");
  assert(adminPage.includes("/api/v1/admin/announcements'"), "Admin page must send announcements.");
  assert(adminPage.includes("System wide"), "System-wide checkbox missing.");
  assert(adminPage.includes("recipient_keys"), "Selected-recipient payload missing.");
  assert(adminPage.includes("summary.value.total"), "Admin page must use backend recipient totals.");
  assert(adminPage.includes("audienceTotals.value.customers"), "Customer stat must use all-audience totals.");
  assert(adminPage.includes("audienceTotals.value.vendors"), "Vendor stat must use all-audience totals.");
  assert(adminPage.includes("new URLSearchParams({ audience: 'system', limit: '1' })"), "Announcement stats must load both customer and vendor totals.");
  assert(adminPage.includes("an-history-slider"), "Message history must render as a slider.");
  assert(adminPage.includes("scroll-snap-type: inline mandatory"), "Message history slider must snap cleanly.");
  assert(adminPage.includes("MessageSuccessHover"), "Announcement sends must show hover feedback.");
  assert(adminPage.includes("showFeedback('success'"), "Successful sends must show feedback.");
  assert(adminPage.includes("showFeedback('error'"), "Validation and delivery failures must show feedback.");
  assert(adminPage.includes(':disabled="sending"'), "Invalid forms must remain clickable for validation feedback.");
  assert(adminPage.includes("await loadHistory();"), "Message history must refresh immediately after send.");
  assert(adminPage.includes("}, 8000);"), "Success hover must remain visible long enough for review.");
  assert(adminPage.includes("Message history refreshed."), "Success feedback must confirm history refresh.");
  assert(adminPage.includes("Date.now()"), "History refresh must bypass stale cached responses.");
  assert(successHover.includes(":role=\"tone === 'error' ? 'alert' : 'status'\""), "Feedback semantics must match its tone.");
  assert(successHover.includes("tone?: 'success' | 'error'"), "Feedback component must support errors.");
  assert(successHover.includes("message-error-hover"), "Error feedback must be testable.");
  assert(successHover.includes("<Teleport to=\"body\">"), "Success hover must render outside shell clipping.");
  assert(successHover.includes("message-success-hover"), "Success hover must be testable.");
  assert(successHover.includes("z-index: 2147483000"), "Success hover must sit above menus and overlays.");
  assert(successHover.includes(".msh-enter-active"), "Success hover must animate in.");

  assert(vendorRoutes.includes("fastify.get('/notifications'"), "Vendor notifications inbox route missing.");
  assert(vendorRoutes.includes("fastify.post('/notifications/read-all'"), "Vendor read-all route missing.");
  assert(vendorRoutes.includes("fastify.patch('/notifications/:id/read'"), "Vendor mark-read route missing.");
  assert(vendorRoutes.includes("vendor_organization_id.eq."), "Vendor inbox must include organization-scoped announcement rows.");
  assert(vendorRoutes.includes("recipient_type.eq.vendor,recipient_id.eq."), "Vendor inbox must include recipient-scoped announcement rows.");
  assert(vendorRoutes.includes("admin_announcement_deliveries"), "Vendor inbox must fall back to announcement delivery rows.");
  assert(vendorRouter.includes("path: '/notifications'"), "Vendor notification route missing.");
  assert(vendorShell.includes("to=\"/notifications\""), "Vendor notification entry missing.");
  assert(vendorPage.includes("/api/v1/vendor/notifications"), "Vendor notification page must use backend inbox.");
  assert(customerPage.includes("admin_announcement"), "Customer inbox must render admin announcements.");
  assert(customerRoutes.includes("admin_announcement: true"), "Customer notification defaults must enable announcement inbox.");
  assert(customerRoutes.includes("customer_id.eq."), "Customer inbox must include legacy customer notification rows.");
  assert(customerRoutes.includes("recipient_type.eq.customer,recipient_id.eq."), "Customer inbox must include recipient-scoped announcement rows.");
  assert(customerRoutes.includes("admin_announcement_deliveries"), "Customer inbox must fall back to announcement delivery rows.");
  assert(notificationService.includes("| 'admin_announcement'"), "Notification type union must include admin announcements.");
  assert(notificationService.includes("recipient_type: 'customer'"), "Customer notifications must write recipient type.");
  assert(notificationService.includes("recipient_id: cu.id"), "Customer notifications must write recipient id.");

  assert(migration.includes("create table if not exists public.admin_announcements"), "Announcement table migration missing.");
  assert(migration.includes("admin_announcement_deliveries"), "Delivery table migration missing.");
  assert(migration.includes("vendor_organization_id uuid"), "Vendor notification column migration missing.");
  assert(migration.includes("recipient_type text"), "Recipient type migration missing.");
  assert(compatibilityMigration.includes("alter column message drop not null"), "Legacy message constraint normalization missing.");

  console.log(JSON.stringify({
    status: "admin announcements flow contract passed",
    coverage: ["admin compose", "mixed recipients", "customer inbox", "vendor inbox", "audit", "migration"]
  }, null, 2));
}

main();
