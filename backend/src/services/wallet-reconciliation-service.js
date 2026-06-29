"use strict";

const { ensureDatabase } = require("./local-database");
const ledger = require("./wallet-ledger-service");
const funding = require("./wallet-funding-service");
const purchase = require("./wallet-purchase-service");
const approvals = require("./wallet-approval-service");

function ensureSchema() {
  const db = ensureDatabase();
  if (db.memoryStore) {
    db.memoryStore.wallet_reconciliation_runs = db.memoryStore.wallet_reconciliation_runs || [];
    db.memoryStore.wallet_risk_events = db.memoryStore.wallet_risk_events || [];
    return db;
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_reconciliation_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      mismatch_count INTEGER NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wallet_risk_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function nowIso() {
  return new Date().toISOString();
}

function reportSummary(options = {}) {
  ensureSchema();
  const fundingRows = funding.listFundingRequests({ limit: options.limit || 500 });
  const purchaseRows = purchase.listPurchaseOrders({ limit: options.limit || 500 });
  const approvalRows = approvals.listApprovalRequests({});
  const approvedFundingMinor = fundingRows
    .filter((row) => row.status === "approved")
    .reduce((total, row) => total + Number(row.verifiedAmountMinor || row.amountMinor || 0), 0);
  const deliveredPurchaseMinor = purchaseRows
    .filter((row) => row.status === "delivered")
    .reduce((total, row) => total + Number(row.amountMinor || 0), 0);
  return {
    fundingRequests: fundingRows.length,
    pendingFunding: fundingRows.filter((row) => ["proof_uploaded", "under_review"].includes(row.status)).length,
    approvedFundingMinor,
    purchaseOrders: purchaseRows.length,
    deliveredPurchaseMinor,
    failedPurchases: purchaseRows.filter((row) => row.status === "failed").length,
    pendingDeliveries: purchaseRows.filter((row) => row.status === "delivery_pending_review").length,
    manualCreditRequests: approvalRows.length,
    pendingManualCredits: approvalRows.filter((row) => row.status === "pending").length
  };
}

function runReconciliation() {
  const db = ensureSchema();
  const summary = reportSummary();
  const mismatches = [];
  for (const order of purchase.listPurchaseOrders({ limit: 500 })) {
    const detail = purchase.purchaseDetail(order.id);
    const captured = ledger.ledgerRows(order.walletId).some((row) =>
      row.referenceId === order.id && row.entryType === "purchase_capture"
    );
    if (order.status === "delivered" && !captured) {
      mismatches.push({ type: "delivered_without_capture", orderId: order.id });
    }
    if (order.status === "delivery_pending_review" && !detail.deliveries.length) {
      mismatches.push({ type: "pending_without_delivery", orderId: order.id });
    }
  }
  const run = {
    id: `recon-${Date.now()}`,
    status: mismatches.length ? "mismatch" : "balanced",
    mismatchCount: mismatches.length,
    details: { summary, mismatches },
    createdAt: nowIso()
  };
  if (db.memoryStore) {
    db.memoryStore.wallet_reconciliation_runs.push(run);
  } else {
    db.prepare(`
      INSERT INTO wallet_reconciliation_runs (id, status, mismatch_count, detail_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(run.id, run.status, run.mismatchCount, JSON.stringify(run.details), run.createdAt);
  }
  return run;
}

module.exports = {
  reportSummary,
  runReconciliation
};
