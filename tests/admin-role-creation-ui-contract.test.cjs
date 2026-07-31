"use strict";

// Custom role creation contract.
//
// Behavioural coverage for slug/reserved-name/grantability rules lives in
// backend/wallet/src/services/__tests__/role-identity.test.ts. This file guards
// the wiring: that the editor routes through the critical-permission
// confirmation, that the server enforces the same rules the UI shows, and that
// custom roles are visible wherever roles are listed.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const view = read("apps/admin/src/views/RolesPermissions.vue");
const permissionsView = read("apps/admin/src/views/Permissions.vue");
const adminRoutes = read("backend/wallet/src/routes/admin.ts");

/* ── entry points still exist ──────────────────────────────────────────── */

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

/* ── critical permissions are confirmed before they are granted ────────── */

assert.match(
  view,
  /@submit\.prevent="requestSaveRole"/,
  "the role editor must submit through the confirmation gate, not straight to saveRole",
);
assert.match(
  view,
  /editorCriticalPermissions = computed/,
  "the editor must compute which selected permissions are critical",
);
assert.match(
  view,
  /danger: true,\s*\n\s*fn: \(\) => saveRole\(\),/,
  "granting critical permissions must raise the danger confirmation before saving",
);
assert.match(view, /ac-editor-warning/, "selected critical permissions must be visible in the editor before save");

/* ── the UI blocks what the server blocks ──────────────────────────────── */

assert.match(
  view,
  /RESTRICTED_TO_SYSTEM_ROLES = \['dev\.console'\]/,
  "the editor must mirror the server's non-grantable permission list",
);
assert.match(view, /isGrantableToRole/, "non-grantable permissions must be disabled in the editor");
assert.match(
  adminRoutes,
  /permission_not_grantable/,
  "the server must reject non-grantable permissions regardless of what the UI sent",
);
assert.ok(
  (adminRoutes.match(/ungrantablePermissions\(/g) || []).length >= 2,
  "both the create and the permissions-update routes must enforce grantability",
);

/* ── role naming rules ─────────────────────────────────────────────────── */

assert.match(adminRoutes, /role_name_reserved/, "a custom role must not be able to impersonate a system role name");
assert.match(adminRoutes, /role_name_taken/, "two roles must not share a display name");
assert.match(
  adminRoutes,
  /Role names must contain at least two latin letters or digits/,
  "the invalid-name message must state the real cause",
);
assert.match(
  adminRoutes,
  /resolves to the same role key as an existing role/,
  "a slug collision must explain why two visibly different names clash",
);
assert.match(adminRoutes, /isUniqueViolation\(roleError\)/, "a lost create race must return 409, not a generic 400");

/* ── a role with no permissions is not shippable ───────────────────────── */

assert.match(
  adminRoutes,
  /permissions: z\.array\(z\.string\(\)\)\.min\(1\)\.max\(PERMISSION_CATALOG\.length\)/,
  "the server must reject a permission-less role",
);
assert.match(view, /editorCanSave/, "the editor must disable save until the role is valid");
assert.match(view, /minlength="2"/, "the name field must enforce the same minimum the server does");

/* ── validation detail reaches the operator ────────────────────────────── */

assert.match(
  view,
  /e\.details\.map\(\(d: any\) => `\$\{d\.path\}: \$\{d\.message\}`\)/,
  "field-level validation errors must be surfaced, not collapsed into a generic toast",
);

/* ── system roles come from the server, not a second hardcoded list ────── */

assert.match(view, /systemRoleKeys/, "system roles must be derived from the /access payload");
assert.match(view, /d\.defaults/, "the view must read the defaults map the server already returns");

/* ── custom roles are visible wherever roles are listed ────────────────── */

assert.ok(
  !/const STAFF_ROLES = /.test(permissionsView),
  "the permissions matrix must not filter to a hardcoded role list — custom roles were invisible there",
);
assert.match(permissionsView, /SYSTEM_ROLE_ORDER/, "system roles keep a stable order, custom roles follow");

/* ── the confirmation must be visible above the editor that raised it ──── */

assert.match(
  view,
  /class="ac-overlay ac-overlay--top"/,
  "the confirm overlay must outrank the role editor — all .ac-overlay share a z-index and the editor is teleported later, so it would paint over the confirmation",
);
assert.match(view, /\.ac-overlay--top \{ z-index: 260; \}/, "the confirm overlay needs a higher stacking context than .ac-overlay");

/* ── legacy roles.name enum must not be written ────────────────────────── */

assert.ok(
  !/name: roleKey, role_key: roleKey/.test(adminRoutes),
  "custom-role inserts must not write roles.name — it is the legacy app_role enum and has no member for a custom role",
);
assert.match(
  adminRoutes,
  /role_key: roleKey, role_name: body\.name, label: body\.name/,
  "identity is role_key; the display name belongs in role_name/label",
);
assert.match(
  adminRoutes,
  /role_schema_migration_required/,
  "an unmigrated database must say so, not fail as a generic role_create_failed",
);
assert.ok(
  fs.existsSync(path.join(root, "supabase/migrations/20260728140000_roles_name_nullable.sql")),
  "the roles.name migration must ship with the code that depends on it",
);

/* ── exact-match lookups must not be pattern matches ───────────────────── */

assert.ok(
  !/ilike\('role_name', body\.name\)/.test(adminRoutes),
  "role-name uniqueness must escape LIKE metacharacters, or a name containing % or _ matches unrelated roles",
);
assert.ok(
  (adminRoutes.match(/escapeLikePattern\(body\.name\)/g) || []).length >= 2,
  "both the create and rename paths must escape the name before an ilike lookup",
);

/* ── dialog accessibility ──────────────────────────────────────────────── */

assert.match(view, /aria-labelledby="ac-role-editor-title"/, "the role editor must be a labelled dialog");
assert.match(view, /aria-modal="true"/, "the role editor must be a modal dialog");
assert.match(view, /aria-label="Close role editor"/, "the close control must have an accessible name");
assert.match(view, /@keydown\.esc="roleEditor\.open = false"/, "the role editor must close on Escape");

console.log("admin role creation UI contract passed");
