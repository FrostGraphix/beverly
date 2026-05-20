import { postApi } from "./api.js";

export async function listSettlementBatches({ status, limit = 100, offset = 0 } = {}) {
  const res = await postApi("/api/wallet/settlement/list", { status, limit, offset });
  return res.data || { rows: [], total: 0 };
}

export async function generateSettlementBatch({ initiatedBy, periodStart, periodEnd }) {
  const res = await postApi("/api/wallet/settlement/generate", { initiatedBy, periodStart, periodEnd });
  return res.data;
}

export async function settleSettlementBatch({ batchId, actorId }) {
  const res = await postApi("/api/wallet/settlement/settle", { batchId, actorId });
  return res.data;
}

export async function settlementSummary() {
  const res = await postApi("/api/wallet/settlement/summary", {});
  return res.data || {};
}

export function formatMoney(amountMinor = 0) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 })
    .format(Number(amountMinor || 0) / 100);
}
