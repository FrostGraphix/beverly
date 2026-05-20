"use strict";

const purchase = require("./wallet-purchase-service");
const ledger = require("./wallet-ledger-service");

function vendMonitorSummary() {
  const orders = purchase.listPurchaseOrders({ limit: 5000 });
  const now = Date.now();
  const recentCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const todayOrders = orders.filter(o => o.createdAt >= recentCutoff);
  return {
    total: orders.length,
    active: orders.filter(o => ["created", "hold_active", "dispatching"].includes(o.status)).length,
    delivered: orders.filter(o => o.status === "delivered").length,
    failed: orders.filter(o => o.status === "failed").length,
    pendingReview: orders.filter(o => o.status === "delivery_pending_review").length,
    reversed: orders.filter(o => o.status === "reversed").length,
    todayTotal: todayOrders.length,
    todayDelivered: todayOrders.filter(o => o.status === "delivered").length,
    todayFailed: todayOrders.filter(o => o.status === "failed").length,
    todayRevenueMinor: todayOrders
      .filter(o => o.status === "delivered")
      .reduce((s, o) => s + Number(o.amountMinor || 0), 0)
  };
}

function listVendOrders({ status, organizationId, limit = 200, offset = 0 } = {}) {
  const orders = purchase.listPurchaseOrders({ organizationId, limit: 2000 });
  let rows = status ? orders.filter(o => o.status === status) : orders;
  rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return {
    rows: rows.slice(offset, offset + limit),
    total: rows.length
  };
}

module.exports = { vendMonitorSummary, listVendOrders };
