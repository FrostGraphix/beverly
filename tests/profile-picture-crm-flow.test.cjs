"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function assertIncludes(file, markers) {
  const source = read(file);
  for (const marker of markers) {
    assert.ok(source.includes(marker), `${file} missing required marker: "${marker}"`);
  }
}

function main() {
  console.log("Running profile picture CRM flow tests...");

  // 1. Check ProfilePictureCropModal.vue
  assertIncludes("src/components/ProfilePictureCropModal.vue", [
    "Crop Profile Picture",
    "crop-zoom-slider",
    "canvas.getContext",
    "image/jpeg"
  ]);

  // 2. Check ProfilePage.vue
  assertIncludes("src/components/ProfilePage.vue", [
    "ProfilePictureCropModal",
    "wallet-avatar-edit-btn",
    "wallet-avatar-menu",
    "uploadProfilePictureFlow",
    "removeProfilePictureFlow",
    "profile-picture-updated"
  ]);

  // 3. Check profile-store.mjs
  assertIncludes("src/services/profile-store.mjs", [
    "uploadProfilePictureFlow",
    "removeProfilePictureFlow",
    "/api/v1/admin/profile-picture/scan",
    "/api/v1/admin/profile-picture/upload-url",
    "/api/v1/admin/profile-picture/activate",
    "/api/v1/admin/profile-picture"
  ]);

  // 4. Check api/reference.js
  assertIncludes("api/reference.js", [
    "/api/v1/admin/profile-picture/scan",
    "/api/v1/admin/profile-picture/upload-url",
    "/api/v1/admin/profile-picture/activate",
    "/api/v1/admin/profile-picture"
  ]);

  // 5. Check App.vue
  assertIncludes("src/App.vue", [
    "@profile-picture-updated=\"handleProfilePictureUpdated\"",
    "handleProfilePictureUpdated(newUrl)"
  ]);

  console.log("✅ Profile picture CRM flow tests passed successfully!");
}

main();
