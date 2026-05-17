import {
  completeRemoteSend as completeRemoteSendRaw,
  completeTokenPurchase as completeTokenPurchaseRaw,
  createRemoteSendPurchase as createRemoteSendPurchaseRaw,
  createTokenPurchase as createTokenPurchaseRaw,
  listPurchaseOrders as listPurchaseOrdersRaw,
  markRemoteSendPending as markRemoteSendPendingRaw,
  readVendorOrganizationId
} from "./vendor-wallet-service.mjs";

function toMinor(amount = 0) {
  return Math.round(Number(amount || 0) * 100);
}

function purchasePayload(payload = {}, actorId = "vendor-portal") {
  return {
    organizationId: payload.organizationId || readVendorOrganizationId(),
    amountMinor: payload.amountMinor ?? toMinor(payload.amount),
    targetMeter: payload.targetMeter || payload.meterId,
    customerName: payload.customerName || "Walk-in customer",
    actorId
  };
}

export async function createTokenPurchase(payload = {}) {
  return createTokenPurchaseRaw(purchasePayload(payload));
}

export async function createRemoteSendPurchase(payload = {}) {
  return createRemoteSendPurchaseRaw(purchasePayload(payload));
}

export async function completeTokenPurchase({ purchaseOrderId, actorId = "vendor-portal" }) {
  return purchaseDetailToReceipt(await completeTokenPurchaseRaw({ purchaseOrderId, actorId }));
}

export async function markRemoteSendPending({ purchaseOrderId, actorId = "vendor-portal" }) {
  return markRemoteSendPendingRaw({ purchaseOrderId, actorId });
}

export async function completeRemoteSend({ purchaseOrderId, actorId = "vendor-portal" }) {
  return purchaseDetailToReceipt(await completeRemoteSendRaw({ purchaseOrderId, actorId }));
}

export async function listPurchaseOrders(filters = {}) {
  return listPurchaseOrdersRaw({
    organizationId: filters.organizationId || readVendorOrganizationId(),
    ...filters
  });
}

function purchaseDetailToReceipt(detail = {}) {
  const delivery = detail.deliveries?.[detail.deliveries.length - 1] || {};
  return {
    ...(detail.order || {}),
    tokenValue: delivery.tokenValue || "",
    remoteReference: delivery.remoteReference || "",
    deliveryStatus: delivery.status || ""
  };
}
