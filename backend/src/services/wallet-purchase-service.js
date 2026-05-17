"use strict";

const crypto = require("crypto");
const { ensureDatabase } = require("./local-database");
const ledger = require("./wallet-ledger-service");

const orderStates = new Set([
  "created",
  "hold_active",
  "dispatching",
  "delivered",
  "delivery_pending_review",
  "failed",
  "reversed"
]);

const deliveryStates = new Set([
  "token_generated",
  "remote_send_success",
  "remote_send_pending",
  "delivery_failed",
  "delivery_unknown"
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
  db.memoryStore.wallet_purchase_orders = db.memoryStore.wallet_purchase_orders || [];
  db.memoryStore.wallet_purchase_deliveries = db.memoryStore.wallet_purchase_deliveries || [];
}

function ensurePurchaseSchema() {
  const db = ensureDatabase();
  ledger.walletForOrganization("__schema_probe__");
  ensureMemoryStore(db);
  if (db.memoryStore) return db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_purchase_orders (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      target_meter TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      hold_id TEXT NOT NULL,
      receipt_number TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(wallet_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS wallet_purchase_deliveries (
      id TEXT PRIMARY KEY,
      purchase_order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      token_value TEXT NOT NULL,
      remote_reference TEXT NOT NULL,
      failure_reason TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS wallet_purchase_orders_org_created_idx
      ON wallet_purchase_orders(organization_id, created_at);
    CREATE INDEX IF NOT EXISTS wallet_purchase_orders_status_created_idx
      ON wallet_purchase_orders(status, created_at);
  `);
  return db;
}

function receiptNumber() {
  return `RCP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function demoTokenValue(orderId) {
  const seed = crypto.createHash("sha256").update(orderId).digest("hex").slice(0, 20);
  return seed.match(/.{1,4}/g).join("-");
}

function mapOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    walletId: row.wallet_id ?? row.walletId,
    organizationId: row.organization_id ?? row.organizationId,
    mode: row.mode,
    targetMeter: row.target_meter ?? row.targetMeter,
    customerName: row.customer_name ?? row.customerName,
    amountMinor: Number(row.amount_minor ?? row.amountMinor ?? 0),
    currency: row.currency,
    status: row.status,
    holdId: row.hold_id ?? row.holdId,
    receiptNumber: row.receipt_number ?? row.receiptNumber,
    idempotencyKey: row.idempotency_key ?? row.idempotencyKey,
    actorId: row.actor_id ?? row.actorId,
    details: row.details || parseJson(row.detail_json, {}),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

function mapDelivery(row) {
  if (!row) return null;
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id ?? row.purchaseOrderId,
    status: row.status,
    tokenValue: row.token_value ?? row.tokenValue,
    remoteReference: row.remote_reference ?? row.remoteReference,
    failureReason: row.failure_reason ?? row.failureReason,
    details: row.details || parseJson(row.detail_json, {}),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

function createPurchaseOrder(input = {}) {
  const db = ensurePurchaseSchema();
  const wallet = ledger.walletForOrganization(requireText(input.organizationId, "Organization id"));
  if (!wallet) throw new Error("Wallet not found");
  if (wallet.status !== "active") throw new Error("Wallet is not active");
  const key = requireText(input.idempotencyKey, "Idempotency key");
  const existing = findOrderByIdempotency(wallet.id, key);
  if (existing) return existing;
  const timestamp = nowIso();
  const orderId = String(input.id || crypto.randomUUID());
  const hold = ledger.placeHold({
    walletId: wallet.id,
    amountMinor: amountMinor(input.amountMinor),
    referenceType: "wallet_purchase_order",
    referenceId: orderId,
    idempotencyKey: `hold:${key}`,
    actorId: input.actorId || "system",
    details: {
      mode: input.mode || "token",
      targetMeter: input.targetMeter || ""
    }
  });
  const order = {
    id: orderId,
    walletId: wallet.id,
    organizationId: wallet.organizationId,
    mode: requireText(input.mode || "token", "Purchase mode"),
    targetMeter: requireText(input.targetMeter, "Target meter"),
    customerName: String(input.customerName || ""),
    amountMinor: amountMinor(input.amountMinor),
    currency: "NGN",
    status: "hold_active",
    holdId: hold.id,
    receiptNumber: input.receiptNumber || receiptNumber(),
    idempotencyKey: key,
    actorId: requireText(input.actorId || "system", "Actor id"),
    details: input.details || {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
  if (db.memoryStore) {
    db.memoryStore.wallet_purchase_orders.push(order);
  } else {
    db.prepare(`
      INSERT INTO wallet_purchase_orders (
        id, wallet_id, organization_id, mode, target_meter, customer_name, amount_minor,
        currency, status, hold_id, receipt_number, idempotency_key, actor_id,
        detail_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      order.id,
      order.walletId,
      order.organizationId,
      order.mode,
      order.targetMeter,
      order.customerName,
      order.amountMinor,
      order.currency,
      order.status,
      order.holdId,
      order.receiptNumber,
      order.idempotencyKey,
      order.actorId,
      jsonText(order.details),
      order.createdAt,
      order.updatedAt
    );
  }
  return order;
}

function completeTokenPurchase(input = {}) {
  const order = purchaseOrderById(input.purchaseOrderId);
  if (!order) throw new Error("Purchase order not found");
  if (order.mode !== "token") throw new Error("Purchase order is not token mode");
  if (!["hold_active", "dispatching"].includes(order.status)) return purchaseDetail(order.id);
  const tokenValue = input.tokenValue || demoTokenValue(order.id);
  const delivery = saveDelivery({
    purchaseOrderId: order.id,
    status: "token_generated",
    tokenValue,
    remoteReference: "",
    failureReason: "",
    details: input.details || {}
  });
  ledger.captureHold({
    holdId: order.holdId,
    referenceType: "wallet_purchase_order",
    referenceId: order.id,
    idempotencyKey: `capture:${order.id}`,
    actorId: input.actorId || order.actorId,
    details: { deliveryId: delivery.id }
  });
  updateOrderStatus(order.id, "delivered");
  return purchaseDetail(order.id);
}

function markRemoteSendPending(input = {}) {
  const order = purchaseOrderById(input.purchaseOrderId);
  if (!order) throw new Error("Purchase order not found");
  if (order.mode !== "remote_send") throw new Error("Purchase order is not remote-send mode");
  const delivery = saveDelivery({
    purchaseOrderId: order.id,
    status: "remote_send_pending",
    tokenValue: "",
    remoteReference: input.remoteReference || "",
    failureReason: "",
    details: input.details || {}
  });
  updateOrderStatus(order.id, "delivery_pending_review");
  return { order: purchaseOrderById(order.id), delivery };
}

function completeRemoteSend(input = {}) {
  const order = purchaseOrderById(input.purchaseOrderId);
  if (!order) throw new Error("Purchase order not found");
  if (order.mode !== "remote_send") throw new Error("Purchase order is not remote-send mode");
  if (!["hold_active", "dispatching", "delivery_pending_review"].includes(order.status)) return purchaseDetail(order.id);
  const delivery = saveDelivery({
    purchaseOrderId: order.id,
    status: "remote_send_success",
    tokenValue: "",
    remoteReference: requireText(input.remoteReference, "Remote reference"),
    failureReason: "",
    details: input.details || {}
  });
  ledger.captureHold({
    holdId: order.holdId,
    referenceType: "wallet_purchase_order",
    referenceId: order.id,
    idempotencyKey: `remote-capture:${order.id}`,
    actorId: input.actorId || order.actorId,
    details: { deliveryId: delivery.id, remoteReference: delivery.remoteReference }
  });
  updateOrderStatus(order.id, "delivered");
  return purchaseDetail(order.id);
}

function failPurchase(input = {}) {
  const order = purchaseOrderById(input.purchaseOrderId);
  if (!order) throw new Error("Purchase order not found");
  const delivery = saveDelivery({
    purchaseOrderId: order.id,
    status: "delivery_failed",
    tokenValue: "",
    remoteReference: input.remoteReference || "",
    failureReason: requireText(input.failureReason, "Failure reason"),
    details: input.details || {}
  });
  ledger.releaseHold({
    holdId: order.holdId,
    actorId: input.actorId || order.actorId
  });
  updateOrderStatus(order.id, "failed");
  return { order: purchaseOrderById(order.id), delivery };
}

function saveDelivery(input = {}) {
  const db = ensurePurchaseSchema();
  const status = requireText(input.status, "Delivery status");
  if (!deliveryStates.has(status)) throw new Error("Invalid delivery status");
  const timestamp = nowIso();
  const delivery = {
    id: String(input.id || crypto.randomUUID()),
    purchaseOrderId: requireText(input.purchaseOrderId, "Purchase order id"),
    status,
    tokenValue: String(input.tokenValue || ""),
    remoteReference: String(input.remoteReference || ""),
    failureReason: String(input.failureReason || ""),
    details: input.details || {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
  if (db.memoryStore) {
    db.memoryStore.wallet_purchase_deliveries.push(delivery);
  } else {
    db.prepare(`
      INSERT INTO wallet_purchase_deliveries (
        id, purchase_order_id, status, token_value, remote_reference, failure_reason,
        detail_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      delivery.id,
      delivery.purchaseOrderId,
      delivery.status,
      delivery.tokenValue,
      delivery.remoteReference,
      delivery.failureReason,
      jsonText(delivery.details),
      delivery.createdAt,
      delivery.updatedAt
    );
  }
  return delivery;
}

function updateOrderStatus(orderId, status) {
  const db = ensurePurchaseSchema();
  if (!orderStates.has(status)) throw new Error("Invalid purchase order status");
  const order = purchaseOrderById(orderId);
  if (!order) throw new Error("Purchase order not found");
  const timestamp = nowIso();
  if (db.memoryStore) {
    const row = db.memoryStore.wallet_purchase_orders.find((entry) => entry.id === order.id);
    row.status = status;
    row.updatedAt = timestamp;
  } else {
    db.prepare(`
      UPDATE wallet_purchase_orders
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(status, timestamp, order.id);
  }
  return purchaseOrderById(order.id);
}

function purchaseOrderById(orderId) {
  const db = ensurePurchaseSchema();
  const id = requireText(orderId, "Purchase order id");
  if (db.memoryStore) {
    return db.memoryStore.wallet_purchase_orders.find((row) => row.id === id) || null;
  }
  return mapOrder(db.prepare(`
    SELECT id, wallet_id, organization_id, mode, target_meter, customer_name, amount_minor,
      currency, status, hold_id, receipt_number, idempotency_key, actor_id,
      detail_json, created_at, updated_at
    FROM wallet_purchase_orders
    WHERE id = ?
  `).get(id));
}

function findOrderByIdempotency(walletId, idempotencyKey) {
  const db = ensurePurchaseSchema();
  if (db.memoryStore) {
    return db.memoryStore.wallet_purchase_orders.find((row) =>
      row.walletId === walletId && row.idempotencyKey === idempotencyKey
    ) || null;
  }
  return mapOrder(db.prepare(`
    SELECT id, wallet_id, organization_id, mode, target_meter, customer_name, amount_minor,
      currency, status, hold_id, receipt_number, idempotency_key, actor_id,
      detail_json, created_at, updated_at
    FROM wallet_purchase_orders
    WHERE wallet_id = ? AND idempotency_key = ?
  `).get(walletId, idempotencyKey));
}

function deliveriesForOrder(orderId) {
  const db = ensurePurchaseSchema();
  const id = requireText(orderId, "Purchase order id");
  if (db.memoryStore) {
    return db.memoryStore.wallet_purchase_deliveries
      .filter((row) => row.purchaseOrderId === id)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  }
  return db.prepare(`
    SELECT id, purchase_order_id, status, token_value, remote_reference, failure_reason,
      detail_json, created_at, updated_at
    FROM wallet_purchase_deliveries
    WHERE purchase_order_id = ?
    ORDER BY created_at DESC
  `).all(id).map(mapDelivery);
}

function listPurchaseOrders(options = {}) {
  const db = ensurePurchaseSchema();
  const organizationId = String(options.organizationId || "").trim();
  const status = String(options.status || "").trim();
  const limit = Math.max(1, Math.min(Number(options.limit || options.pageSize || 100), 500));
  if (db.memoryStore) {
    return db.memoryStore.wallet_purchase_orders
      .filter((row) => !organizationId || row.organizationId === organizationId)
      .filter((row) => !status || row.status === status)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .slice(0, limit);
  }
  const clauses = [];
  const params = [];
  if (organizationId) {
    clauses.push("organization_id = ?");
    params.push(organizationId);
  }
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`
    SELECT id, wallet_id, organization_id, mode, target_meter, customer_name, amount_minor,
      currency, status, hold_id, receipt_number, idempotency_key, actor_id,
      detail_json, created_at, updated_at
    FROM wallet_purchase_orders
    ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params, limit).map(mapOrder);
}

function purchaseDetail(orderId) {
  const order = purchaseOrderById(orderId);
  if (!order) throw new Error("Purchase order not found");
  return {
    order,
    deliveries: deliveriesForOrder(order.id),
    walletSummary: ledger.walletSummary(order.walletId)
  };
}

module.exports = {
  completeTokenPurchase,
  completeRemoteSend,
  createPurchaseOrder,
  deliveriesForOrder,
  failPurchase,
  listPurchaseOrders,
  markRemoteSendPending,
  purchaseDetail,
  purchaseOrderById
};
