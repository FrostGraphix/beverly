"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const router = read("apps/customer/src/router/index.ts");
const shell = read("apps/customer/src/components/AppShell.vue");
const view = read("apps/customer/src/views/Notifications.vue");
const routes = read("backend/wallet/src/routes/customer.ts");
const service = read("backend/wallet/src/services/notifications.ts");
const migration = read("supabase/migrations/20260521100000_notifications_inbox.sql");

assert(router.includes("path: '/notifications'"), "customer notifications route missing");
assert(shell.includes("/api/v1/customer/notifications?limit=1"), "shell unread badge endpoint missing");
assert(shell.includes('to="/notifications"'), "shell notifications link missing");

for (const endpoint of [
  "fastify.get('/notifications'",
  "fastify.post('/notifications/read-all'",
  "fastify.patch('/notifications/:id/read'",
  "fastify.get('/notifications/preferences'",
  "fastify.put('/notifications/preferences'",
]) {
  assert(routes.includes(endpoint), `${endpoint} missing`);
}

assert(routes.includes("mergeNotificationPrefs"), "preferences must merge defaults");
assert(routes.includes("isMissingNotificationsStorage"), "missing storage guard missing");
assert(routes.includes("notification_storage_missing"), "preferences migration error missing");

for (const apiCall of [
  "/api/v1/customer/notifications",
  "/api/v1/customer/notifications/read-all",
  "/api/v1/customer/notifications/preferences",
]) {
  assert(view.includes(apiCall), `${apiCall} missing from customer view`);
}

for (const eventType of [
  "token_purchased",
  "wallet_funded",
  "kyc_update",
  "dispute_update",
  "low_balance",
  "payment_failed",
  "meter_order_update",
]) {
  assert(view.includes(eventType), `${eventType} missing from preferences UI`);
  assert(routes.includes(eventType) || service.includes(eventType), `${eventType} missing from backend`);
}

assert(service.includes("adminClient.from('notifications').insert"), "in-app write missing");
assert(service.includes("notifyMeterOrderUpdate"), "meter order notifier missing");
assert(migration.includes("create table if not exists public.notifications"), "notifications table migration missing");
assert(migration.includes("notification_preferences jsonb"), "preferences column migration missing");
assert(migration.includes("information_schema.columns"), "legacy column guards missing");
assert(migration.includes("notify pgrst"), "schema reload missing");

console.log(JSON.stringify({
  status: "customer notifications contract passed",
  endpoints: 5,
}, null, 2));
