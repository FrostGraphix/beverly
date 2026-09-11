import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const formatter = await import("../packages/tokens/notification-content.js");
const formatted = formatter.formatNotificationBody(
  "A clearer Beverly experience. 1. Review each charge before payment. 2. Download every receipt."
);

assert.deepStrictEqual(formatted, [
  { kind: "paragraph", text: "A clearer Beverly experience." },
  { kind: "item", marker: "1", text: "Review each charge before payment." },
  { kind: "item", marker: "2", text: "Download every receipt." },
]);

const component = read("packages/tokens/NotificationDetailModal.vue");
assert(component.includes('<Teleport to="body">'), "Details must escape portal shell clipping.");
assert(component.includes('role="dialog"'), "Details must expose dialog semantics.");
assert(component.includes('aria-modal="true"'), "Details must identify modal behavior.");
assert(component.includes("formatNotificationBody"), "Details must format announcement content.");
assert(component.includes("restoreFocus"), "Closing details must restore focus.");
assert(component.includes("@keydown.tab"), "Keyboard focus must remain inside details.");

const announcementHistory = read("apps/admin/src/views/Announcements.vue");
assert(announcementHistory.includes("formatNotificationBody"), "Announcement history must share content formatting.");
assert(announcementHistory.includes("an-detail-item"), "Announcement history must format numbered sections.");

for (const portal of ["admin", "vendor", "customer"]) {
  const view = read(`apps/${portal}/src/views/Notifications.vue`);
  assert(view.includes("NotificationDetailModal"), `${portal} must use shared notification details.`);
  assert(view.includes("selectedNotification"), `${portal} must retain the selected notification.`);
  assert(view.includes('aria-haspopup="dialog"'), `${portal} cards must announce dialog behavior.`);
  assert(view.includes("notification-preview"), `${portal} cards must clamp preview content.`);
  assert(view.includes("notification-card"), `${portal} entries must render as individual cards.`);
  assert(view.includes('@navigate="followNotificationPath"'), `${portal} must separate reading from navigation.`);
}

console.log(JSON.stringify({
  status: "notification reading experience passed",
  portals: ["admin", "vendor", "customer"],
}, null, 2));
