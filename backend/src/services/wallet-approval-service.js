"use strict";

const crypto = require("crypto");
const { ensureDatabase } = require("./local-database");
const ledger = require("./wallet-ledger-service");

function nowIso() {
  return new Date().toISOString();
}

function requireText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function amountMinor(value) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Amount must be a positive integer in minor units");
  return amount;
}

function jsonText(value) {
  return JSON.stringify(value || {});
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function ensureSchema() {
  const db = ensureDatabase();
  if (db.memoryStore) {
    db.memoryStore.wallet_approval_requests = db.memoryStore.wallet_approval_requests || [];
    return db;
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_approval_requests (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      approval_type TEXT NOT NULL,
      status TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      maker_id TEXT NOT NULL,
      checker_id TEXT NOT NULL,
      reviewer_note TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(wallet_id, idempotency_key)
    );
  `);
  return db;
}

function mapApproval(row) {
  if (!row) return null;
  return {
    id: row.id,
    walletId: row.wallet_id ?? row.walletId,
    organizationId: row.organization_id ?? row.organizationId,
    approvalType: row.approval_type ?? row.approvalType,
    status: row.status,
    amountMinor: Number(row.amount_minor ?? row.amountMinor ?? 0),
    currency: row.currency,
    reasonCode: row.reason_code ?? row.reasonCode,
    makerId: row.maker_id ?? row.makerId,
    checkerId: row.checker_id ?? row.checkerId,
    reviewerNote: row.reviewer_note ?? row.reviewerNote,
    idempotencyKey: row.idempotency_key ?? row.idempotencyKey,
    details: row.details || parseJson(row.detail_json, {}),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

function requestManualCredit(input = {}) {
  const db = ensureSchema();
  const wallet = ledger.walletForOrganization(requireText(input.organizationId, "Organization id"));
  if (!wallet) throw new Error("Wallet not found");
  const key = requireText(input.idempotencyKey, "Idempotency key");
  const existing = findApprovalByIdempotency(wallet.id, key);
  if (existing) return existing;
  const timestamp = nowIso();
  const approval = {
    id: String(input.id || crypto.randomUUID()),
    walletId: wallet.id,
    organizationId: wallet.organizationId,
    approvalType: "manual_credit",
    status: "pending",
    amountMinor: amountMinor(input.amountMinor),
    currency: "NGN",
    reasonCode: requireText(input.reasonCode, "Reason code"),
    makerId: requireText(input.actorId || input.makerId, "Maker"),
    checkerId: "",
    reviewerNote: "",
    idempotencyKey: key,
    details: input.details || {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
  if (db.memoryStore) {
    db.memoryStore.wallet_approval_requests.push(approval);
  } else {
    db.prepare(`
      INSERT INTO wallet_approval_requests (
        id, wallet_id, organization_id, approval_type, status, amount_minor, currency,
        reason_code, maker_id, checker_id, reviewer_note, idempotency_key,
        detail_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      approval.id,
      approval.walletId,
      approval.organizationId,
      approval.approvalType,
      approval.status,
      approval.amountMinor,
      approval.currency,
      approval.reasonCode,
      approval.makerId,
      approval.checkerId,
      approval.reviewerNote,
      approval.idempotencyKey,
      jsonText(approval.details),
      approval.createdAt,
      approval.updatedAt
    );
  }
  return approval;
}

function approveManualCredit(input = {}) {
  const approval = approvalById(input.approvalRequestId);
  if (!approval) throw new Error("Approval request not found");
  if (approval.status !== "pending") throw new Error("Approval request is not pending");
  const checker = requireText(input.actorId || input.checkerId, "Checker");
  if (checker === approval.makerId) throw new Error("Maker cannot approve own credit");
  const updated = updateApproval(approval.id, {
    status: "approved",
    checkerId: checker,
    reviewerNote: String(input.reviewerNote || "")
  });
  const entry = ledger.postLedgerEntry({
    walletId: approval.walletId,
    entryType: "manual_credit",
    direction: "credit",
    amountMinor: approval.amountMinor,
    referenceType: "wallet_approval_request",
    referenceId: approval.id,
    idempotencyKey: input.idempotencyKey || `manual-credit:${approval.id}`,
    actorId: checker,
    details: { reasonCode: approval.reasonCode, reviewerNote: input.reviewerNote || "" }
  });
  return {
    approvalRequest: updated,
    ledgerEntry: entry,
    walletSummary: ledger.walletSummary(approval.walletId)
  };
}

function rejectManualCredit(input = {}) {
  const approval = approvalById(input.approvalRequestId);
  if (!approval) throw new Error("Approval request not found");
  if (approval.status !== "pending") throw new Error("Approval request is not pending");
  const checker = requireText(input.actorId || input.checkerId, "Checker");
  if (checker === approval.makerId) throw new Error("Maker cannot reject own credit");
  return updateApproval(approval.id, {
    status: "rejected",
    checkerId: checker,
    reviewerNote: requireText(input.reviewerNote, "Reviewer note")
  });
}

function updateApproval(id, patch) {
  const db = ensureSchema();
  const timestamp = nowIso();
  if (db.memoryStore) {
    const row = db.memoryStore.wallet_approval_requests.find((entry) => entry.id === id);
    if (!row) throw new Error("Approval request not found");
    row.status = patch.status;
    row.checkerId = patch.checkerId;
    row.reviewerNote = patch.reviewerNote;
    row.updatedAt = timestamp;
    return row;
  }
  db.prepare(`
    UPDATE wallet_approval_requests
    SET status = ?, checker_id = ?, reviewer_note = ?, updated_at = ?
    WHERE id = ?
  `).run(patch.status, patch.checkerId, patch.reviewerNote, timestamp, id);
  return approvalById(id);
}

function approvalById(id) {
  const db = ensureSchema();
  const approvalId = requireText(id, "Approval request id");
  if (db.memoryStore) return db.memoryStore.wallet_approval_requests.find((row) => row.id === approvalId) || null;
  return mapApproval(db.prepare(`
    SELECT id, wallet_id, organization_id, approval_type, status, amount_minor, currency,
      reason_code, maker_id, checker_id, reviewer_note, idempotency_key,
      detail_json, created_at, updated_at
    FROM wallet_approval_requests
    WHERE id = ?
  `).get(approvalId));
}

function findApprovalByIdempotency(walletId, key) {
  const db = ensureSchema();
  if (db.memoryStore) return db.memoryStore.wallet_approval_requests.find((row) => row.walletId === walletId && row.idempotencyKey === key) || null;
  return mapApproval(db.prepare(`
    SELECT id, wallet_id, organization_id, approval_type, status, amount_minor, currency,
      reason_code, maker_id, checker_id, reviewer_note, idempotency_key,
      detail_json, created_at, updated_at
    FROM wallet_approval_requests
    WHERE wallet_id = ? AND idempotency_key = ?
  `).get(walletId, key));
}

function listApprovalRequests(options = {}) {
  const db = ensureSchema();
  const status = String(options.status || "").trim();
  if (db.memoryStore) return db.memoryStore.wallet_approval_requests.filter((row) => !status || row.status === status);
  const where = status ? "WHERE status = ?" : "";
  const params = status ? [status] : [];
  return db.prepare(`
    SELECT id, wallet_id, organization_id, approval_type, status, amount_minor, currency,
      reason_code, maker_id, checker_id, reviewer_note, idempotency_key,
      detail_json, created_at, updated_at
    FROM wallet_approval_requests
    ${where}
    ORDER BY created_at DESC
  `).all(...params).map(mapApproval);
}

module.exports = {
  approvalById,
  approveManualCredit,
  listApprovalRequests,
  rejectManualCredit,
  requestManualCredit
};
