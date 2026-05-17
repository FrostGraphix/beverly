"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const localDatabase = require("../backend/src/services/local-database");
const ledger = require("../backend/src/services/wallet-ledger-service");
const funding = require("../backend/src/services/wallet-funding-service");
const purchase = require("../backend/src/services/wallet-purchase-service");
const onboarding = require("../backend/src/services/vendor-onboarding-service");
const approvals = require("../backend/src/services/wallet-approval-service");
const reconciliation = require("../backend/src/services/wallet-reconciliation-service");

async function withTempDatabase(run) {
  const dbPath = path.join(__dirname, "..", "tmp", `wallet-${process.pid}-${Date.now()}.sqlite`);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const previousPath = process.env.LOCAL_DB_PATH;
  process.env.LOCAL_DB_PATH = dbPath;
  localDatabase.resetForTests();
  try {
    await run();
  } finally {
    localDatabase.resetForTests();
    if (previousPath === undefined) delete process.env.LOCAL_DB_PATH;
    else process.env.LOCAL_DB_PATH = previousPath;
  }
}

async function main() {
  await withTempDatabase(async () => {
    const organization = ledger.createVendorOrganization({
      organizationName: "Beverly Vendor Alpha",
      stationIds: ["TUNGA"],
      actorId: "admin"
    });
    assert.strictEqual(organization.status, "pending_review");

    const submission = onboarding.submitOnboarding({
      organizationId: organization.id,
      actorId: "vendor-user",
      businessIdentity: { registrationName: "Beverly Vendor Alpha" }
    });
    assert.strictEqual(submission.status, "pending_review");
    assert.throws(() => onboarding.reviewOnboarding({
      onboardingSubmissionId: submission.id,
      actorId: "vendor-user"
    }), /cannot review/i);
    const reviewed = onboarding.reviewOnboarding({
      onboardingSubmissionId: submission.id,
      actorId: "finance-checker"
    });
    assert.strictEqual(reviewed.status, "approved");

    const wallet = ledger.provisionWalletForOrganization({
      organizationId: organization.id,
      actorId: "finance"
    });
    assert.strictEqual(wallet.status, "active");
    assert.strictEqual(ledger.walletSummary(wallet.id).availableBalanceMinor, 0);

    const request = funding.createFundingRequest({
      organizationId: organization.id,
      amountMinor: 250000,
      idempotencyKey: "funding-alpha-1",
      actorId: "vendor-user"
    });
    assert.strictEqual(request.status, "initiated");

    const uploaded = funding.uploadFundingProof({
      fundingRequestId: request.id,
      storagePath: "proofs/alpha.png",
      fileName: "alpha.png",
      contentType: "image/png",
      actorId: "vendor-user"
    });
    assert.strictEqual(uploaded.status, "proof_uploaded");

    const approval = funding.approveFundingRequest({
      fundingRequestId: request.id,
      verifiedAmountMinor: 250000,
      actorId: "finance-checker",
      idempotencyKey: "funding-credit-alpha-1"
    });
    assert.strictEqual(approval.walletSummary.availableBalanceMinor, 250000);
    assert.throws(() => funding.approveFundingRequest({
      fundingRequestId: request.id,
      verifiedAmountMinor: 250000,
      actorId: "vendor-user"
    }), /not reviewable/i);

    const order = purchase.createPurchaseOrder({
      organizationId: organization.id,
      mode: "token",
      targetMeter: "MTR-100",
      customerName: "Ada Beverly",
      amountMinor: 50000,
      idempotencyKey: "purchase-alpha-1",
      actorId: "vendor-user"
    });
    assert.strictEqual(order.status, "hold_active");
    assert.strictEqual(ledger.walletSummary(wallet.id).heldBalanceMinor, 50000);

    const completed = purchase.completeTokenPurchase({
      purchaseOrderId: order.id,
      actorId: "vendor-user"
    });
    assert.strictEqual(completed.order.status, "delivered");
    assert.strictEqual(completed.deliveries[0].status, "token_generated");
    assert.strictEqual(completed.walletSummary.availableBalanceMinor, 200000);

    const manual = approvals.requestManualCredit({
      organizationId: organization.id,
      amountMinor: 15000,
      reasonCode: "support_remediation",
      actorId: "ops-maker",
      idempotencyKey: "manual-alpha-1"
    });
    assert.strictEqual(manual.status, "pending");
    assert.throws(() => approvals.approveManualCredit({
      approvalRequestId: manual.id,
      actorId: "ops-maker"
    }), /Maker cannot approve/i);
    const manualApproved = approvals.approveManualCredit({
      approvalRequestId: manual.id,
      actorId: "finance-checker"
    });
    assert.strictEqual(manualApproved.walletSummary.availableBalanceMinor, 215000);

    const remote = purchase.createPurchaseOrder({
      organizationId: organization.id,
      mode: "remote_send",
      targetMeter: "MTR-REMOTE",
      amountMinor: 10000,
      idempotencyKey: "remote-alpha-1",
      actorId: "vendor-user"
    });
    const remotePending = purchase.markRemoteSendPending({
      purchaseOrderId: remote.id,
      remoteReference: "REMOTE-PENDING",
      actorId: "vendor-user"
    });
    assert.strictEqual(remotePending.order.status, "delivery_pending_review");
    const remoteDone = purchase.completeRemoteSend({
      purchaseOrderId: remote.id,
      remoteReference: "REMOTE-DONE",
      actorId: "vendor-user"
    });
    assert.strictEqual(remoteDone.order.status, "delivered");

    const report = reconciliation.reportSummary();
    assert.strictEqual(report.pendingManualCredits, 0);
    assert(report.deliveredPurchaseMinor >= 60000);
    const recon = reconciliation.runReconciliation();
    assert.strictEqual(recon.status, "balanced");

    ledger.freezeWallet({
      walletId: wallet.id,
      actorId: "admin",
      reason: "test freeze"
    });
    assert.throws(() => purchase.createPurchaseOrder({
      organizationId: organization.id,
      mode: "token",
      targetMeter: "MTR-101",
      amountMinor: 1000,
      idempotencyKey: "purchase-frozen",
      actorId: "vendor-user"
    }), /not active/i);

    const counts = localDatabase.tableCounts();
    assert.strictEqual(counts.vendor_organizations, 1);
    assert.strictEqual(counts.vendor_wallets, 1);
    assert.strictEqual(counts.wallet_ledger_entries, 4);
    assert.strictEqual(counts.wallet_purchase_orders, 2);
    assert.strictEqual(counts.vendor_onboarding_submissions, 1);
    assert.strictEqual(counts.wallet_approval_requests, 1);

    console.log(JSON.stringify({
      status: "wallet ledger passed",
      availableBalanceMinor: completed.walletSummary.availableBalanceMinor,
      ledgerEntries: counts.wallet_ledger_entries,
      purchaseOrders: counts.wallet_purchase_orders,
      reconciliation: recon.status
    }, null, 2));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
