"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function main() {
  const customerFlow = read("apps/customer/src/lib/auth-flow.ts");
  const adminPortals = read("apps/admin/src/lib/portals.ts");
  const adminAppShell = read("apps/admin/src/components/AppShell.vue");
  const landingChooser = read("apps/wallet-landing/src/components/PortalChooser.vue");
  const customerLogin = read("apps/customer/src/views/Login.vue");
  const vendorLogin = read("apps/vendor/src/views/Login.vue");
  const adminLogin = read("apps/admin/src/views/Login.vue");
  const landingNav = read("apps/wallet-landing/src/components/LandingNav.vue");
  const adminRouter = read("apps/admin/src/router/index.ts");
  const pkg = JSON.parse(read("package.json"));

  // 1. Verify customer auth storage key standardization & legacy fallback
  assert.match(customerFlow, /CUSTOMER_TOKEN_KEY = 'beverly\.customer\.access_token'/);
  assert.match(customerFlow, /LEGACY_CUSTOMER_TOKEN_KEY = 'beverly\.access_token'/);
  assert.match(customerFlow, /sessionStorage\.getItem\(LEGACY_CUSTOMER_TOKEN_KEY\)/);
  assert.match(customerFlow, /localStorage\.removeItem\(LEGACY_CUSTOMER_TOKEN_KEY\)/);

  // 2. Verify admin portal resolver & AppShell switcher & CRM eligibility
  assert.match(adminPortals, /export const PORTAL_URLS = \{/);
  assert.match(adminAppShell, /import \{ PORTAL_URLS \} from '\.\.\/lib\/portals'/);
  assert.match(adminAppShell, /:href="PORTAL_URLS\.vendor"/);
  assert.match(adminAppShell, /:href="PORTAL_URLS\.customer"/);
  assert.match(adminAppShell, /:href="PORTAL_URLS\.landing"/);
  assert.match(adminAppShell, /isCrmEligible/);

  // 3. Verify landing chooser & nav session awareness
  assert.match(landingChooser, /hasStaffSession\.value/);
  assert.match(landingChooser, /hasCustomerSession\.value/);
  assert.match(landingChooser, /hasVendorSession\.value/);
  assert.match(landingChooser, /Open Admin CRM/);
  assert.match(landingNav, /activeSessionHref/);
  assert.match(landingNav, /activeSessionLabel/);

  // 4. Verify login cross-portal active session banners & vendor/customer rejection
  assert.match(customerLogin, /hasStaffSession\.value/);
  assert.match(customerLogin, /hasVendorSession\.value/);
  assert.match(vendorLogin, /hasStaffSession\.value/);
  assert.match(vendorLogin, /hasCustomerSession\.value/);
  assert.match(adminLogin, /hasVendorSession\.value/);
  assert.match(adminLogin, /hasCustomerSession\.value/);
  assert.match(adminLogin, /Access Denied: Vendor and Customer accounts cannot sign in to Beverly Wallet Admin/);

  // 5. Verify deactivated automatic pathname override in router
  assert.match(adminRouter, /DEACTIVATED: Automatic pathname rewrite override/);

  // 6. Verify package.json test script registration
  assert.match(pkg.scripts["test:auth"], /tests\/customer-vendor-landing-redirection-contract\.test\.cjs/);

  console.log({
    status: "customer vendor landing redirection contract passed",
    portals: ["customer", "vendor", "admin", "landing"],
    coverage: [
      "storage-key-standardization",
      "legacy-token-fallback",
      "admin-portal-switcher",
      "landing-session-awareness",
      "cross-portal-session-banners",
    ],
  });
}

main();
