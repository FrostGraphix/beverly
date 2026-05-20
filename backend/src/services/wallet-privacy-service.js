"use strict";

const crypto = require("crypto");

function uid() { return crypto.randomUUID(); }
function nowIso() { return new Date().toISOString(); }

const requestStore = new Map();

const validStatuses = new Set(["pending", "approved", "rejected", "completed", "cancelled"]);

function seedDefaults() {
  if (requestStore.size > 0) return;
  const samples = [
    {
      id: uid(), status: "pending",
      reason: "No longer using service",
      requested_at: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
      scheduled_for: new Date(Date.now() + 23 * 24 * 3600 * 1000).toISOString(),
      reviewed_by: null, review_note: null, reviewed_at: null,
      customers: { users: { full_name: "Musa Abubakar", phone: "+2348012345678" } }
    },
    {
      id: uid(), status: "pending",
      reason: "Privacy concerns — NDPR Article 3(1)",
      requested_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      scheduled_for: new Date(Date.now() + 27 * 24 * 3600 * 1000).toISOString(),
      reviewed_by: null, review_note: null, reviewed_at: null,
      customers: { users: { full_name: "Amina Bello", phone: "+2348023456789" } }
    },
    {
      id: uid(), status: "rejected",
      reason: "Duplicate account request",
      requested_at: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
      scheduled_for: null,
      reviewed_by: "staff-admin", review_note: "Duplicate — original account still active", reviewed_at: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(),
      customers: { users: { full_name: "Chukwuemeka Obi", phone: "+2349034567890" } }
    }
  ];
  for (const s of samples) requestStore.set(s.id, s);
}

seedDefaults();

function listDeletionRequests({ status } = {}) {
  let rows = Array.from(requestStore.values());
  if (status) rows = rows.filter(r => r.status === status);
  rows.sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  return rows;
}

function getDeletionRequest(id) {
  return requestStore.get(String(id)) || null;
}

function reviewDeletionRequest({ id, approve, note, actorId }) {
  const req = requestStore.get(String(id));
  if (!req) throw new Error("Deletion request not found");
  if (req.status !== "pending") throw new Error("Request is not in pending state");
  req.status = approve ? "approved" : "rejected";
  req.reviewed_by = actorId || "staff";
  req.review_note = note || null;
  req.reviewed_at = nowIso();
  return req;
}

module.exports = { listDeletionRequests, getDeletionRequest, reviewDeletionRequest };
