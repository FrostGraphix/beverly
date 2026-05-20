"use strict";

const crypto = require("crypto");
const { ensureDatabase } = require("./local-database");
const ledger = require("./wallet-ledger-service");
const purchase = require("./wallet-purchase-service");

const refundStates = new Set(["requested", "under_review", "approved", "processing", "completed", "rejected", "cancelled"]);
const refundReasons = new Set(["vend_failure", "overcharge", "duplicate", "service_unavailable", "customer_request", "system_error"]);

function nowIso() { return new Date().toISOString(); }
function uid() { return crypto.randomUUID(); }
function jsonText(v) { return JSON.stringify(v || {}); }
function parseJson(v, fallback = {}) { try { return JSON.parse(v); } catch { return fallback; } }
function requireText(v, label) { const t = String(v || "").trim(); if (!t) throw new Error(`${label} is required`); return t; }

function ensureMemoryStore(db) {
  if (!db?.memoryStore) return;
  db.memoryStore.wallet_refunds = db.memoryStore.wallet_refunds || [];
}

function ensureSchema() {
  const db = ensureDatabase();
  ensureMemoryStore(db);
  if (db.memoryStore) return db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_refunds (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      purchase_order_id TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      approved_amount_minor INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'NGN',
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      reviewed_by TEXT NOT NULL DEFAULT '',
      reviewer_note TEXT NOT NULL DEFAULT '',
      idempotency_key TEXT NOT NULL UNIQUE,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function requestRefund({ organizationId, walletId, purchaseOrderId, amountMinor, reason, actorId, idempotencyKey }) {
  requireText(organizationId, "organizationId");
  requireText(walletId, "walletId");
  requireText(purchaseOrderId, "purchaseOrderId");
  requireText(actorId, "actorId");
  if (!refundReasons.has(reason)) throw new Error(`Invalid refund reason: ${reason}`);
  const amount = Number(amountMinor);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("amountMinor must be positive integer");
  const db = ensureSchema();
  const ikey = String(idempotencyKey || `refund:${purchaseOrderId}:${Date.now()}`);
  // Check idempotency
  if (db.memoryStore) {
    const existing = db.memoryStore.wallet_refunds.find(r => r.idempotencyKey === ikey);
    if (existing) return existing;
  }
  const now = nowIso();
  const refund = {
    id: uid(),
    organizationId: String(organizationId),
    walletId: String(walletId),
    purchaseOrderId: String(purchaseOrderId),
    amountMinor: amount,
    approvedAmountMinor: 0,
    currency: "NGN",
    reason: String(reason),
    status: "requested",
    requestedBy: String(actorId),
    reviewedBy: "",
    reviewerNote: "",
    idempotencyKey: ikey,
    detail: {},
    createdAt: now,
    updatedAt: now
  };
  if (db.memoryStore) {
    db.memoryStore.wallet_refunds.push(refund);
  } else {
    db.prepare(`
      INSERT INTO wallet_refunds (id, organization_id, wallet_id, purchase_order_id, amount_minor, approved_amount_minor,
        currency, reason, status, requested_by, reviewed_by, reviewer_note, idempotency_key, detail_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(refund.id, refund.organizationId, refund.walletId, refund.purchaseOrderId, refund.amountMinor,
      refund.approvedAmountMinor, refund.currency, refund.reason, refund.status, refund.requestedBy,
      refund.reviewedBy, refund.reviewerNote, ikey, jsonText(refund.detail), now, now);
  }
  return refund;
}

function approveRefund({ refundId, approvedAmountMinor, actorId, reviewerNote = "" }) {
  requireText(refundId, "refundId");
  requireText(actorId, "actorId");
  const amount = Number(approvedAmountMinor);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("approvedAmountMinor must be positive integer");
  const db = ensureSchema();
  const now = nowIso();
  if (db.memoryStore) {
    const row = db.memoryStore.wallet_refunds.find(r => r.id === refundId);
    if (!row) throw new Error("Refund not found");
    if (row.status !== "requested" && row.status !== "under_review") throw new Error("Refund cannot be approved in current state");
    row.status = "approved";
    row.approvedAmountMinor = amount;
    row.reviewedBy = actorId;
    row.reviewerNote = String(reviewerNote);
    row.updatedAt = now;
    // Post ledger refund adjustment
    try {
      ledger.postEntry({
        walletId: row.walletId, entryType: "refund_adjustment", amountMinor: amount,
        referenceId: refundId, note: `Refund approved: ${reviewerNote || row.reason}`, actorId
      });
      row.status = "completed";
    } catch {}
    return row;
  }
  const row = db.prepare("SELECT * FROM wallet_refunds WHERE id = ?").get(refundId);
  if (!row) throw new Error("Refund not found");
  if (row.status !== "requested" && row.status !== "under_review") throw new Error("Refund cannot be approved in current state");
  db.prepare(`
    UPDATE wallet_refunds SET status = 'approved', approved_amount_minor = ?, reviewed_by = ?, reviewer_note = ?, updated_at = ? WHERE id = ?
  `).run(amount, actorId, String(reviewerNote), now, refundId);
  return { ...row, status: "approved", approvedAmountMinor: amount, reviewedBy: actorId, reviewerNote, updatedAt: now };
}

function rejectRefund({ refundId, actorId, reviewerNote = "" }) {
  requireText(refundId, "refundId");
  requireText(actorId, "actorId");
  const db = ensureSchema();
  const now = nowIso();
  if (db.memoryStore) {
    const row = db.memoryStore.wallet_refunds.find(r => r.id === refundId);
    if (!row) throw new Error("Refund not found");
    row.status = "rejected";
    row.reviewedBy = actorId;
    row.reviewerNote = String(reviewerNote);
    row.updatedAt = now;
    return row;
  }
  db.prepare("UPDATE wallet_refunds SET status = 'rejected', reviewed_by = ?, reviewer_note = ?, updated_at = ? WHERE id = ?")
    .run(actorId, String(reviewerNote), now, refundId);
  return { refundId, status: "rejected" };
}

function listRefunds({ status, organizationId, limit = 200, offset = 0 } = {}) {
  const db = ensureSchema();
  if (db.memoryStore) {
    let rows = [...db.memoryStore.wallet_refunds];
    if (status) rows = rows.filter(r => r.status === status);
    if (organizationId) rows = rows.filter(r => r.organizationId === organizationId);
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows.slice(offset, offset + limit);
  }
  let q = "SELECT * FROM wallet_refunds WHERE 1=1";
  const params = [];
  if (status) { q += " AND status = ?"; params.push(status); }
  if (organizationId) { q += " AND organization_id = ?"; params.push(organizationId); }
  q += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  return db.prepare(q).all(...params).map(r => ({
    id: r.id, organizationId: r.organization_id, walletId: r.wallet_id, purchaseOrderId: r.purchase_order_id,
    amountMinor: r.amount_minor, approvedAmountMinor: r.approved_amount_minor, currency: r.currency,
    reason: r.reason, status: r.status, requestedBy: r.requested_by, reviewedBy: r.reviewed_by,
    reviewerNote: r.reviewer_note, idempotencyKey: r.idempotency_key,
    detail: parseJson(r.detail_json), createdAt: r.created_at, updatedAt: r.updated_at
  }));
}

function refundSummary() {
  const all = listRefunds({ limit: 2000 });
  const completedMinor = all.filter(r => r.status === "completed").reduce((s, r) => s + Number(r.approvedAmountMinor || 0), 0);
  return {
    total: all.length,
    requested: all.filter(r => r.status === "requested").length,
    underReview: all.filter(r => r.status === "under_review").length,
    approved: all.filter(r => r.status === "approved").length,
    completed: all.filter(r => r.status === "completed").length,
    rejected: all.filter(r => r.status === "rejected").length,
    completedAmountMinor: completedMinor
  };
}

module.exports = { requestRefund, approveRefund, rejectRefund, listRefunds, refundSummary };
