"use strict";

const crypto = require("crypto");
const { ensureDatabase } = require("./local-database");
const purchase = require("./wallet-purchase-service");

const disputeTypes = new Set(["vend_failure", "token_not_received", "overcharge", "underdelivery", "double_charge", "other"]);
const disputeStates = new Set(["open", "under_review", "resolved_approved", "resolved_rejected", "escalated", "withdrawn"]);

function nowIso() { return new Date().toISOString(); }
function uid() { return crypto.randomUUID(); }
function jsonText(v) { return JSON.stringify(v || {}); }
function parseJson(v, fallback = {}) { try { return JSON.parse(v); } catch { return fallback; } }
function requireText(v, label) { const t = String(v || "").trim(); if (!t) throw new Error(`${label} is required`); return t; }

function ensureMemoryStore(db) {
  if (!db?.memoryStore) return;
  db.memoryStore.wallet_disputes = db.memoryStore.wallet_disputes || [];
  db.memoryStore.wallet_dispute_notes = db.memoryStore.wallet_dispute_notes || [];
}

function ensureSchema() {
  const db = ensureDatabase();
  ensureMemoryStore(db);
  if (db.memoryStore) return db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_disputes (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      wallet_id TEXT,
      purchase_order_id TEXT,
      dispute_type TEXT NOT NULL,
      status TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'NGN',
      description TEXT NOT NULL,
      resolution_note TEXT NOT NULL DEFAULT '',
      actor_id TEXT NOT NULL,
      resolved_by TEXT NOT NULL DEFAULT '',
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wallet_dispute_notes (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL,
      note TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function openDispute({ organizationId, walletId, purchaseOrderId, disputeType, amountMinor, description, actorId }) {
  requireText(organizationId, "organizationId");
  requireText(actorId, "actorId");
  if (!disputeTypes.has(disputeType)) throw new Error(`Invalid dispute type: ${disputeType}`);
  const db = ensureSchema();
  const amount = Number(amountMinor || 0);
  const now = nowIso();
  const dispute = {
    id: uid(),
    organizationId: String(organizationId),
    walletId: String(walletId || ""),
    purchaseOrderId: String(purchaseOrderId || ""),
    disputeType: String(disputeType),
    status: "open",
    amountMinor: amount,
    currency: "NGN",
    description: String(description || "").trim(),
    resolutionNote: "",
    actorId: String(actorId),
    resolvedBy: "",
    detail: {},
    createdAt: now,
    updatedAt: now
  };
  if (db.memoryStore) {
    db.memoryStore.wallet_disputes.push(dispute);
  } else {
    db.prepare(`
      INSERT INTO wallet_disputes (id, organization_id, wallet_id, purchase_order_id, dispute_type, status,
        amount_minor, currency, description, resolution_note, actor_id, resolved_by, detail_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(dispute.id, dispute.organizationId, dispute.walletId, dispute.purchaseOrderId, dispute.disputeType,
      dispute.status, dispute.amountMinor, dispute.currency, dispute.description, dispute.resolutionNote,
      dispute.actorId, dispute.resolvedBy, jsonText(dispute.detail), now, now);
  }
  return dispute;
}

function updateDisputeStatus({ disputeId, status, resolutionNote, actorId }) {
  requireText(disputeId, "disputeId");
  requireText(actorId, "actorId");
  if (!disputeStates.has(status)) throw new Error(`Invalid dispute status: ${status}`);
  const db = ensureSchema();
  const now = nowIso();
  if (db.memoryStore) {
    const row = db.memoryStore.wallet_disputes.find(d => d.id === disputeId);
    if (!row) throw new Error("Dispute not found");
    row.status = status;
    row.resolutionNote = String(resolutionNote || "");
    row.resolvedBy = status.startsWith("resolved") ? actorId : row.resolvedBy;
    row.updatedAt = now;
    return row;
  }
  const row = db.prepare("SELECT * FROM wallet_disputes WHERE id = ?").get(disputeId);
  if (!row) throw new Error("Dispute not found");
  db.prepare(`
    UPDATE wallet_disputes SET status = ?, resolution_note = ?, resolved_by = ?, updated_at = ? WHERE id = ?
  `).run(status, String(resolutionNote || ""), status.startsWith("resolved") ? actorId : row.resolved_by, now, disputeId);
  return { ...row, status, resolutionNote: String(resolutionNote || ""), updatedAt: now };
}

function addNote({ disputeId, note, actorId }) {
  requireText(disputeId, "disputeId");
  requireText(note, "note");
  requireText(actorId, "actorId");
  const db = ensureSchema();
  const entry = { id: uid(), disputeId, note: String(note), actorId: String(actorId), createdAt: nowIso() };
  if (db.memoryStore) {
    db.memoryStore.wallet_dispute_notes.push(entry);
  } else {
    db.prepare("INSERT INTO wallet_dispute_notes (id, dispute_id, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(entry.id, entry.disputeId, entry.note, entry.actorId, entry.createdAt);
  }
  return entry;
}

function listDisputes({ status, organizationId, limit = 200, offset = 0 } = {}) {
  const db = ensureSchema();
  if (db.memoryStore) {
    let rows = [...db.memoryStore.wallet_disputes];
    if (status) rows = rows.filter(r => r.status === status);
    if (organizationId) rows = rows.filter(r => r.organizationId === organizationId);
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows.slice(offset, offset + limit);
  }
  let q = "SELECT * FROM wallet_disputes WHERE 1=1";
  const params = [];
  if (status) { q += " AND status = ?"; params.push(status); }
  if (organizationId) { q += " AND organization_id = ?"; params.push(organizationId); }
  q += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  return db.prepare(q).all(...params).map(r => ({
    id: r.id, organizationId: r.organization_id, walletId: r.wallet_id, purchaseOrderId: r.purchase_order_id,
    disputeType: r.dispute_type, status: r.status, amountMinor: r.amount_minor, currency: r.currency,
    description: r.description, resolutionNote: r.resolution_note, actorId: r.actor_id,
    resolvedBy: r.resolved_by, detail: parseJson(r.detail_json), createdAt: r.created_at, updatedAt: r.updated_at
  }));
}

function disputeSummary() {
  const all = listDisputes({ limit: 2000 });
  return {
    total: all.length,
    open: all.filter(r => r.status === "open").length,
    underReview: all.filter(r => r.status === "under_review").length,
    escalated: all.filter(r => r.status === "escalated").length,
    resolvedApproved: all.filter(r => r.status === "resolved_approved").length,
    resolvedRejected: all.filter(r => r.status === "resolved_rejected").length
  };
}

module.exports = { openDispute, updateDisputeStatus, addNote, listDisputes, disputeSummary };
