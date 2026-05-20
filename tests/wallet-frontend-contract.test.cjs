"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function main() {
  const routeManifest = read("src/data/route-manifest.js");
  const app = read("src/App.vue");
  const vendorPage = read("src/components/vendor/VendorWalletPage.vue");
  const vendorAuthPage = read("src/components/vendor/VendorAuthPage.vue");
  const adminPage = read("src/components/wallet/AdminWalletOperationsPage.vue");
  const loginPage = read("src/components/LoginPage.vue");
  const service = read("src/services/vendor-wallet-service.mjs");
  const fundingService = read("src/services/vendor-funding-service.mjs");
  const purchaseService = read("src/services/vendor-purchase-service.mjs");
  const migration = read("supabase/migrations/20260512190000_vendor_wallet_foundation.sql");

  assert(routeManifest.includes("#/wallet"));
  assert(routeManifest.includes("vendor_user"));
  assert(routeManifest.includes("finance-checker"));
  assert(routeManifest.includes("normalizeRoleId"));

  assert(app.includes("LoginPage"));
  assert(app.includes("handleSignOut"));
  assert(app.includes("userDropdownOpen"));

  assert(vendorAuthPage.includes("Beverly Wallet Access"));
  assert(vendorAuthPage.includes("Designed for fast wallet entry"));
  assert(vendorAuthPage.includes("Sign up"));
  assert(vendorAuthPage.includes("Forgot password"));
  assert(vendorAuthPage.includes("wallet-auth-proof"));
  assert(vendorAuthPage.includes("vendor-authenticated"));

  assert(!loginPage.includes("Vendor portal"));
  assert(!loginPage.includes("Enter admin workspace"));
  assert(!loginPage.includes("Enter vendor portal"));
  assert(!loginPage.includes("demoLogin"));

  assert(vendorPage.includes("Available balance"));
  assert(vendorPage.includes("Pending funding"));
  assert(vendorPage.includes("Request top-up"));
  assert(vendorPage.includes("Generate token"));
  assert(vendorPage.includes("Remote send"));
  assert(vendorPage.includes("Customer direct"));
  assert(vendorPage.includes("Receipt"));
  assert(vendorPage.includes("Purchase history"));
  assert(vendorPage.includes("Token retrieval"));
  assert(vendorPage.includes("vendor-funding-service"));
  assert(vendorPage.includes("vendor-purchase-service"));

  assert(adminPage.includes("Wallet Admin Dashboard"));
  assert(adminPage.includes("Vendors"));
  assert(adminPage.includes("Create Vendor"));
  assert(adminPage.includes("Users & Roles"));
  assert(adminPage.includes("Role & Permissions Matrix"));
  assert(adminPage.includes("Vendor Verification"));
  assert(adminPage.includes("Wallet Balances"));
  assert(adminPage.includes("Funding & Manual Credits"));
  assert(adminPage.includes("Vending Monitor"));
  assert(adminPage.includes("Reversals"));
  assert(adminPage.includes("Disputes"));
  assert(adminPage.includes("Settlement"));
  assert(adminPage.includes("Reports"));
  assert(adminPage.includes("Audit Log"));
  assert(adminPage.includes("maker-checker"));
  assert(adminPage.includes("temporaryPassword"));

  assert(service.includes("/api/wallet/summary"));
  assert(service.includes("/api/wallet/funding/create"));
  assert(service.includes("/api/wallet/purchase/complete-token"));
  assert(service.includes("/api/wallet/purchase/complete-remote"));
  assert(service.includes("/api/wallet/manual-credit/request"));
  assert(service.includes("/api/wallet/reconciliation/run"));
  assert(fundingService.includes("createFundingRequest"));
  assert(purchaseService.includes("createTokenPurchase"));

  assert(migration.includes("current_vendor_organization_id"));
  assert(migration.includes("vendors read own wallet"));
  assert(migration.includes("vendors read own ledger"));
  assert(migration.includes("wallet staff reads funding"));
  assert(migration.includes("finance-checker"));
  assert(migration.includes("wallet_approval_requests"));
  assert(migration.includes("vendor_onboarding_submissions"));
  assert(migration.includes("wallet_reconciliation_runs"));

  console.log(JSON.stringify({
    status: "wallet frontend contract passed",
    routes: ["#/wallet/vendor", "#/wallet/operations"]
  }, null, 2));
}

main();
