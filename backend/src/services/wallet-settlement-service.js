"use strict";

const crypto = require("crypto");
const { ensureDatabase } = require("./local-database");
const ledger = require("./wallet-ledger-service");
const purchase = require("./wallet-purchase-service");
const funding = require("./wallet-funding-service");

const batchStates = new Set(["pending", "processing", "settled", "failed", "cancelled"]);

function nowIso() { return new Date().toISOString(); }
function uid() { return crypto.randomUUID(); }
function jsonText(v) { return JSON.stringify(v || {}); }
function parseJson(v, fallback = {}) { try { return JSON.parse(v); } catch { return fallback; } }

function ensureMemoryStore(db) {
  if (!db?.memoryStore) return;
  db.memoryStore.wallet_settlement_batches = db.memoryStore.wallet_settlement_batches || [];
}

function ensureSchema() {
  const db = ensureDatabase();
  ensureMemoryStore(db);
  if (db.memoryStore) return db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_settlement_batches (
      id TEXT PRIMARY KEY,
      batch_ref TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      total_purchase_minor INTEGER NOT NULL DEFAULT 0,
      total_funding_minor INTEGER NOT NULL DEFAULT 0,
      total_refund_minor INTEGER NOT NULL DEFAULT 0,
      net_minor INTEGER NOT NULL DEFAULT 0,
      purchase_count INTEGER NOT NULL DEFAULT 0,
      funding_count INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'NGN',
      initiated_by TEXT NOT NULL,
      settled_by TEXT NOT NULL DEFAULT '',
      detail_json TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      settled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function generateSettlementBatch({ initiatedBy, periodStart, periodEnd } = {}) {
  const db = ensureSchema();
  const now = nowIso();
  const periodS = String(periodStart || "");
  const periodE = String(periodEnd || now);
  const purchases = purchase.listPurchaseOrders({ limit: 5000 });
  const fundings = funding.listFundingRequests({ limit: 5000 });

  const deliveredPurchases = purchases.filter(p => p.status === "delivered");
  const approvedFundings = fundings.filter(f => f.status === "approved");

  const totalPurchaseMinor = deliveredPurchases.reduce((s, p) => s + Number(p.amountMinor || 0), 0);
  const totalFundingMinor = approvedFundings.reduce((s, f) => s + Number(f.verifiedAmountMinor || f.amountMinor || 0), 0);
  const netMinor = totalFundingMinor - totalPurchaseMinor;

  const batchRef = `SETTLE-${Date.now().toString(36).toUpperCase()}`;
  const batch = {
    id: uid(),
    batchRef,
    status: "pending",
    totalPurchaseMinor,
    totalFundingMinor,
    totalRefundMinor: 0,
    netMinor,
    purchaseCount: deliveredPurchases.length,
    fundingCount: approvedFundings.length,
    currency: "NGN",
    initiatedBy: String(initiatedBy || "system"),
    settledBy: "",
    detail: { purchaseIds: deliveredPurchases.map(p => p.id), fundingIds: approvedFundings.map(f => f.id) },
    periodStart: periodS,
    periodEnd: periodE,
    settledAt: null,
    createdAt: now,
    updatedAt: now
  };
  if (db.memoryStore) {
    db.memoryStore.wallet_settlement_batches.push(batch);
  } else {
    db.prepare(`
      INSERT INTO wallet_settlement_batches (id, batch_ref, status, total_purchase_minor, total_funding_minor,
        total_refund_minor, net_minor, purchase_count, funding_count, currency, initiated_by, settled_by,
        detail_json, period_start, period_end, settled_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(batch.id, batch.batchRef, batch.status, batch.totalPurchaseMinor, batch.totalFundingMinor,
      batch.totalRefundMinor, batch.netMinor, batch.purchaseCount, batch.fundingCount, batch.currency,
      batch.initiatedBy, batch.settledBy, jsonText(batch.detail), batch.periodStart, batch.periodEnd,
      null, now, now);
  }
  return batch;
}

function settleSettlementBatch({ batchId, actorId }) {
  if (!batchId || !actorId) throw new Error("batchId and actorId required");
  const db = ensureSchema();
  const now = nowIso();
  if (db.memoryStore) {
    const row = db.memoryStore.wallet_settlement_batches.find(b => b.id === batchId);
    if (!row) throw new Error("Batch not found");
    if (row.status !== "pending" && row.status !== "processing") throw new Error("Batch not in settleable state");
    row.status = "settled";
    row.settledBy = String(actorId);
    row.settledAt = now;
    row.updatedAt = now;
    return row;
  }
  const row = db.prepare("SELECT * FROM wallet_settlement_batches WHERE id = ?").get(batchId);
  if (!row) throw new Error("Batch not found");
  db.prepare("UPDATE wallet_settlement_batches SET status = 'settled', settled_by = ?, settled_at = ?, updated_at = ? WHERE id = ?")
    .run(actorId, now, now, batchId);
  return { ...row, status: "settled", settledBy: actorId, settledAt: now, updatedAt: now };
}

function listSettlementBatches({ status, limit = 100, offset = 0 } = {}) {
  const db = ensureSchema();
  if (db.memoryStore) {
    let rows = [...db.memoryStore.wallet_settlement_batches];
    if (status) rows = rows.filter(r => r.status === status);
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows.slice(offset, offset + limit);
  }
  let q = "SELECT * FROM wallet_settlement_batches WHERE 1=1";
  const params = [];
  if (status) { q += " AND status = ?"; params.push(status); }
  q += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  return db.prepare(q).all(...params).map(r => ({
    id: r.id, batchRef: r.batch_ref, status: r.status,
    totalPurchaseMinor: r.total_purchase_minor, totalFundingMinor: r.total_funding_minor,
    totalRefundMinor: r.total_refund_minor, netMinor: r.net_minor,
    purchaseCount: r.purchase_count, fundingCount: r.funding_count, currency: r.currency,
    initiatedBy: r.initiated_by, settledBy: r.settled_by,
    detail: parseJson(r.detail_json), periodStart: r.period_start, periodEnd: r.period_end,
    settledAt: r.settled_at, createdAt: r.created_at, updatedAt: r.updated_at
  }));
}

function settlementSummary() {
  const all = listSettlementBatches({ limit: 1000 });
  const settled = all.filter(r => r.status === "settled");
  return {
    totalBatches: all.length,
    pendingBatches: all.filter(r => r.status === "pending").length,
    settledBatches: settled.length,
    failedBatches: all.filter(r => r.status === "failed").length,
    totalSettledMinor: settled.reduce((s, r) => s + Number(r.netMinor || 0), 0),
    totalPurchaseMinor: settled.reduce((s, r) => s + Number(r.totalPurchaseMinor || 0), 0),
    totalFundingMinor: settled.reduce((s, r) => s + Number(r.totalFundingMinor || 0), 0)
  };
}

module.exports = { generateSettlementBatch, settleSettlementBatch, listSettlementBatches, settlementSummary };
