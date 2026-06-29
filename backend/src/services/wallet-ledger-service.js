"use strict";

const crypto = require("crypto");
const { ensureDatabase } = require("./local-database");

const currency = "NGN";
const ledgerTypes = new Set([
  "funding_credit",
  "manual_credit",
  "hold_placement",
  "hold_release",
  "purchase_capture",
  "purchase_reversal",
  "refund_adjustment",
  "admin_adjustment",
  "reconciliation_correction"
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

function normalizeAmountMinor(value) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Amount must be a positive integer in minor units");
  }
  return amount;
}

function requireText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function ensureWalletMemoryStore(db) {
  if (!db?.memoryStore) return;
  db.memoryStore.vendor_organizations = db.memoryStore.vendor_organizations || [];
  db.memoryStore.vendor_wallets = db.memoryStore.vendor_wallets || [];
  db.memoryStore.wallet_ledger_entries = db.memoryStore.wallet_ledger_entries || [];
  db.memoryStore.wallet_holds = db.memoryStore.wallet_holds || [];
  db.memoryStore.wallet_audit_events = db.memoryStore.wallet_audit_events || [];
}

function ensureWalletSchema() {
  const db = ensureDatabase();
  ensureWalletMemoryStore(db);
  if (db.memoryStore) return db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_organizations (
      id TEXT PRIMARY KEY,
      organization_name TEXT NOT NULL,
      status TEXT NOT NULL,
      station_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vendor_wallets (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL UNIQUE,
      wallet_number TEXT NOT NULL UNIQUE,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES vendor_organizations(id)
    );
    CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(wallet_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS wallet_holds (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(wallet_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS wallet_audit_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS wallet_ledger_entries_wallet_created_idx
      ON wallet_ledger_entries(wallet_id, created_at);
    CREATE INDEX IF NOT EXISTS wallet_holds_wallet_status_idx
      ON wallet_holds(wallet_id, status);
    CREATE INDEX IF NOT EXISTS wallet_audit_events_org_created_idx
      ON wallet_audit_events(organization_id, created_at);
  `);
  return db;
}

function walletNumberFromOrganization(organizationId) {
  return `VW-${crypto.createHash("sha256").update(organizationId).digest("hex").slice(0, 10).toUpperCase()}`;
}

function mapOrganization(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationName: row.organization_name ?? row.organizationName,
    status: row.status,
    stationIds: Array.isArray(row.stationIds) ? row.stationIds : parseJson(row.station_ids_json, []),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

function mapWallet(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id ?? row.organizationId,
    walletNumber: row.wallet_number ?? row.walletNumber,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

function mapLedgerEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    walletId: row.wallet_id ?? row.walletId,
    organizationId: row.organization_id ?? row.organizationId,
    entryType: row.entry_type ?? row.entryType,
    direction: row.direction,
    amountMinor: Number(row.amount_minor ?? row.amountMinor ?? 0),
    currency: row.currency,
    referenceType: row.reference_type ?? row.referenceType,
    referenceId: row.reference_id ?? row.referenceId,
    idempotencyKey: row.idempotency_key ?? row.idempotencyKey,
    actorId: row.actor_id ?? row.actorId,
    details: row.details || parseJson(row.detail_json, {}),
    createdAt: row.created_at ?? row.createdAt
  };
}

function createVendorOrganization(input = {}) {
  const db = ensureWalletSchema();
  const timestamp = nowIso();
  const organization = {
    id: String(input.id || crypto.randomUUID()),
    organizationName: requireText(input.organizationName || input.name, "Organization name"),
    status: String(input.status || "pending_review"),
    stationIds: Array.isArray(input.stationIds) ? input.stationIds.map(String) : [],
    createdAt: timestamp,
    updatedAt: timestamp
  };

  if (db.memoryStore) {
    db.memoryStore.vendor_organizations.push(organization);
    recordWalletAudit({
      organizationId: organization.id,
      walletId: "",
      eventType: "vendor_organization_created",
      actorId: input.actorId || "system",
      details: { status: organization.status }
    });
    return organization;
  }

  db.prepare(`
    INSERT INTO vendor_organizations (id, organization_name, status, station_ids_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    organization.id,
    organization.organizationName,
    organization.status,
    jsonText(organization.stationIds),
    organization.createdAt,
    organization.updatedAt
  );
  recordWalletAudit({
    organizationId: organization.id,
    walletId: "",
    eventType: "vendor_organization_created",
    actorId: input.actorId || "system",
    details: { status: organization.status }
  });
  return organization;
}

function getVendorOrganization(organizationId) {
  const db = ensureWalletSchema();
  const id = requireText(organizationId, "Organization id");
  if (db.memoryStore) {
    return db.memoryStore.vendor_organizations.find((row) => row.id === id) || null;
  }
  return mapOrganization(db.prepare(`
    SELECT id, organization_name, status, station_ids_json, created_at, updated_at
    FROM vendor_organizations
    WHERE id = ?
  `).get(id));
}

function updateVendorStatus(organizationId, status, actorId = "system") {
  const db = ensureWalletSchema();
  const id = requireText(organizationId, "Organization id");
  const nextStatus = requireText(status, "Status");
  const timestamp = nowIso();
  if (db.memoryStore) {
    const row = db.memoryStore.vendor_organizations.find((entry) => entry.id === id);
    if (!row) throw new Error("Vendor organization not found");
    row.status = nextStatus;
    row.updatedAt = timestamp;
  } else {
    const result = db.prepare(`
      UPDATE vendor_organizations
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(nextStatus, timestamp, id);
    if (!result.changes) throw new Error("Vendor organization not found");
  }
  recordWalletAudit({
    organizationId: id,
    walletId: walletForOrganization(id)?.id || "",
    eventType: "vendor_status_updated",
    actorId,
    details: { status: nextStatus }
  });
  return getVendorOrganization(id);
}

function provisionWalletForOrganization(input = {}) {
  const db = ensureWalletSchema();
  const organizationId = requireText(input.organizationId, "Organization id");
  const organization = getVendorOrganization(organizationId);
  if (!organization) throw new Error("Vendor organization not found");
  const existing = walletForOrganization(organizationId);
  if (existing) return existing;
  const timestamp = nowIso();
  const wallet = {
    id: String(input.id || crypto.randomUUID()),
    organizationId,
    walletNumber: input.walletNumber || walletNumberFromOrganization(organizationId),
    currency,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  if (db.memoryStore) {
    db.memoryStore.vendor_wallets.push(wallet);
  } else {
    db.prepare(`
      INSERT INTO vendor_wallets (id, organization_id, wallet_number, currency, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      wallet.id,
      wallet.organizationId,
      wallet.walletNumber,
      wallet.currency,
      wallet.status,
      wallet.createdAt,
      wallet.updatedAt
    );
  }
  recordWalletAudit({
    organizationId,
    walletId: wallet.id,
    eventType: "wallet_provisioned",
    actorId: input.actorId || "system",
    details: { walletNumber: wallet.walletNumber }
  });
  return wallet;
}

function walletForOrganization(organizationId) {
  const db = ensureWalletSchema();
  const id = requireText(organizationId, "Organization id");
  if (db.memoryStore) {
    return db.memoryStore.vendor_wallets.find((row) => row.organizationId === id) || null;
  }
  return mapWallet(db.prepare(`
    SELECT id, organization_id, wallet_number, currency, status, created_at, updated_at
    FROM vendor_wallets
    WHERE organization_id = ?
  `).get(id));
}

function walletById(walletId) {
  const db = ensureWalletSchema();
  const id = requireText(walletId, "Wallet id");
  if (db.memoryStore) {
    return db.memoryStore.vendor_wallets.find((row) => row.id === id) || null;
  }
  return mapWallet(db.prepare(`
    SELECT id, organization_id, wallet_number, currency, status, created_at, updated_at
    FROM vendor_wallets
    WHERE id = ?
  `).get(id));
}

function freezeWallet({ walletId, actorId = "system", reason = "manual_freeze" }) {
  return updateWalletStatus({ walletId, status: "frozen", actorId, reason });
}

function unfreezeWallet({ walletId, actorId = "system", reason = "manual_unfreeze" }) {
  return updateWalletStatus({ walletId, status: "active", actorId, reason });
}

function updateWalletStatus({ walletId, status, actorId, reason }) {
  const db = ensureWalletSchema();
  const wallet = walletById(walletId);
  if (!wallet) throw new Error("Wallet not found");
  const timestamp = nowIso();
  if (db.memoryStore) {
    const row = db.memoryStore.vendor_wallets.find((entry) => entry.id === wallet.id);
    row.status = status;
    row.updatedAt = timestamp;
  } else {
    db.prepare(`
      UPDATE vendor_wallets
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(status, timestamp, wallet.id);
  }
  recordWalletAudit({
    organizationId: wallet.organizationId,
    walletId: wallet.id,
    eventType: `wallet_${status}`,
    actorId,
    details: { reason }
  });
  return walletById(wallet.id);
}

function ledgerRows(walletId) {
  const db = ensureWalletSchema();
  const id = requireText(walletId, "Wallet id");
  if (db.memoryStore) {
    return db.memoryStore.wallet_ledger_entries
      .filter((row) => row.walletId === id)
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  }
  return db.prepare(`
    SELECT id, wallet_id, organization_id, entry_type, direction, amount_minor, currency,
      reference_type, reference_id, idempotency_key, actor_id, detail_json, created_at
    FROM wallet_ledger_entries
    WHERE wallet_id = ?
    ORDER BY created_at ASC
  `).all(id).map(mapLedgerEntry);
}

function activeHolds(walletId) {
  const db = ensureWalletSchema();
  const id = requireText(walletId, "Wallet id");
  if (db.memoryStore) {
    return db.memoryStore.wallet_holds.filter((row) => row.walletId === id && row.status === "active");
  }
  return db.prepare(`
    SELECT id, wallet_id AS walletId, organization_id AS organizationId, amount_minor AS amountMinor,
      currency, status, reference_type AS referenceType, reference_id AS referenceId,
      idempotency_key AS idempotencyKey, actor_id AS actorId, detail_json, created_at AS createdAt,
      updated_at AS updatedAt
    FROM wallet_holds
    WHERE wallet_id = ? AND status = 'active'
  `).all(id).map((row) => ({
    ...row,
    details: parseJson(row.detail_json, {})
  }));
}

function ledgerBalanceMinor(walletId) {
  return ledgerRows(walletId).reduce((total, entry) => {
    if (entry.direction === "credit") return total + entry.amountMinor;
    if (entry.direction === "debit") return total - entry.amountMinor;
    return total;
  }, 0);
}

function availableBalanceMinor(walletId) {
  const ledgerBalance = ledgerBalanceMinor(walletId);
  const holdTotal = activeHolds(walletId).reduce((total, hold) => total + Number(hold.amountMinor || 0), 0);
  return ledgerBalance - holdTotal;
}

function walletSummary(walletId) {
  const wallet = walletById(walletId);
  if (!wallet) throw new Error("Wallet not found");
  const ledgerBalance = ledgerBalanceMinor(wallet.id);
  const heldBalance = activeHolds(wallet.id).reduce((total, hold) => total + Number(hold.amountMinor || 0), 0);
  return {
    wallet,
    ledgerBalanceMinor: ledgerBalance,
    heldBalanceMinor: heldBalance,
    availableBalanceMinor: ledgerBalance - heldBalance
  };
}

function postLedgerEntry(input = {}) {
  const db = ensureWalletSchema();
  const wallet = walletById(input.walletId);
  if (!wallet) throw new Error("Wallet not found");
  if (wallet.status !== "active" && input.entryType !== "admin_adjustment") {
    throw new Error("Wallet is not active");
  }
  const entryType = requireText(input.entryType, "Entry type");
  if (!ledgerTypes.has(entryType)) throw new Error("Invalid ledger entry type");
  const direction = requireText(input.direction, "Direction");
  if (direction !== "credit" && direction !== "debit") throw new Error("Invalid ledger direction");
  const amountMinor = normalizeAmountMinor(input.amountMinor);
  const idempotencyKey = requireText(input.idempotencyKey, "Idempotency key");
  const existing = findLedgerEntryByIdempotency(wallet.id, idempotencyKey);
  if (existing) return existing;
  if (direction === "debit" && availableBalanceMinor(wallet.id) < amountMinor) {
    throw new Error("Insufficient wallet balance");
  }
  const entry = {
    id: String(input.id || crypto.randomUUID()),
    walletId: wallet.id,
    organizationId: wallet.organizationId,
    entryType,
    direction,
    amountMinor,
    currency,
    referenceType: requireText(input.referenceType, "Reference type"),
    referenceId: requireText(input.referenceId, "Reference id"),
    idempotencyKey,
    actorId: requireText(input.actorId || "system", "Actor id"),
    details: input.details || {},
    createdAt: nowIso()
  };

  if (db.memoryStore) {
    db.memoryStore.wallet_ledger_entries.push(entry);
  } else {
    db.prepare(`
      INSERT INTO wallet_ledger_entries (
        id, wallet_id, organization_id, entry_type, direction, amount_minor, currency,
        reference_type, reference_id, idempotency_key, actor_id, detail_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.walletId,
      entry.organizationId,
      entry.entryType,
      entry.direction,
      entry.amountMinor,
      entry.currency,
      entry.referenceType,
      entry.referenceId,
      entry.idempotencyKey,
      entry.actorId,
      jsonText(entry.details),
      entry.createdAt
    );
  }
  recordWalletAudit({
    organizationId: wallet.organizationId,
    walletId: wallet.id,
    eventType: `ledger_${entryType}`,
    actorId: entry.actorId,
    details: {
      direction,
      amountMinor,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId
    }
  });
  return entry;
}

function findLedgerEntryByIdempotency(walletId, idempotencyKey) {
  const db = ensureWalletSchema();
  if (db.memoryStore) {
    return db.memoryStore.wallet_ledger_entries.find((row) =>
      row.walletId === walletId && row.idempotencyKey === idempotencyKey
    ) || null;
  }
  return mapLedgerEntry(db.prepare(`
    SELECT id, wallet_id, organization_id, entry_type, direction, amount_minor, currency,
      reference_type, reference_id, idempotency_key, actor_id, detail_json, created_at
    FROM wallet_ledger_entries
    WHERE wallet_id = ? AND idempotency_key = ?
  `).get(walletId, idempotencyKey));
}

function placeHold(input = {}) {
  const db = ensureWalletSchema();
  const wallet = walletById(input.walletId);
  if (!wallet) throw new Error("Wallet not found");
  if (wallet.status !== "active") throw new Error("Wallet is not active");
  const amountMinor = normalizeAmountMinor(input.amountMinor);
  const idempotencyKey = requireText(input.idempotencyKey, "Idempotency key");
  const existing = findHoldByIdempotency(wallet.id, idempotencyKey);
  if (existing) return existing;
  if (availableBalanceMinor(wallet.id) < amountMinor) throw new Error("Insufficient wallet balance");
  const timestamp = nowIso();
  const hold = {
    id: String(input.id || crypto.randomUUID()),
    walletId: wallet.id,
    organizationId: wallet.organizationId,
    amountMinor,
    currency,
    status: "active",
    referenceType: requireText(input.referenceType, "Reference type"),
    referenceId: requireText(input.referenceId, "Reference id"),
    idempotencyKey,
    actorId: requireText(input.actorId || "system", "Actor id"),
    details: input.details || {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
  if (db.memoryStore) {
    db.memoryStore.wallet_holds.push(hold);
  } else {
    db.prepare(`
      INSERT INTO wallet_holds (
        id, wallet_id, organization_id, amount_minor, currency, status, reference_type,
        reference_id, idempotency_key, actor_id, detail_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      hold.id,
      hold.walletId,
      hold.organizationId,
      hold.amountMinor,
      hold.currency,
      hold.status,
      hold.referenceType,
      hold.referenceId,
      hold.idempotencyKey,
      hold.actorId,
      jsonText(hold.details),
      hold.createdAt,
      hold.updatedAt
    );
  }
  recordWalletAudit({
    organizationId: wallet.organizationId,
    walletId: wallet.id,
    eventType: "hold_placed",
    actorId: hold.actorId,
    details: { amountMinor, referenceType: hold.referenceType, referenceId: hold.referenceId }
  });
  return hold;
}

function captureHold(input = {}) {
  const hold = holdById(input.holdId);
  if (!hold) throw new Error("Wallet hold not found");
  if (hold.status !== "active") return hold;
  postLedgerEntry({
    walletId: hold.walletId,
    entryType: "purchase_capture",
    direction: "debit",
    amountMinor: hold.amountMinor,
    referenceType: input.referenceType || hold.referenceType,
    referenceId: input.referenceId || hold.referenceId,
    idempotencyKey: input.idempotencyKey || `capture:${hold.id}`,
    actorId: input.actorId || hold.actorId,
    details: input.details || {}
  });
  return updateHoldStatus(hold.id, "captured", input.actorId || hold.actorId);
}

function releaseHold(input = {}) {
  const hold = holdById(input.holdId);
  if (!hold) throw new Error("Wallet hold not found");
  if (hold.status !== "active") return hold;
  return updateHoldStatus(hold.id, "released", input.actorId || hold.actorId);
}

function updateHoldStatus(holdId, status, actorId) {
  const db = ensureWalletSchema();
  const hold = holdById(holdId);
  if (!hold) throw new Error("Wallet hold not found");
  const timestamp = nowIso();
  if (db.memoryStore) {
    const row = db.memoryStore.wallet_holds.find((entry) => entry.id === hold.id);
    row.status = status;
    row.updatedAt = timestamp;
  } else {
    db.prepare(`
      UPDATE wallet_holds
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(status, timestamp, hold.id);
  }
  recordWalletAudit({
    organizationId: hold.organizationId,
    walletId: hold.walletId,
    eventType: `hold_${status}`,
    actorId,
    details: { holdId: hold.id }
  });
  return holdById(hold.id);
}

function findHoldByIdempotency(walletId, idempotencyKey) {
  const db = ensureWalletSchema();
  if (db.memoryStore) {
    return db.memoryStore.wallet_holds.find((row) =>
      row.walletId === walletId && row.idempotencyKey === idempotencyKey
    ) || null;
  }
  return mapHold(db.prepare(`
    SELECT id, wallet_id, organization_id, amount_minor, currency, status, reference_type,
      reference_id, idempotency_key, actor_id, detail_json, created_at, updated_at
    FROM wallet_holds
    WHERE wallet_id = ? AND idempotency_key = ?
  `).get(walletId, idempotencyKey));
}

function holdById(holdId) {
  const db = ensureWalletSchema();
  const id = requireText(holdId, "Hold id");
  if (db.memoryStore) {
    return db.memoryStore.wallet_holds.find((row) => row.id === id) || null;
  }
  return mapHold(db.prepare(`
    SELECT id, wallet_id, organization_id, amount_minor, currency, status, reference_type,
      reference_id, idempotency_key, actor_id, detail_json, created_at, updated_at
    FROM wallet_holds
    WHERE id = ?
  `).get(id));
}

function mapHold(row) {
  if (!row) return null;
  return {
    id: row.id,
    walletId: row.wallet_id ?? row.walletId,
    organizationId: row.organization_id ?? row.organizationId,
    amountMinor: Number(row.amount_minor ?? row.amountMinor ?? 0),
    currency: row.currency,
    status: row.status,
    referenceType: row.reference_type ?? row.referenceType,
    referenceId: row.reference_id ?? row.referenceId,
    idempotencyKey: row.idempotency_key ?? row.idempotencyKey,
    actorId: row.actor_id ?? row.actorId,
    details: row.details || parseJson(row.detail_json, {}),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

function recordWalletAudit(input = {}) {
  const db = ensureWalletSchema();
  const event = {
    id: String(input.id || crypto.randomUUID()),
    organizationId: String(input.organizationId || ""),
    walletId: String(input.walletId || ""),
    eventType: requireText(input.eventType, "Event type"),
    actorId: requireText(input.actorId || "system", "Actor id"),
    details: input.details || {},
    createdAt: nowIso()
  };
  if (db.memoryStore) {
    db.memoryStore.wallet_audit_events.push(event);
    return event;
  }
  db.prepare(`
    INSERT INTO wallet_audit_events (id, organization_id, wallet_id, event_type, actor_id, detail_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.organizationId,
    event.walletId,
    event.eventType,
    event.actorId,
    jsonText(event.details),
    event.createdAt
  );
  return event;
}

function listWalletAuditEvents({ organizationId, walletId, limit = 100 } = {}) {
  const db = ensureWalletSchema();
  const maxRows = Math.max(1, Math.min(Number(limit || 100), 500));
  if (db.memoryStore) {
    return db.memoryStore.wallet_audit_events
      .filter((row) => !organizationId || row.organizationId === organizationId)
      .filter((row) => !walletId || row.walletId === walletId)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .slice(0, maxRows);
  }
  const clauses = [];
  const params = [];
  if (organizationId) {
    clauses.push("organization_id = ?");
    params.push(organizationId);
  }
  if (walletId) {
    clauses.push("wallet_id = ?");
    params.push(walletId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`
    SELECT id, organization_id AS organizationId, wallet_id AS walletId, event_type AS eventType,
      actor_id AS actorId, detail_json, created_at AS createdAt
    FROM wallet_audit_events
    ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params, maxRows).map((row) => ({
    ...row,
    details: parseJson(row.detail_json, {})
  }));
}

module.exports = {
  activeHolds,
  availableBalanceMinor,
  captureHold,
  createVendorOrganization,
  freezeWallet,
  getVendorOrganization,
  ledgerBalanceMinor,
  ledgerRows,
  listWalletAuditEvents,
  placeHold,
  postLedgerEntry,
  provisionWalletForOrganization,
  releaseHold,
  unfreezeWallet,
  updateVendorStatus,
  walletById,
  walletForOrganization,
  walletSummary
};
