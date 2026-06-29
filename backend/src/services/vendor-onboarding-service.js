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
    db.memoryStore.vendor_onboarding_submissions = db.memoryStore.vendor_onboarding_submissions || [];
    db.memoryStore.vendor_documents = db.memoryStore.vendor_documents || [];
    return db;
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_onboarding_submissions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      status TEXT NOT NULL,
      submitted_by TEXT NOT NULL,
      reviewed_by TEXT NOT NULL,
      reviewer_note TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vendor_documents (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      onboarding_submission_id TEXT NOT NULL,
      document_type TEXT NOT NULL,
      storage_bucket TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function mapSubmission(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id ?? row.organizationId,
    status: row.status,
    submittedBy: row.submitted_by ?? row.submittedBy,
    reviewedBy: row.reviewed_by ?? row.reviewedBy,
    reviewerNote: row.reviewer_note ?? row.reviewerNote,
    details: row.details || parseJson(row.detail_json, {}),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

function submitOnboarding(input = {}) {
  const db = ensureSchema();
  const organizationId = requireText(input.organizationId, "Organization id");
  if (!ledger.getVendorOrganization(organizationId)) throw new Error("Vendor organization not found");
  const timestamp = nowIso();
  const submission = {
    id: String(input.id || crypto.randomUUID()),
    organizationId,
    status: "pending_review",
    submittedBy: requireText(input.actorId || input.submittedBy, "Submitted by"),
    reviewedBy: "",
    reviewerNote: "",
    details: {
      businessIdentity: input.businessIdentity || {},
      primaryContact: input.primaryContact || {},
      bankDetails: input.bankDetails || {},
      operatingSites: Array.isArray(input.operatingSites) ? input.operatingSites : []
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
  if (db.memoryStore) {
    db.memoryStore.vendor_onboarding_submissions.push(submission);
  } else {
    db.prepare(`
      INSERT INTO vendor_onboarding_submissions (
        id, organization_id, status, submitted_by, reviewed_by, reviewer_note,
        detail_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      submission.id,
      submission.organizationId,
      submission.status,
      submission.submittedBy,
      submission.reviewedBy,
      submission.reviewerNote,
      jsonText(submission.details),
      submission.createdAt,
      submission.updatedAt
    );
  }
  ledger.updateVendorStatus(organizationId, "pending_review", submission.submittedBy);
  return submission;
}

function attachDocument(input = {}) {
  const db = ensureSchema();
  const submission = onboardingSubmissionById(input.onboardingSubmissionId);
  if (!submission) throw new Error("Onboarding submission not found");
  const document = {
    id: String(input.id || crypto.randomUUID()),
    organizationId: submission.organizationId,
    onboardingSubmissionId: submission.id,
    documentType: requireText(input.documentType, "Document type"),
    storageBucket: requireText(input.storageBucket || "wallet-proofs", "Storage bucket"),
    storagePath: requireText(input.storagePath, "Storage path"),
    fileName: requireText(input.fileName, "File name"),
    contentType: requireText(input.contentType, "Content type"),
    uploadedBy: requireText(input.actorId || input.uploadedBy, "Uploaded by"),
    createdAt: nowIso()
  };
  if (db.memoryStore) {
    db.memoryStore.vendor_documents.push(document);
  } else {
    db.prepare(`
      INSERT INTO vendor_documents (
        id, organization_id, onboarding_submission_id, document_type, storage_bucket,
        storage_path, file_name, content_type, uploaded_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      document.id,
      document.organizationId,
      document.onboardingSubmissionId,
      document.documentType,
      document.storageBucket,
      document.storagePath,
      document.fileName,
      document.contentType,
      document.uploadedBy,
      document.createdAt
    );
  }
  return document;
}

function reviewOnboarding(input = {}) {
  const db = ensureSchema();
  const submission = onboardingSubmissionById(input.onboardingSubmissionId);
  if (!submission) throw new Error("Onboarding submission not found");
  const reviewer = requireText(input.actorId || input.reviewedBy, "Reviewer");
  if (reviewer === submission.submittedBy) throw new Error("Submitter cannot review onboarding");
  const status = input.approved === false ? "rejected" : "approved";
  const timestamp = nowIso();
  if (db.memoryStore) {
    const row = db.memoryStore.vendor_onboarding_submissions.find((entry) => entry.id === submission.id);
    row.status = status;
    row.reviewedBy = reviewer;
    row.reviewerNote = String(input.reviewerNote || "");
    row.updatedAt = timestamp;
  } else {
    db.prepare(`
      UPDATE vendor_onboarding_submissions
      SET status = ?, reviewed_by = ?, reviewer_note = ?, updated_at = ?
      WHERE id = ?
    `).run(status, reviewer, String(input.reviewerNote || ""), timestamp, submission.id);
  }
  if (status === "approved") {
    ledger.updateVendorStatus(submission.organizationId, "active", reviewer);
    ledger.provisionWalletForOrganization({ organizationId: submission.organizationId, actorId: reviewer });
  } else {
    ledger.updateVendorStatus(submission.organizationId, "rejected", reviewer);
  }
  return onboardingSubmissionById(submission.id);
}

function onboardingSubmissionById(id) {
  const db = ensureSchema();
  const submissionId = requireText(id, "Onboarding submission id");
  if (db.memoryStore) {
    return db.memoryStore.vendor_onboarding_submissions.find((row) => row.id === submissionId) || null;
  }
  return mapSubmission(db.prepare(`
    SELECT id, organization_id, status, submitted_by, reviewed_by, reviewer_note,
      detail_json, created_at, updated_at
    FROM vendor_onboarding_submissions
    WHERE id = ?
  `).get(submissionId));
}

function listOnboardingSubmissions(options = {}) {
  const db = ensureSchema();
  const status = String(options.status || "").trim();
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 500));
  if (db.memoryStore) {
    return db.memoryStore.vendor_onboarding_submissions
      .filter((row) => !status || row.status === status)
      .slice(0, limit);
  }
  const where = status ? "WHERE status = ?" : "";
  const params = status ? [status, limit] : [limit];
  return db.prepare(`
    SELECT id, organization_id, status, submitted_by, reviewed_by, reviewer_note,
      detail_json, created_at, updated_at
    FROM vendor_onboarding_submissions
    ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params).map(mapSubmission);
}

module.exports = {
  attachDocument,
  listOnboardingSubmissions,
  onboardingSubmissionById,
  reviewOnboarding,
  submitOnboarding
};
