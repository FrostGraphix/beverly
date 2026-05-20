import { postApi } from "./api.js";

export async function listRefunds({ status, organizationId, limit = 200, offset = 0 } = {}) {
  const res = await postApi("/api/wallet/refunds/list", { status, organizationId, limit, offset });
  return res.data || { rows: [], total: 0 };
}

export async function requestRefund({ organizationId, walletId, purchaseOrderId, amountMinor, reason, actorId, idempotencyKey }) {
  const res = await postApi("/api/wallet/refunds/request", { organizationId, walletId, purchaseOrderId, amountMinor, reason, actorId, idempotencyKey });
  return res.data;
}

export async function approveRefund({ refundId, approvedAmountMinor, actorId, reviewerNote }) {
  const res = await postApi("/api/wallet/refunds/approve", { refundId, approvedAmountMinor, actorId, reviewerNote });
  return res.data;
}

export async function rejectRefund({ refundId, actorId, reviewerNote }) {
  const res = await postApi("/api/wallet/refunds/reject", { refundId, actorId, reviewerNote });
  return res.data;
}

export async function refundSummary() {
  const res = await postApi("/api/wallet/refunds/summary", {});
  return res.data || {};
}

export function formatMoney(amountMinor = 0) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 })
    .format(Number(amountMinor || 0) / 100);
}
