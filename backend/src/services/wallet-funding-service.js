"use strict";

const crypto = require("crypto");
const { ensureDatabase } = require("./local-database");
const ledger = require("./wallet-ledger-service");

const validFundingStates = new Set([
  "initiated",
  "proof_uploaded",
  "under_review",
  "approved",
  "rejected",
  "expired",
  "cancelled"
]);

function nowIso() {
  return new Date().toISOString();
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

function requireText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function amountMinor(value) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Amount must be a positive integer in minor units");
  }
  return amount;
}

function ensureMemoryStore(db) {
  if (!db?.memoryStore) return;
  db.memoryStore.wallet_funding_requests = db.memoryStore.wallet_funding_requests || [];
  db.memoryStore.wallet_funding_proofs = db.memoryStore.wallet_funding_proofs || [];
}

function ensureFundingSchema() {
  const db = ensureDatabase();
  ledger.walletForOrganization("__schema_probe__");
  ensureMemoryStore(db);
  if (db.memoryStore) return db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_funding_requests (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      verified_amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      reference_code TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      reviewed_by TEXT NOT NULL,
      reviewer_note TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(wallet_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS wallet_funding_proofs (
      id TEXT PRIMARY KEY,
      funding_request_id TEXT NOT NULL,
      storage_bucket TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS wallet_funding_requests_status_created_idx
      ON wallet_funding_requests(status, created_at);
    CREATE INDEX IF NOT EXISTS wallet_funding_requests_org_created_idx
      ON wallet_funding_requests(organization_id, created_at);
  `);
  return db;
}

function referenceCode() {
  return `FUND-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function mapFundingRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    walletId: row.wallet_id ?? row.walletId,
    organizationId: row.organization_id ?? row.organizationId,
    amountMinor: Number(row.amount_minor ?? row.amountMinor ?? 0),
    verifiedAmountMinor: Number(row.verified_amount_minor ?? row.verifiedAmountMinor ?? 0),
    currency: row.currency,
    status: row.status,
    referenceCode: row.reference_code ?? row.referenceCode,
    idempotencyKey: row.idempotency_key ?? row.idempotencyKey,
    requestedBy: row.requested_by ?? row.requestedBy,
    reviewedBy: row.reviewed_by ?? row.reviewedBy,
    reviewerNote: row.reviewer_note ?? row.reviewerNote,
    details: row.details || parseJson(row.detail_json, {}),
    expiresAt: row.expires_at ?? row.expiresAt,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

function createFundingRequest(input = {}) {
  const db = ensureFundingSchema();
  const organizationId = requireText(input.organizationId, "Organization id");
  const wallet = ledger.walletForOrganization(organizationId);
  if (!wallet) throw new Error("Wallet not found");
  if (wallet.status !== "active") throw new Error("Wallet is not active");
  const key = requireText(input.idempotencyKey, "Idempotency key");
  const existing = findFundingByIdempotency(wallet.id, key);
  if (existing) return existing;
  const timestamp = nowIso();
  const request = {
    id: String(input.id || crypto.randomUUID()),
    walletId: wallet.id,
    organizationId,
    amountMinor: amountMinor(input.amountMinor),
    verifiedAmountMinor: 0,
    currency: "NGN",
    status: "initiated",
    referenceCode: input.referenceCode || referenceCode(),
    idempotencyKey: key,
    requestedBy: requireText(input.actorId || input.requestedBy, "Requested by"),
    reviewedBy: "",
    reviewerNote: "",
    details: input.details || {},
    expiresAt: input.expiresAt || new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  if (db.memoryStore) {
    db.memoryStore.wallet_funding_requests.push(request);
  } else {
    db.prepare(`
      INSERT INTO wallet_funding_requests (
        id, wallet_id, organization_id, amount_minor, verified_amount_minor, currency, status,
        reference_code, idempotency_key, requested_by, reviewed_by, reviewer_note,
        detail_json, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      request.id,
      request.walletId,
      request.organizationId,
      request.amountMinor,
      request.verifiedAmountMinor,
      request.currency,
      request.status,
      request.referenceCode,
      request.idempotencyKey,
      request.requestedBy,
      request.reviewedBy,
      request.reviewerNote,
      jsonText(request.details),
      request.expiresAt,
      request.createdAt,
      request.updatedAt
    );
  }
  return request;
}

function uploadFundingProof(input = {}) {
  const db = ensureFundingSchema();
  const request = fundingRequestById(input.fundingRequestId);
  if (!request) throw new Error("Funding request not found");
  if (!["initiated", "proof_uploaded", "rejected"].includes(request.status)) {
    throw new Error("Funding request cannot accept proof");
  }
  const timestamp = nowIso();
  const proof = {
    id: String(input.id || crypto.randomUUID()),
    fundingRequestId: request.id,
    storageBucket: requireText(input.storageBucket || "wallet-proofs", "Storage bucket"),
    storagePath: requireText(input.storagePath, "Storage path"),
    fileName: requireText(input.fileName, "File name"),
    contentType: requireText(input.contentType, "Content type"),
    uploadedBy: requireText(input.actorId || input.uploadedBy, "Uploaded by"),
    details: input.details || {},
    createdAt: timestamp
  };
  if (db.memoryStore) {
    db.memoryStore.wallet_funding_proofs.push(proof);
  } else {
    db.prepare(`
      INSERT INTO wallet_funding_proofs (
        id, funding_request_id, storage_bucket, storage_path, file_name, content_type,
        uploaded_by, detail_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      proof.id,
      proof.fundingRequestId,
      proof.storageBucket,
      proof.storagePath,
      proof.fileName,
      proof.contentType,
      proof.uploadedBy,
      jsonText(proof.details),
      proof.createdAt
    );
  }
  return updateFundingState({
    fundingRequestId: request.id,
    status: "proof_uploaded",
    actorId: proof.uploadedBy,
    reviewerNote: ""
  });
}

function approveFundingRequest(input = {}) {
  const request = fundingRequestById(input.fundingRequestId);
  if (!request) throw new Error("Funding request not found");
  if (!["proof_uploaded", "under_review"].includes(request.status)) {
    throw new Error("Funding request is not reviewable");
  }
  const reviewer = requireText(input.actorId || input.reviewedBy, "Reviewer");
  if (reviewer === request.requestedBy) throw new Error("Funding requester cannot approve own request");
  const verifiedAmountMinor = amountMinor(input.verifiedAmountMinor || request.amountMinor);
  const approved = updateFundingState({
    fundingRequestId: request.id,
    status: "approved",
    actorId: reviewer,
    reviewerNote: input.reviewerNote || "",
    verifiedAmountMinor
  });
  const entry = ledger.postLedgerEntry({
    walletId: request.walletId,
    entryType: "funding_credit",
    direction: "credit",
    amountMinor: verifiedAmountMinor,
    referenceType: "wallet_funding_request",
    referenceId: request.id,
    idempotencyKey: input.idempotencyKey || `funding-credit:${request.id}`,
    actorId: reviewer,
    details: {
      referenceCode: request.referenceCode,
      reviewerNote: input.reviewerNote || ""
    }
  });
  return {
    fundingRequest: approved,
    ledgerEntry: entry,
    walletSummary: ledger.walletSummary(request.walletId)
  };
}

function rejectFundingRequest(input = {}) {
  const request = fundingRequestById(input.fundingRequestId);
  if (!request) throw new Error("Funding request not found");
  const reviewer = requireText(input.actorId || input.reviewedBy, "Reviewer");
  if (reviewer === request.requestedBy) throw new Error("Funding requester cannot reject own request");
  return updateFundingState({
    fundingRequestId: request.id,
    status: "rejected",
    actorId: reviewer,
    reviewerNote: requireText(input.reviewerNote, "Reviewer note")
  });
}

function updateFundingState(input = {}) {
  const db = ensureFundingSchema();
  const request = fundingRequestById(input.fundingRequestId);
  if (!request) throw new Error("Funding request not found");
  const nextStatus = requireText(input.status, "Status");
  if (!validFundingStates.has(nextStatus)) throw new Error("Invalid funding status");
  const timestamp = nowIso();
  const reviewedBy = ["approved", "rejected"].includes(nextStatus) ? requireText(input.actorId, "Reviewer") : request.reviewedBy;
  const reviewerNote = input.reviewerNote !== undefined ? String(input.reviewerNote || "") : request.reviewerNote;
  const verifiedAmountMinor = input.verifiedAmountMinor !== undefined
    ? amountMinor(input.verifiedAmountMinor)
    : request.verifiedAmountMinor;

  if (db.memoryStore) {
    const row = db.memoryStore.wallet_funding_requests.find((entry) => entry.id === request.id);
    row.status = nextStatus;
    row.reviewedBy = reviewedBy;
    row.reviewerNote = reviewerNote;
    row.verifiedAmountMinor = verifiedAmountMinor;
    row.updatedAt = timestamp;
  } else {
    db.prepare(`
      UPDATE wallet_funding_requests
      SET status = ?, reviewed_by = ?, reviewer_note = ?, verified_amount_minor = ?, updated_at = ?
      WHERE id = ?
    `).run(nextStatus, reviewedBy, reviewerNote, verifiedAmountMinor, timestamp, request.id);
  }
  return fundingRequestById(request.id);
}

function fundingRequestById(fundingRequestId) {
  const db = ensureFundingSchema();
  const id = requireText(fundingRequestId, "Funding request id");
  if (db.memoryStore) {
    return db.memoryStore.wallet_funding_requests.find((row) => row.id === id) || null;
  }
  return mapFundingRequest(db.prepare(`
    SELECT id, wallet_id, organization_id, amount_minor, verified_amount_minor, currency, status,
      reference_code, idempotency_key, requested_by, reviewed_by, reviewer_note,
      detail_json, expires_at, created_at, updated_at
    FROM wallet_funding_requests
    WHERE id = ?
  `).get(id));
}

function findFundingByIdempotency(walletId, idempotencyKey) {
  const db = ensureFundingSchema();
  if (db.memoryStore) {
    return db.memoryStore.wallet_funding_requests.find((row) =>
      row.walletId === walletId && row.idempotencyKey === idempotencyKey
    ) || null;
  }
  return mapFundingRequest(db.prepare(`
    SELECT id, wallet_id, organization_id, amount_minor, verified_amount_minor, currency, status,
      reference_code, idempotency_key, requested_by, reviewed_by, reviewer_note,
      detail_json, expires_at, created_at, updated_at
    FROM wallet_funding_requests
    WHERE wallet_id = ? AND idempotency_key = ?
  `).get(walletId, idempotencyKey));
}

function listFundingRequests(options = {}) {
  const db = ensureFundingSchema();
  const status = String(options.status || "").trim();
  const organizationId = String(options.organizationId || "").trim();
  const limit = Math.max(1, Math.min(Number(options.limit || options.pageSize || 100), 500));
  if (db.memoryStore) {
    return db.memoryStore.wallet_funding_requests
      .filter((row) => !status || row.status === status)
      .filter((row) => !organizationId || row.organizationId === organizationId)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .slice(0, limit);
  }
  const clauses = [];
  const params = [];
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (organizationId) {
    clauses.push("organization_id = ?");
    params.push(organizationId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`
    SELECT id, wallet_id, organization_id, amount_minor, verified_amount_minor, currency, status,
      reference_code, idempotency_key, requested_by, reviewed_by, reviewer_note,
      detail_json, expires_at, created_at, updated_at
    FROM wallet_funding_requests
    ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params, limit).map(mapFundingRequest);
}

module.exports = {
  approveFundingRequest,
  createFundingRequest,
  fundingRequestById,
  listFundingRequests,
  rejectFundingRequest,
  updateFundingState,
  uploadFundingProof
};
