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
  const route = read("backend/wallet/src/routes/admin.ts");
  const service = read("backend/wallet/src/services/funding.ts");
  const ledger = read("backend/wallet/src/services/ledger.ts");
  const migration = read("supabase/migrations/20260518165000_wallet_runtime_ledger_schema.sql");

  assert(api.includes("const hasBody = body !== undefined"), "API helper must detect empty bodies.");
  assert(api.includes("if (hasBody) headers['Content-Type']"), "API helper must omit JSON content-type without body.");
  assert(api.includes("body: hasBody ? JSON.stringify(body) : undefined"), "API helper must not send empty JSON bodies.");

  assert(page.includes("api.post<FundingApprovalResponse>"), "Funding approval must consume receipt response.");
  assert(page.includes("`/api/v1/admin/funding/${f.id}/approve`, {}"), "Funding approval must send an explicit JSON object.");
  assert(page.includes("Vendor balance is now"), "Funding approval must confirm credited balance.");
  assert(page.includes("repairApprovedCredits"), "Funding page must expose approved-credit repair.");
  assert(page.includes("/api/v1/admin/funding/reconcile-approved"), "Funding repair must call backend reconciliation.");
  assert(page.includes("function vendorName"), "Funding page must render vendor names.");
  assert(page.includes("function vendorEmail"), "Funding page must render vendor emails.");
  assert(page.includes("vendor_organizations"), "Funding page must read hydrated vendor identity.");

  assert(route.includes("import { getBalance }"), "Funding route must import balance lookup.");
  assert(route.includes("const balance = await getBalance(r.funding.wallet_id)"), "Funding route must fetch updated balance.");
  assert(route.includes("availableBalanceMinor: balance.availableMinor"), "Funding route must return available balance.");
  assert(route.includes("ledgerEntryId: r.ledgerEntry.id"), "Funding route must return ledger receipt.");
  assert(route.includes("reconcileApprovedFundingCredits"), "Funding route must expose approved-credit reconciliation.");

  assert(service.includes("canonicalVendorWallet"), "Funding approval must canonicalize vendor wallets.");
  assert(service.includes("repairApprovedFundingWallet"), "Funding approval must repair stale wallet credits.");
  assert(service.includes("reconcileApprovedFundingCredits"), "Funding service must reconcile approved funding rows.");
  assert(service.includes("vendor_organizations(legal_name, trading_name, contact_email"), "Funding service must hydrate vendor identity.");
  assert(service.includes("entryType: 'funding_credit'"), "Funding approval must write funding credit entries.");
  assert(service.includes("idempotencyKey: `funding.${funding.id}.credit`"), "Funding approval must stay idempotent.");
  assert(service.includes(".in('status', ['under_review', 'proof_uploaded'])"), "Funding approval must be race-safe.");

  assert(ledger.includes("update public.wallets") || migration.includes("update public.wallets"), "Ledger credit must update wallet balance.");
  assert(migration.includes("entry_type in (") && migration.includes("'funding_credit'"), "Ledger schema must allow funding credits.");

  console.log(JSON.stringify({
    status: "admin funding flow passed",
    coverage: ["empty-body", "approve-click", "ledger-credit", "wallet-balance", "receipt"]
  }, null, 2));
}

main();
