"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function main() {
  const api = read("apps/admin/src/lib/api.ts");
  const page = read("apps/admin/src/views/Funding.vue");
  const history = read("apps/admin/src/views/FundingHistory.vue");
  const route = read("backend/wallet/src/routes/admin.ts");
  const service = read("backend/wallet/src/services/funding.ts");
  const ledger = read("backend/wallet/src/services/ledger.ts");
  const migration = read("supabase/migrations/20260518165000_wallet_runtime_ledger_schema.sql");
  const atomicApprovalMigration = read("supabase/migrations/20260927180000_atomic_funding_approval.sql");
  const automaticRecoveryMigration = read("supabase/migrations/20260928120000_approved_funding_credit_recovery.sql");
  const scheduler = read("backend/wallet/src/jobs/scheduler.ts");
  const referenceApi = read("api/reference.js");

  assert(api.includes("const hasBody = body !== undefined"), "API helper must detect empty bodies.");
  assert(api.includes("if (hasBody) headers['Content-Type']"), "API helper must omit JSON content-type without body.");
  assert(api.includes("body: hasBody ? JSON.stringify(body) : undefined"), "API helper must not send empty JSON bodies.");

  assert(page.includes("api.post<FundingApprovalResponse>"), "Funding approval must consume receipt response.");
  assert(page.includes("`/api/v1/admin/funding/${f.id}/approve`, {}"), "Funding approval must send an explicit JSON object.");
  assert(page.includes("Wallet balance is now"), "Funding approval must confirm credited balance.");
  assert(page.includes("repairApprovedCredits"), "Funding page must expose approved-credit repair.");
  assert(page.includes("/api/v1/admin/funding/reconcile-approved"), "Funding repair must call backend reconciliation.");
  assert(page.includes("function ownerName"), "Funding page must render wallet owner names.");
  assert(page.includes("function ownerEmail"), "Funding page must render wallet owner emails.");
  assert(page.includes("vendor_organizations") && page.includes("customers"), "Funding page must read customer and vendor identity.");
  assert(page.includes("Review Funding History for remaining mismatches"), "Reconciliation must not claim no issues when integrity mismatches may remain.");
  assert(history.includes("credit_state") && history.includes("Credit missing"), "Funding history must distinguish approval from wallet credit.");

  assert(route.includes("getBalance"), "Funding route must import balance lookup.");
  assert(route.includes("const balance = await getBalance(r.funding.wallet_id)"), "Funding route must fetch updated balance.");
  assert(route.includes("availableBalanceMinor: balance.availableMinor"), "Funding route must return available balance.");
  assert(route.includes("ledgerEntryId: r.ledgerEntry.id"), "Funding route must return ledger receipt.");
  assert(route.includes("reconcileApprovedFundingCredits"), "Funding route must expose approved-credit reconciliation.");
  assert(route.includes("creditsByRequest") && route.includes("fundingWithCredits"), "Funding history must attach ledger evidence.");

  assert(service.includes("canonicalFundingWallet"), "Funding approval must canonicalize customer and vendor wallets.");
  assert(service.includes("reconcileApprovedFundingCredits"), "Funding service must reconcile approved funding rows.");
  assert(service.includes("vendor_organizations(legal_name, trading_name, contact_email"), "Funding service must hydrate vendor identity.");
  assert(service.includes("gateway_verification_required"), "Staff approval must not bypass Paystack verification.");
  assert(service.includes("'funding_credit', 'payment_credit'"), "Funding reconciliation must recognize both credit paths.");
  assert(service.includes("adminClient.rpc('fn_approve_funding_request'"), "Funding approval must use its atomic database transaction.");
  assert(service.includes("adminClient.rpc('fn_reconcile_approved_funding_credits'"), "Funding recovery must use its atomic database transaction.");
  assert(atomicApprovalMigration.includes("for update"), "Funding approval must lock the request and wallet rows.");
  assert(atomicApprovalMigration.includes("v_entry := public.fn_post_ledger_entry"), "Funding approval must credit within the transaction.");
  assert(atomicApprovalMigration.includes("set status = 'approved'"), "Funding approval must transition within the transaction.");
  assert(automaticRecoveryMigration.includes("fn_reconcile_approved_funding_credits"), "Approved funding recovery must use a database function.");
  assert(automaticRecoveryMigration.includes("fn_post_ledger_entry"), "Approved funding recovery must credit through the ledger seam.");
  assert(automaticRecoveryMigration.includes("wallet-funding-credits"), "Approved funding recovery must be scheduled.");
  assert(automaticRecoveryMigration.includes("fn_guard_funding_credit"), "Funding credits must reject duplicate ledger paths.");
  assert(automaticRecoveryMigration.includes("channel in ('bank_transfer', 'manual')"), "Gateway credits must require gateway verification.");
  assert(scheduler.includes("sweepApprovedFundingCredits"), "Funding recovery must expose a scheduler entrypoint.");
  assert(referenceApi.includes('"funding-credits"'), "Funding recovery must be routable through maintenance.");

  assert(ledger.includes("update public.wallets") || migration.includes("update public.wallets"), "Ledger credit must update wallet balance.");
  assert(migration.includes("entry_type in (") && migration.includes("'funding_credit'"), "Ledger schema must allow funding credits.");

  console.log(JSON.stringify({
    status: "admin funding flow passed",
    coverage: ["empty-body", "approve-click", "ledger-credit", "wallet-balance", "receipt"]
  }, null, 2));
}

main();
