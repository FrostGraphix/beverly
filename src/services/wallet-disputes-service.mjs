import { postApi } from "./api.js";

export async function listDisputes({ status, organizationId, limit = 200, offset = 0 } = {}) {
  const res = await postApi("/api/wallet/disputes/list", { status, organizationId, limit, offset });
  return res.data || { rows: [], total: 0, summary: {} };
}

export async function openDispute({ organizationId, walletId, purchaseOrderId, disputeType, amountMinor, description, actorId }) {
  const res = await postApi("/api/wallet/disputes/open", { organizationId, walletId, purchaseOrderId, disputeType, amountMinor, description, actorId });
  return res.data;
}

export async function updateDisputeStatus({ disputeId, status, resolutionNote, actorId }) {
  const res = await postApi("/api/wallet/disputes/update-status", { disputeId, status, resolutionNote, actorId });
  return res.data;
}

export async function addDisputeNote({ disputeId, note, actorId }) {
  const res = await postApi("/api/wallet/disputes/add-note", { disputeId, note, actorId });
  return res.data;
}

export async function disputeSummary() {
  const res = await postApi("/api/wallet/disputes/summary", {});
  return res.data || {};
}

export function formatMoney(amountMinor = 0) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 })
    .format(Number(amountMinor || 0) / 100);
}
