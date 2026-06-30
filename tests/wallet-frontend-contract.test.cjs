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
  const customerApi = read("apps/customer/src/lib/api.ts");
  const vendorApi = read("apps/vendor/src/lib/api.ts");
  const buyToken = read("apps/customer/src/views/BuyToken.vue");
  const buyMeter = read("apps/customer/src/views/BuyMeter.vue");
  const fundWallet = read("apps/customer/src/views/FundWallet.vue");
  const customerReceipt = read("apps/customer/src/views/ReceiptDetail.vue");
  const customerReceipts = read("apps/customer/src/views/Receipts.vue");
  const customerMeters = read("apps/customer/src/views/Meters.vue");
  const customerChat = read("apps/customer/src/components/ChatWidget.vue");
  const vendorChat = read("apps/vendor/src/components/ChatWidget.vue");
  const customerShell = read("apps/customer/src/components/AppShell.vue");
  const vendorFund = read("apps/vendor/src/views/Fund.vue");
  const customerRoute = read("backend/wallet/src/routes/customer.ts");

  assert(!routeManifest.includes("#/wallet/admin/dashboard"));
  assert(!routeManifest.includes('customComponent: "AdminWalletOperationsPage"'));
  assert(routeManifest.includes('#/admin/reports'));
  assert(routeManifest.includes('customComponent: "ReportsPage"'));
  assert(!routeManifest.includes('devExternalUrl: "http://localhost:5175"'));
  assert(!routeManifest.includes("admin.beverly.acoblighting.com"));
  assert(routeManifest.includes("vendor_user"));
  assert(routeManifest.includes("finance-checker"));
  assert(routeManifest.includes("normalizeRoleId"));

  assert(app.includes("LoginPage"));
  assert(app.includes("handleSignOut"));
  assert(app.includes("userDropdownOpen"));
  assert(app.includes('normalizeHash(nextHash).startsWith("#/wallet/admin/")'));
  assert(!app.includes("AdminWalletOperationsPage v-else-if"));
  assert(app.includes('ReportsPage v-else-if="route.customComponent'));

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
  assert(adminPage.includes("wallet-admin-sidebar"));
  assert(adminPage.includes("wallet-admin-topbar"));
  assert(adminPage.includes("wallet-date-range"));
  assert(adminPage.includes("Wallet Admin Source of Truth"));
  assert(adminPage.includes("exportReportExcelXml"));
  assert(adminPage.includes("reportRowsInRange"));
  assert(adminPage.includes("dateRangeStart"));
  assert(app.includes("VITE_ADMIN_URL"));

  assert(service.includes("/api/wallet/summary"));
  assert(service.includes("/api/wallet/funding/create"));
  assert(service.includes("/api/wallet/purchase/complete-token"));
  assert(service.includes("/api/wallet/purchase/complete-remote"));
  assert(service.includes("/api/wallet/manual-credit/request"));
  assert(service.includes("/api/wallet/reconciliation/run"));
  assert(fundingService.includes("createFundingRequest"));
  assert(purchaseService.includes("createTokenPurchase"));

  assert(customerApi.includes("redirectToPayment"));
  assert(customerApi.includes("checkout.paystack.com"));
  assert(vendorApi.includes("redirectToPayment"));
  assert(vendorApi.includes("checkout.paystack.com"));
  assert(buyToken.includes("redirectToPayment(r.authorizationUrl)"));
  assert(buyMeter.includes("redirectToPayment(data.authorization_url)"));
  assert(fundWallet.includes("redirectToPayment(r.authorizationUrl)"));
  assert(vendorFund.includes("redirectToPayment(r.authorizationUrl)"));
  assert(buyToken.includes("callback_url"));
  assert(buyToken.includes("/buy-token?paid=1"));
  assert(fundWallet.includes("/wallet/fund?funded=1"));
  assert(vendorFund.includes("/wallet/fund?funded=1"));
  assert(customerRoute.includes("callback_url"));
  assert(!buyToken.includes("window.location.href = r.authorizationUrl"));
  assert(!buyMeter.includes("window.location.href = data.authorization_url"));
  assert(!fundWallet.includes("window.location.href = r.authorizationUrl"));
  assert(!vendorFund.includes("window.location.assign(r.authorizationUrl)"));
  assert(customerReceipt.includes("api.get<any>"));
  assert(customerReceipt.includes("function disputeOrderId"));
  assert(customerReceipt.includes("purchase_order_id"));
  assert(!customerReceipt.includes("encodeURIComponent(receipt.reference)"));
  assert(customerReceipts.includes("function disputeOrderId"));
  assert(!customerReceipts.includes("encodeURIComponent(selected.reference)"));
  assert(!customerReceipt.includes("http://localhost:4000"));
  assert(customerMeters.includes("meter-install-card"));
  assert(customerMeters.includes("Certified install"));
  assert(customerMeters.includes('to="/meter-orders"'));
  assert(customerMeters.includes('to="/buy-meter"'));
  assert(!customerMeters.includes("style=\"display:flex; align-items:center; gap: var(--s-4); margin-bottom: var(--s-4); padding: var(--s-4)\""));
  assert(customerChat.includes("width: 46px; height: 46px"));
  assert(customerChat.includes("animation: cw-float"));
  assert(vendorChat.includes("width: 46px; height: 46px"));
  assert(vendorChat.includes("animation: cw-float"));
  assert(customerShell.includes('aria-label="Help & support"'));
  const helpIcon = customerShell.match(/aria-label="Help & support"[\s\S]*?<\/RouterLink>/)?.[0] ?? "";
  assert(helpIcon.includes('a8 8 0 0 1 16 0v1'));
  assert(!helpIcon.includes('M9.1 9a3 3 0 0 1 5.8 1'));

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
