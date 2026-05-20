import { postApi } from "./api.js";

export async function vendMonitorSummary() {
  const res = await postApi("/api/wallet/vending-monitor/summary", {});
  return res.data || {};
}

export async function listVendOrders({ status, organizationId, limit = 200, offset = 0 } = {}) {
  const res = await postApi("/api/wallet/vending-monitor/list", { status, organizationId, limit, offset });
  return res.data || { rows: [], total: 0 };
}

export function formatMoney(amountMinor = 0) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 })
    .format(Number(amountMinor || 0) / 100);
}

export function vendStatusLabel(status) {
  const map = {
    created: "Created", hold_active: "Hold Active", dispatching: "Dispatching",
    delivered: "Delivered", delivery_pending_review: "Pending Review",
    failed: "Failed", reversed: "Reversed"
  };
  return map[status] || String(status || "Unknown");
}

export function vendStatusTone(status) {
  if (["delivered"].includes(status)) return "good";
  if (["failed"].includes(status)) return "danger";
  if (["delivery_pending_review"].includes(status)) return "warn";
  if (["dispatching", "hold_active"].includes(status)) return "info";
  return "neutral";
}
