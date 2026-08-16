"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function after(source, marker) {
  const index = source.indexOf(marker);
  assert(index >= 0, `Missing marker: ${marker}`);
  return source.slice(index);
}

function main() {
  const wallets = read("backend/wallet/src/services/wallets.ts");
  const ledger = read("backend/wallet/src/services/ledger.ts");
  const funding = read("backend/wallet/src/services/funding.ts");
  const vending = read("backend/wallet/src/services/vending.ts");
  const customerPurchase = read("backend/wallet/src/services/customer-purchase.ts");
  const vendorRoutes = read("backend/wallet/src/routes/vendor.ts");
  const customerRoutes = read("backend/wallet/src/routes/customer.ts");
  const adminRoutes = read("backend/wallet/src/routes/admin.ts");
  const webhooks = read("backend/wallet/src/routes/webhooks.ts");
  const paymentWebhooks = read("backend/wallet/src/services/payment-webhooks.ts");
  const paymentTransactions = read("backend/wallet/src/services/payment-transactions.ts");
  const onboarding = read("backend/wallet/src/services/vendor-onboarding.ts");
  const migration = read("supabase/migrations/20260521230000_wallet_freeze_guardrails.sql");

  assert(wallets.includes("assertWalletCanTransact"), "Wallet state helper must exist.");
  assert(wallets.includes("wallet_frozen"), "Frozen wallet error code must be explicit.");
  assert(wallets.includes("wallet_closed_final"), "Closed wallets must be final.");
  assert(wallets.includes("assertOwnerWalletTransitionAllowed"), "Owner-level transition guard must exist.");
  assert(wallets.includes("ownerType === 'vendor' ? 'vendor_organizations' : 'customers'"), "Owner guard must resolve owner status table.");
  assert(wallets.includes("`${ownerType}_closed_final`"), "Owner closed-final error code must include owner type.");

  assert(ledger.includes("assertWalletCanTransact(wallet as any, 'place holds')"), "Holds must reject frozen wallets before balance checks.");
  assert(funding.match(/assertWalletCanTransact\(wallet, 'receive funding'\)/g)?.length >= 2, "Vendor funding must reject frozen wallets.");
  assert(funding.includes("assertWalletCanTransact(wallet, 'upload funding proof')"), "Proof uploads must reject frozen wallets.");
  assert(funding.includes("assertWalletCanTransact(canonicalWallet, 'receive funding')"), "Funding approval and repairs must re-check wallet status.");
  assert(funding.includes("blockedInactive"), "Funding reconciliation must report inactive-wallet skips.");
  assert(vending.includes("assertWalletCanTransact(wallet, 'vend')"), "Vendor vending must reject frozen wallets.");
  assert(customerPurchase.includes("assertWalletCanTransact(customerWallet, 'buy tokens')"), "Customer token purchases must reject frozen wallets.");
  assert(customerPurchase.includes("assertWalletCanTransact(wallet, 'receive funding')"), "Customer funding must reject frozen wallets.");
  assert(webhooks.includes("processPaystackChargeSuccess"), "Paystack webhooks must use shared processing.");
  assert(paymentWebhooks.includes("fulfillSuccessfulPaystackTransaction"), "Paystack webhook processing must use shared fulfillment.");
  assert(paymentTransactions.includes("blockSuccessfulPaymentFulfillment"), "Paystack fulfillment must fail cleanly when wallet state changes after payment init.");
  assert(paymentTransactions.includes("assertWalletCanTransact(wallet, 'receive funding')"), "Paystack funding credits must reject frozen wallets.");
  assert(paymentTransactions.includes("assertWalletCanTransact(wallet, 'buy tokens')"), "Paystack direct-pay token delivery must reject frozen wallets.");
  assert(paymentTransactions.includes("requires_ops_review"), "Blocked Paystack payments must be tagged for operations review.");
  assert(paymentTransactions.includes("status: 'delivery_pending_review'"), "Blocked token delivery must move to pending review.");
  assert(paymentTransactions.includes("status: 'under_review'"), "Blocked vendor funding must stay in finance review queue.");

  assert(vendorRoutes.includes("VendingError"), "Vendor vend route must translate vending errors.");
  assert(vendorRoutes.includes("error.code === 'wallet_inactive' || error.code === 'wallet_frozen' || error.code === 'wallet_closed' ? 403"), "Vendor route must return 403 for inactive wallets.");
  assert(vendorRoutes.includes("['wallet_inactive', 'wallet_frozen', 'wallet_closed'].includes(e.code) ? 403"), "Vendor funding route must return 403 for inactive wallets.");
  assert(customerRoutes.includes("e.code === 'wallet_inactive' || e.code === 'wallet_frozen' || e.code === 'wallet_closed' ? 403"), "Customer purchase route must return 403 for inactive wallets.");
  assert(customerRoutes.includes("ledger_balance_minor"), "Customer wallet summary must use v_wallet_balances ledger field.");
  assert(customerRoutes.includes("active_holds_minor"), "Customer wallet summary must use v_wallet_balances hold field.");
  assert(customerRoutes.includes("available_balance_minor"), "Customer wallet summary must use v_wallet_balances available field.");

  assert(adminRoutes.includes("customer_closed_final"), "Closed customer reactivation must be rejected.");
  assert(onboarding.includes("vendor_closed_final"), "Closed vendor reactivation must be rejected.");
  assert(wallets.includes("setOwnerWalletStatus"), "Owner status changes must reuse closed-wallet guards.");
  assert(adminRoutes.includes("requireWalletStatusManager"), "Direct wallet status changes must be super-admin gated.");
  assert(adminRoutes.includes("Only Super Admins can freeze, unfreeze, close, or reactivate wallets."), "Wallet status route must not depend only on funding approval permission.");
  const customerStatusRoute = after(adminRoutes, "fastify.patch('/customers/:id/status'");
  const vendorStatusService = after(onboarding, "export async function setVendorStatus");
  assert(customerStatusRoute.indexOf("await setOwnerWalletStatus('customer', id, walletStatus)") < customerStatusRoute.indexOf(".from('customers').update({ status: body.status })"), "Customer status changes must update guarded wallets before owner state.");
  assert(vendorStatusService.indexOf("await setOwnerWalletStatus('vendor', vendorOrganizationId, walletStatus)") < vendorStatusService.indexOf(".update({ status: newStatus"), "Vendor status changes must update guarded wallets before owner state.");
  assert(migration.includes("trg_wallet_hold_guard"), "Database must block holds on frozen wallets.");
  assert(migration.includes("trg_wallet_closed_final_guard"), "Database must block closed-wallet reactivation.");

  console.log(JSON.stringify({
    status: "wallet freeze suspension passed",
    coverage: ["vendor-freeze", "customer-suspension", "hold-guard", "closed-final", "webhook-guard", "api-errors", "customer-balance"]
  }, null, 2));
}

main();
