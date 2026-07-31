"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
let DatabaseSync = null;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch {
  DatabaseSync = null;
}

const {
  isExplicitStationId,
  mergeDerivedWithCanonical,
  canonicalStationRows
} = require("./oem-station-fallback");

const defaultDatabasePath = path.resolve(__dirname, "..", "..", "..", "tmp", "reference-crm.sqlite");

let database = null;
let activePath = "";
let memoryStore = null;

function createMemoryStore() {
  return {
    users: new Array(3).fill(null),
    roles: new Array(3).fill(null),
    permissions: new Array(5).fill(null),
    audit_logs: [],
    api_cache: new Map(),
    import_jobs: [],
    export_jobs: [],
    print_jobs: [],
    write_confirmations: [],
    account_bindings: [],
    automation_deliveries: [],
    vendor_organizations: [],
    vendor_wallets: [],
    wallet_ledger_entries: [],
    wallet_holds: [],
    wallet_funding_requests: [],
    wallet_funding_proofs: [],
    wallet_purchase_orders: [],
    wallet_purchase_deliveries: [],
    wallet_audit_events: [],
    vendor_onboarding_submissions: [],
    vendor_documents: [],
    wallet_approval_requests: [],
    wallet_reconciliation_runs: [],
    wallet_risk_events: [],
    sms_notifications: [],
    meter_token_overrides: new Map(),
    sgc_token_rules: new Map(),
    oem_manufacturers: new Map(),
    oem_endpoint_configs: new Map(),
    oem_credentials: new Map(),
    oem_station_mappings: new Map()
  };
}

function isMemoryDatabase(db) {
  return Boolean(db?.memoryStore);
}

function nowIso() {
  return new Date().toISOString();
}

function writableRoot() {
  if (process.env.VERCEL || process.env.AWS_REGION) return process.env.TMPDIR || process.env.TEMP || "/tmp";
  return path.resolve(__dirname, "..", "..", "tmp");
}

function databasePath() {
  const runningOnServerless = Boolean(process.env.VERCEL || process.env.AWS_REGION);
  if (process.env.LOCAL_DB_PATH) {
    const configuredPath = path.resolve(process.env.LOCAL_DB_PATH);
    if (!runningOnServerless) return configuredPath;
    const writableBase = path.resolve(writableRoot());
    if (configuredPath.startsWith(writableBase)) return configuredPath;
    return path.join(writableBase, path.basename(configuredPath) || "reference-crm.sqlite");
  }
  if (runningOnServerless) return path.join(writableRoot(), "reference-crm.sqlite");
  return defaultDatabasePath;
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const sanitized = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "authorizationPassword") continue;
    sanitized[key] = sanitizeValue(entry);
  }
  return sanitized;
}

function seedSecurityTables(db) {
  const timestamp = nowIso();
  const roles = [
    { id: crypto.randomUUID(), role_key: "super-admin", role_name: "Super Admin" },
    { id: crypto.randomUUID(), role_key: "operations-manager", role_name: "Operations Manager" },
    { id: crypto.randomUUID(), role_key: "account-officer", role_name: "Account Officer" }
  ];
  const users = [
    { id: crypto.randomUUID(), user_id: "admin", user_name: "System Admin", role_key: "super-admin" },
    { id: crypto.randomUUID(), user_id: "ops", user_name: "Operations Lead", role_key: "operations-manager" },
    { id: crypto.randomUUID(), user_id: "acct", user_name: "Account Officer", role_key: "account-officer" }
  ];
  const permissions = [
    { id: crypto.randomUUID(), role_key: "super-admin", route_hash: "*" },
    { id: crypto.randomUUID(), role_key: "operations-manager", route_hash: "#/remote-operation-record/remote-meter-reading-task" },
    { id: crypto.randomUUID(), role_key: "operations-manager", route_hash: "#/remote-operation-record/remote-meter-control-task" },
    { id: crypto.randomUUID(), role_key: "account-officer", route_hash: "#/management/account" },
    { id: crypto.randomUUID(), role_key: "account-officer", route_hash: "#/token/credit-token-record" }
  ];

  const insertRole = db.prepare(`
    INSERT OR IGNORE INTO roles (id, role_key, role_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, user_id, user_name, role_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertPermission = db.prepare(`
    INSERT OR IGNORE INTO permissions (id, role_key, route_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const role of roles) {
    insertRole.run(role.id, role.role_key, role.role_name, timestamp, timestamp);
  }
  for (const user of users) {
    insertUser.run(user.id, user.user_id, user.user_name, user.role_key, timestamp, timestamp);
  }
  for (const permission of permissions) {
    insertPermission.run(permission.id, permission.role_key, permission.route_hash, timestamp, timestamp);
  }
}

function ensureDatabase() {
  const resolvedPath = databasePath();
  if (database && activePath === resolvedPath) return database;
  if (database && typeof database.close === "function") database.close();

  if (!DatabaseSync || process.env.LOCAL_DB_MODE === "memory") {
    memoryStore = memoryStore || createMemoryStore();
    database = { memoryStore };
    activePath = resolvedPath;
    return database;
  }

  ensureDirectory(resolvedPath);
  database = new DatabaseSync(resolvedPath);
  activePath = resolvedPath;
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      user_name TEXT NOT NULL,
      role_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      role_key TEXT NOT NULL UNIQUE,
      role_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      role_key TEXT NOT NULL,
      route_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(role_key, route_hash)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      outcome TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      proxy_source TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_cache (
      id TEXT PRIMARY KEY,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      request_key TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(method, path, request_key)
    );
    CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY,
      route_hash TEXT NOT NULL,
      file_name TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS export_jobs (
      id TEXT PRIMARY KEY,
      route_hash TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      format TEXT NOT NULL,
      status TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS print_jobs (
      id TEXT PRIMARY KEY,
      route_hash TEXT NOT NULL,
      receipt_type TEXT NOT NULL,
      status TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS write_confirmations (
      id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      action TEXT NOT NULL,
      confirmation_text TEXT NOT NULL,
      authorization_provided INTEGER NOT NULL,
      status TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_bindings (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      meter_id TEXT NOT NULL,
      tariff_id TEXT NOT NULL,
      ct_ratio TEXT NOT NULL,
      station_id TEXT NOT NULL,
      remark TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(customer_id, meter_id)
    );
    CREATE TABLE IF NOT EXISTS automation_deliveries (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      incident_kind TEXT NOT NULL,
      incident_title TEXT NOT NULL,
      webhook_id TEXT NOT NULL,
      webhook_name TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      ok INTEGER NOT NULL,
      status_code INTEGER NOT NULL,
      error_text TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sms_notifications (
      id TEXT PRIMARY KEY,
      message_sid TEXT NOT NULL UNIQUE,
      to_number TEXT NOT NULL,
      from_number TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      error_code TEXT NOT NULL,
      error_message TEXT NOT NULL,
      reference TEXT NOT NULL,
      callback_url TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT,
      delivered_at TEXT
    );
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
      updated_at TEXT NOT NULL
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
    CREATE TABLE IF NOT EXISTS wallet_funding_requests (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      verified_amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      reference_code TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      reviewed_by TEXT NOT NULL,
      reviewer_note TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(wallet_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS wallet_funding_proofs (
      id TEXT PRIMARY KEY,
      funding_request_id TEXT NOT NULL,
      storage_bucket TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
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
    CREATE TABLE IF NOT EXISTS wallet_audit_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
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
    CREATE TABLE IF NOT EXISTS wallet_approval_requests (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      approval_type TEXT NOT NULL,
      status TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      maker_id TEXT NOT NULL,
      checker_id TEXT NOT NULL,
      reviewer_note TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(wallet_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS wallet_reconciliation_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      mismatch_count INTEGER NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wallet_risk_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meter_token_overrides (
      meter_id TEXT PRIMARY KEY,
      is_s2 INTEGER NOT NULL,
      note TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sgc_token_rules (
      sgc TEXT PRIMARY KEY,
      is_s2 INTEGER NOT NULL,
      note TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oem_manufacturers (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      logo_storage_path TEXT,
      status TEXT NOT NULL,
      is_seed_default INTEGER NOT NULL DEFAULT 0,
      capabilities_json TEXT NOT NULL DEFAULT '{}',
      vending_strategy TEXT NOT NULL DEFAULT 'sts_token',
      rate_limit_window_ms INTEGER,
      rate_limit_max_requests INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oem_endpoint_configs (
      oem_id TEXT NOT NULL,
      logical_key TEXT NOT NULL,
      upstream_path TEXT NOT NULL,
      method TEXT NOT NULL,
      casing_variant TEXT,
      request_field_map TEXT NOT NULL DEFAULT '{}',
      response_field_map TEXT NOT NULL DEFAULT '{}',
      payload_shape TEXT NOT NULL DEFAULT '{}',
      pagination_style TEXT,
      requires_live_read INTEGER NOT NULL DEFAULT 0,
      is_write_override INTEGER,
      adapter_fn_name TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (oem_id, logical_key)
    );

    CREATE TABLE IF NOT EXISTS oem_credentials (
      oem_id TEXT PRIMARY KEY,
      auth_strategy TEXT NOT NULL,
      base_url TEXT,
      encrypted_bearer_token TEXT,
      encrypted_client_secret TEXT,
      encrypted_username TEXT,
      encrypted_password TEXT,
      token_endpoint_path TEXT,
      api_key_header_name TEXT,
      encryption_key_version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS oem_station_mappings (
      oem_id TEXT NOT NULL,
      station_id TEXT NOT NULL,
      community_label TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (oem_id, station_id)
    );
  `);

  // Lightweight ADD COLUMN migration for existing local dev SQLite files created
  // before a column existed — CREATE TABLE IF NOT EXISTS above only helps fresh
  // databases. SQLite has no "ADD COLUMN IF NOT EXISTS"; swallow the duplicate-
  // column error instead. Safe to run on every start.
  ensureColumnExists(database, "oem_credentials", "api_key_header_name", "TEXT");

  seedSecurityTables(database);
  return database;
}

function ensureColumnExists(db, table, column, definition) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column name/i.test(message)) throw error;
  }
}

// ── Meter token-format (STS S1/S2) per-meter overrides ──────────────────────
// The token "isS2" flag is normally guessed from meter phase, but phase does not
// reliably map to the STS standard. These rows pin the correct format per meter.
function getMeterTokenOverride(meterId) {
  const id = String(meterId || "").trim();
  if (!id) return null;
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    return db.memoryStore.meter_token_overrides.get(id) || null;
  }
  const row = db.prepare(
    "SELECT meter_id, is_s2, note, updated_by, updated_at FROM meter_token_overrides WHERE meter_id = ?"
  ).get(id);
  if (!row) return null;
  return {
    meterId: row.meter_id,
    isS2: row.is_s2 === 1,
    note: row.note || "",
    updatedBy: row.updated_by || "",
    updatedAt: row.updated_at
  };
}

function setMeterTokenOverride(entry = {}) {
  const id = String(entry.meterId || "").trim();
  if (!id) throw new Error("meterId is required");
  const db = ensureDatabase();
  const timestamp = nowIso();

  // null/undefined isS2 clears the override (revert to phase-derived default).
  if (entry.isS2 === null || entry.isS2 === undefined || entry.isS2 === "auto") {
    if (isMemoryDatabase(db)) {
      db.memoryStore.meter_token_overrides.delete(id);
    } else {
      db.prepare("DELETE FROM meter_token_overrides WHERE meter_id = ?").run(id);
    }
    return { meterId: id, cleared: true };
  }

  const isS2 = entry.isS2 === true || entry.isS2 === 1 || entry.isS2 === "true" || entry.isS2 === "1";
  const record = {
    meterId: id,
    isS2,
    note: String(entry.note || ""),
    updatedBy: String(entry.updatedBy || ""),
    updatedAt: timestamp
  };
  if (isMemoryDatabase(db)) {
    db.memoryStore.meter_token_overrides.set(id, record);
    return record;
  }
  db.prepare(`
    INSERT INTO meter_token_overrides (meter_id, is_s2, note, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(meter_id) DO UPDATE SET
      is_s2 = excluded.is_s2,
      note = excluded.note,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(id, isS2 ? 1 : 0, record.note, record.updatedBy, timestamp);
  return record;
}

function listMeterTokenOverrides() {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    return Array.from(db.memoryStore.meter_token_overrides.values());
  }
  return db.prepare(
    "SELECT meter_id, is_s2, note, updated_by, updated_at FROM meter_token_overrides ORDER BY updated_at DESC"
  ).all().map((row) => ({
    meterId: row.meter_id,
    isS2: row.is_s2 === 1,
    note: row.note || "",
    updatedBy: row.updated_by || "",
    updatedAt: row.updated_at
  }));
}

// ── SGC-level token-format rules ────────────────────────────────────────────
// STS standard is uniform within a Supply Group Code, so one rule covers a whole
// group of meters. Resolution order: per-meter override → SGC rule → phase guess.
function getSgcTokenRule(sgc) {
  const id = String(sgc || "").trim();
  if (!id) return null;
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    return db.memoryStore.sgc_token_rules.get(id) || null;
  }
  const row = db.prepare(
    "SELECT sgc, is_s2, note, updated_by, updated_at FROM sgc_token_rules WHERE sgc = ?"
  ).get(id);
  if (!row) return null;
  return { sgc: row.sgc, isS2: row.is_s2 === 1, note: row.note || "", updatedBy: row.updated_by || "", updatedAt: row.updated_at };
}

function setSgcTokenRule(entry = {}) {
  const id = String(entry.sgc || "").trim();
  if (!id) throw new Error("sgc is required");
  const db = ensureDatabase();
  const timestamp = nowIso();
  if (entry.isS2 === null || entry.isS2 === undefined || entry.isS2 === "auto") {
    if (isMemoryDatabase(db)) {
      db.memoryStore.sgc_token_rules.delete(id);
    } else {
      db.prepare("DELETE FROM sgc_token_rules WHERE sgc = ?").run(id);
    }
    return { sgc: id, cleared: true };
  }
  const isS2 = entry.isS2 === true || entry.isS2 === 1 || entry.isS2 === "true" || entry.isS2 === "1";
  const record = { sgc: id, isS2, note: String(entry.note || ""), updatedBy: String(entry.updatedBy || ""), updatedAt: timestamp };
  if (isMemoryDatabase(db)) {
    db.memoryStore.sgc_token_rules.set(id, record);
    return record;
  }
  db.prepare(`
    INSERT INTO sgc_token_rules (sgc, is_s2, note, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(sgc) DO UPDATE SET
      is_s2 = excluded.is_s2,
      note = excluded.note,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(id, isS2 ? 1 : 0, record.note, record.updatedBy, timestamp);
  return record;
}

function listSgcTokenRules() {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    return Array.from(db.memoryStore.sgc_token_rules.values());
  }
  return db.prepare(
    "SELECT sgc, is_s2, note, updated_by, updated_at FROM sgc_token_rules ORDER BY updated_at DESC"
  ).all().map((row) => ({
    sgc: row.sgc,
    isS2: row.is_s2 === 1,
    note: row.note || "",
    updatedBy: row.updated_by || "",
    updatedAt: row.updated_at
  }));
}

// ── OEM manufacturer registry ───────────────────────────────────────────────
// One row per meter manufacturer (Calinmeter, Sparkmeter, Ihemeter, ...). This is
// the top-level tenant entity the multi-OEM proxy resolves per request.
function mapOemManufacturerRow(row) {
  if (!row) return null;
  let capabilities = {};
  try {
    capabilities = typeof row.capabilities_json === "string" ? JSON.parse(row.capabilities_json || "{}") : (row.capabilities || {});
  } catch {
    capabilities = {};
  }
  const isSeedDefault = row.is_seed_default === 1 || row.is_seed_default === true || row.slug === "calinmeter";
  const hasCapabilities = capabilities && typeof capabilities === "object" && Object.values(capabilities).some(Boolean);
  if (!hasCapabilities || isSeedDefault) {
    capabilities = {
      remote_meter_task: true,
      tariff_management: true,
      gprs_support: true,
      event_notification: true,
      load_profile: true,
      firmware_update: true,
      dlms_protocol: true,
      dlt645_protocol: true,
      wallet_vending: true,
      ...capabilities
    };
  }
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    logoStoragePath: row.logo_storage_path || "",
    status: row.status,
    isSeedDefault,
    capabilities,
    vendingStrategy: row.vending_strategy || "sts_token",
    rateLimitWindowMs: row.rate_limit_window_ms || null,
    rateLimitMaxRequests: row.rate_limit_max_requests || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getOemManufacturer(idOrSlug) {
  const key = String(idOrSlug || "").trim();
  if (!key) return null;
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    const byId = db.memoryStore.oem_manufacturers.get(key);
    if (byId) return byId;
    for (const record of db.memoryStore.oem_manufacturers.values()) {
      if (record.slug === key) return record;
    }
    return null;
  }
  const row = db.prepare(
    "SELECT * FROM oem_manufacturers WHERE id = ? OR slug = ? LIMIT 1"
  ).get(key, key);
  return mapOemManufacturerRow(row);
}

function listOemManufacturers() {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    return Array.from(db.memoryStore.oem_manufacturers.values());
  }
  return db.prepare("SELECT * FROM oem_manufacturers ORDER BY created_at ASC").all().map(mapOemManufacturerRow);
}

function upsertOemManufacturer(entry = {}) {
  const db = ensureDatabase();
  const timestamp = nowIso();
  const slug = String(entry.slug || "").trim().toLowerCase();
  if (!slug) throw new Error("slug is required");
  const existing = getOemManufacturer(entry.id || slug);
  const id = existing?.id || entry.id || crypto.randomUUID();
  const record = {
    id,
    slug,
    displayName: String(entry.displayName || slug),
    logoStoragePath: String(entry.logoStoragePath || ""),
    status: String(entry.status || "draft"),
    isSeedDefault: Boolean(entry.isSeedDefault),
    capabilities: entry.capabilities && typeof entry.capabilities === "object" ? entry.capabilities : {},
    vendingStrategy: String(entry.vendingStrategy || "sts_token"),
    rateLimitWindowMs: entry.rateLimitWindowMs != null ? Number(entry.rateLimitWindowMs) : null,
    rateLimitMaxRequests: entry.rateLimitMaxRequests != null ? Number(entry.rateLimitMaxRequests) : null,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp
  };
  if (isMemoryDatabase(db)) {
    db.memoryStore.oem_manufacturers.set(id, record);
    return record;
  }
  db.prepare(`
    INSERT INTO oem_manufacturers (
      id, slug, display_name, logo_storage_path, status, is_seed_default,
      capabilities_json, vending_strategy, rate_limit_window_ms, rate_limit_max_requests,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      display_name = excluded.display_name,
      logo_storage_path = excluded.logo_storage_path,
      status = excluded.status,
      is_seed_default = excluded.is_seed_default,
      capabilities_json = excluded.capabilities_json,
      vending_strategy = excluded.vending_strategy,
      rate_limit_window_ms = excluded.rate_limit_window_ms,
      rate_limit_max_requests = excluded.rate_limit_max_requests,
      updated_at = excluded.updated_at
  `).run(
    id, record.slug, record.displayName, record.logoStoragePath, record.status,
    record.isSeedDefault ? 1 : 0, JSON.stringify(record.capabilities), record.vendingStrategy,
    record.rateLimitWindowMs, record.rateLimitMaxRequests, record.createdAt, timestamp
  );
  return record;
}

function deleteOemManufacturer(idOrSlug) {
  const existing = getOemManufacturer(idOrSlug);
  if (!existing) return { deleted: false };
  const db = ensureDatabase();
  const oemId = existing.id;
  if (isMemoryDatabase(db)) {
    // Mirror Supabase's ON DELETE CASCADE — remove dependent rows locally too,
    // otherwise deleting an OEM would orphan its credentials/endpoints/mappings.
    db.memoryStore.oem_manufacturers.delete(oemId);
    db.memoryStore.oem_credentials.delete(oemId);
    for (const key of Array.from(db.memoryStore.oem_endpoint_configs.keys())) {
      if (key.startsWith(`${oemId}::`)) db.memoryStore.oem_endpoint_configs.delete(key);
    }
    for (const key of Array.from(db.memoryStore.oem_station_mappings.keys())) {
      if (key.startsWith(`${oemId}::`)) db.memoryStore.oem_station_mappings.delete(key);
    }
  } else {
    db.prepare("DELETE FROM oem_endpoint_configs WHERE oem_id = ?").run(oemId);
    db.prepare("DELETE FROM oem_credentials WHERE oem_id = ?").run(oemId);
    db.prepare("DELETE FROM oem_station_mappings WHERE oem_id = ?").run(oemId);
    db.prepare("DELETE FROM oem_manufacturers WHERE id = ?").run(oemId);
  }
  return { deleted: true, id: oemId };
}

// ── OEM endpoint configuration ──────────────────────────────────────────────
// One row per (oemId, logicalKey) — the declarative mapping from a stable internal
// operation name to that OEM's real upstream path/method/casing/field shape.
function mapOemEndpointConfigRow(row) {
  if (!row) return null;
  const parseJson = (value) => {
    try {
      return JSON.parse(value || "{}");
    } catch {
      return {};
    }
  };
  return {
    oemId: row.oem_id,
    logicalKey: row.logical_key,
    upstreamPath: row.upstream_path,
    method: row.method,
    casingVariant: row.casing_variant || "",
    requestFieldMap: parseJson(row.request_field_map),
    responseFieldMap: parseJson(row.response_field_map),
    payloadShape: parseJson(row.payload_shape),
    paginationStyle: row.pagination_style || "none",
    requiresLiveRead: row.requires_live_read === 1,
    isWriteOverride: row.is_write_override === null || row.is_write_override === undefined ? null : row.is_write_override === 1,
    adapterFnName: row.adapter_fn_name || "",
    enabled: row.enabled === 1,
    updatedAt: row.updated_at
  };
}

function endpointConfigKey(oemId, logicalKey) {
  return `${String(oemId || "").trim()}::${String(logicalKey || "").trim()}`;
}

function getOemEndpointConfig(oemId, logicalKey) {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    return db.memoryStore.oem_endpoint_configs.get(endpointConfigKey(oemId, logicalKey)) || null;
  }
  const row = db.prepare(
    "SELECT * FROM oem_endpoint_configs WHERE oem_id = ? AND logical_key = ?"
  ).get(String(oemId || ""), String(logicalKey || ""));
  return mapOemEndpointConfigRow(row);
}

function listOemEndpointConfigs(oemId) {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    return Array.from(db.memoryStore.oem_endpoint_configs.values()).filter((row) => row.oemId === oemId);
  }
  return db.prepare(
    "SELECT * FROM oem_endpoint_configs WHERE oem_id = ? ORDER BY logical_key ASC"
  ).all(String(oemId || "")).map(mapOemEndpointConfigRow);
}

function upsertOemEndpointConfig(entry = {}) {
  const oemId = String(entry.oemId || "").trim();
  const logicalKey = String(entry.logicalKey || "").trim();
  if (!oemId || !logicalKey) throw new Error("oemId and logicalKey are required");
  const db = ensureDatabase();
  const timestamp = nowIso();
  const record = {
    oemId,
    logicalKey,
    upstreamPath: String(entry.upstreamPath || ""),
    method: String(entry.method || "GET").toUpperCase(),
    casingVariant: String(entry.casingVariant || ""),
    requestFieldMap: entry.requestFieldMap && typeof entry.requestFieldMap === "object" ? entry.requestFieldMap : {},
    responseFieldMap: entry.responseFieldMap && typeof entry.responseFieldMap === "object" ? entry.responseFieldMap : {},
    payloadShape: entry.payloadShape && typeof entry.payloadShape === "object" ? entry.payloadShape : {},
    paginationStyle: String(entry.paginationStyle || "none"),
    requiresLiveRead: Boolean(entry.requiresLiveRead),
    isWriteOverride: entry.isWriteOverride === null || entry.isWriteOverride === undefined ? null : Boolean(entry.isWriteOverride),
    adapterFnName: String(entry.adapterFnName || ""),
    enabled: entry.enabled !== false,
    updatedAt: timestamp
  };
  if (isMemoryDatabase(db)) {
    db.memoryStore.oem_endpoint_configs.set(endpointConfigKey(oemId, logicalKey), record);
    return record;
  }
  db.prepare(`
    INSERT INTO oem_endpoint_configs (
      oem_id, logical_key, upstream_path, method, casing_variant,
      request_field_map, response_field_map, payload_shape, pagination_style,
      requires_live_read, is_write_override, adapter_fn_name, enabled, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(oem_id, logical_key) DO UPDATE SET
      upstream_path = excluded.upstream_path,
      method = excluded.method,
      casing_variant = excluded.casing_variant,
      request_field_map = excluded.request_field_map,
      response_field_map = excluded.response_field_map,
      payload_shape = excluded.payload_shape,
      pagination_style = excluded.pagination_style,
      requires_live_read = excluded.requires_live_read,
      is_write_override = excluded.is_write_override,
      adapter_fn_name = excluded.adapter_fn_name,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `).run(
    oemId, logicalKey, record.upstreamPath, record.method, record.casingVariant,
    JSON.stringify(record.requestFieldMap), JSON.stringify(record.responseFieldMap), JSON.stringify(record.payloadShape),
    record.paginationStyle, record.requiresLiveRead ? 1 : 0,
    record.isWriteOverride === null ? null : (record.isWriteOverride ? 1 : 0),
    record.adapterFnName, record.enabled ? 1 : 0, timestamp
  );
  return record;
}

function deleteOemEndpointConfig(oemId, logicalKey) {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    return { deleted: db.memoryStore.oem_endpoint_configs.delete(endpointConfigKey(oemId, logicalKey)) };
  }
  const result = db.prepare("DELETE FROM oem_endpoint_configs WHERE oem_id = ? AND logical_key = ?").run(String(oemId || ""), String(logicalKey || ""));
  return { deleted: (result.changes || 0) > 0 };
}

// ── OEM credentials (encrypted at rest by the caller — this layer is storage-only) ──
function mapOemCredentialsRow(row) {
  if (!row) return null;
  return {
    oemId: row.oem_id,
    authStrategy: row.auth_strategy,
    baseUrl: row.base_url || "",
    encryptedBearerToken: row.encrypted_bearer_token || "",
    encryptedClientSecret: row.encrypted_client_secret || "",
    encryptedUsername: row.encrypted_username || "",
    encryptedPassword: row.encrypted_password || "",
    tokenEndpointPath: row.token_endpoint_path || "",
    apiKeyHeaderName: row.api_key_header_name || "",
    encryptionKeyVersion: row.encryption_key_version || 1,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by || ""
  };
}

function getOemCredentials(oemId) {
  const id = String(oemId || "").trim();
  if (!id) return null;
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    return db.memoryStore.oem_credentials.get(id) || null;
  }
  return mapOemCredentialsRow(db.prepare("SELECT * FROM oem_credentials WHERE oem_id = ?").get(id));
}

function upsertOemCredentials(entry = {}) {
  const oemId = String(entry.oemId || "").trim();
  if (!oemId) throw new Error("oemId is required");
  const db = ensureDatabase();
  const timestamp = nowIso();
  const record = {
    oemId,
    authStrategy: String(entry.authStrategy || "bearer_static"),
    baseUrl: String(entry.baseUrl || ""),
    encryptedBearerToken: String(entry.encryptedBearerToken || ""),
    encryptedClientSecret: String(entry.encryptedClientSecret || ""),
    encryptedUsername: String(entry.encryptedUsername || ""),
    encryptedPassword: String(entry.encryptedPassword || ""),
    tokenEndpointPath: String(entry.tokenEndpointPath || ""),
    apiKeyHeaderName: String(entry.apiKeyHeaderName || ""),
    encryptionKeyVersion: Number(entry.encryptionKeyVersion || 1),
    updatedAt: timestamp,
    updatedBy: String(entry.updatedBy || "")
  };
  if (isMemoryDatabase(db)) {
    db.memoryStore.oem_credentials.set(oemId, record);
    return record;
  }
  db.prepare(`
    INSERT INTO oem_credentials (
      oem_id, auth_strategy, base_url, encrypted_bearer_token, encrypted_client_secret,
      encrypted_username, encrypted_password, token_endpoint_path, api_key_header_name, encryption_key_version,
      updated_at, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(oem_id) DO UPDATE SET
      auth_strategy = excluded.auth_strategy,
      base_url = excluded.base_url,
      encrypted_bearer_token = excluded.encrypted_bearer_token,
      encrypted_client_secret = excluded.encrypted_client_secret,
      encrypted_username = excluded.encrypted_username,
      encrypted_password = excluded.encrypted_password,
      token_endpoint_path = excluded.token_endpoint_path,
      api_key_header_name = excluded.api_key_header_name,
      encryption_key_version = excluded.encryption_key_version,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run(
    oemId, record.authStrategy, record.baseUrl, record.encryptedBearerToken, record.encryptedClientSecret,
    record.encryptedUsername, record.encryptedPassword, record.tokenEndpointPath, record.apiKeyHeaderName, record.encryptionKeyVersion,
    timestamp, record.updatedBy
  );
  return record;
}

// ── OEM station/community mappings (drives the "installed in N communities" count) ──
function stationMappingKey(oemId, stationId) {
  return `${String(oemId || "").trim()}::${String(stationId || "").trim().toUpperCase()}`;
}

function isSeedOrCalinOem(oemId, oemSlug) {
  if (!oemId && !oemSlug) return true;
  const key = (String(oemId || "") + " " + String(oemSlug || "")).toLowerCase();
  if (key.includes("calin") || key.includes("b0e00000") || key.includes("seed")) return true;
  try {
    const oem = getOemManufacturer(oemId);
    if (!oem) return false;
    if (oem.isSeedDefault || String(oem.slug || "").toLowerCase().includes("calin")) return true;
  } catch {
    // ignore
  }
  return false;
}

function listOemStationMappings(oemId, oemSlug) {
  const db = ensureDatabase();
  const slugKey = String(oemSlug || "").trim().toLowerCase();
  const idKey = String(oemId || "").trim();
  const seedKey = "b0e00000-0000-0000-0000-000000000001";
  const isCalin = slugKey.includes("calin") || idKey.includes("calin") || idKey === seedKey
    || ((idKey || slugKey) ? isSeedOrCalinOem(idKey, slugKey) : false);

  let rows = [];
  if (isMemoryDatabase(db)) {
    rows = Array.from(db.memoryStore.oem_station_mappings.values()).filter(
      (row) => row.oemId === idKey || row.oemId === slugKey || (isCalin && (row.oemId === seedKey || row.oemId === "calinmeter"))
    );
  } else {
    rows = db.prepare(
      "SELECT * FROM oem_station_mappings WHERE oem_id = ? OR oem_id = ? OR (oem_id = ? AND ?) OR (oem_id = 'calinmeter' AND ?) ORDER BY station_id ASC"
    ).all(idKey, slugKey, seedKey, isCalin ? 1 : 0, isCalin ? 1 : 0).map((row) => ({
      oemId: row.oem_id,
      stationId: row.station_id,
      communityLabel: row.community_label || row.station_id,
      createdAt: row.created_at
    }));
  }

  const filtered = rows.filter((r) => isExplicitStationId(r.stationId));
  if (filtered.length > 0) return filtered;

  if (isCalin) {
    try {
      // There is no `stations` table locally either — account_bindings.station_id
      // is the station universe this database actually carries.
      const stationIds = isMemoryDatabase(db)
        ? (db.memoryStore.account_bindings || []).map((b) => b && b.stationId)
        : db.prepare(
          "SELECT DISTINCT station_id FROM account_bindings WHERE station_id IS NOT NULL AND station_id <> '' ORDER BY station_id ASC"
        ).all().map((row) => row.station_id);

      const live = mergeDerivedWithCanonical(oemId, stationIds);
      if (live.length > 0) return live;
    } catch {
      // ignore
    }

    return canonicalStationRows(oemId);
  }

  return [];
}

function countOemStationMappings(oemId, oemSlug) {
  return listOemStationMappings(oemId, oemSlug).length;
}

function upsertOemStationMapping(entry = {}) {
  const oemId = String(entry.oemId || "").trim();
  const stationId = String(entry.stationId || "").trim();
  if (!oemId || !stationId) throw new Error("oemId and stationId are required");
  const db = ensureDatabase();
  const timestamp = nowIso();
  const record = { oemId, stationId, communityLabel: String(entry.communityLabel || ""), createdAt: timestamp };
  if (isMemoryDatabase(db)) {
    const key = stationMappingKey(oemId, stationId);
    const existing = db.memoryStore.oem_station_mappings.get(key);
    if (existing) record.createdAt = existing.createdAt;
    db.memoryStore.oem_station_mappings.set(key, record);
    return record;
  }
  db.prepare(`
    INSERT INTO oem_station_mappings (oem_id, station_id, community_label, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(oem_id, station_id) DO UPDATE SET
      community_label = excluded.community_label
  `).run(oemId, stationId, record.communityLabel, timestamp);
  return record;
}

function deleteOemStationMapping(oemId, stationId) {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    return { deleted: db.memoryStore.oem_station_mappings.delete(stationMappingKey(oemId, stationId)) };
  }
  const result = db.prepare("DELETE FROM oem_station_mappings WHERE oem_id = ? AND station_id = ?").run(String(oemId || ""), String(stationId || ""));
  return { deleted: (result.changes || 0) > 0 };
}

function cacheApiResponse(entry) {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    const key = JSON.stringify({
      method: String(entry.method || "GET").toUpperCase(),
      path: String(entry.path || "/"),
      requestKey: String(entry.requestKey || "")
    });
    db.memoryStore.api_cache.set(key, {
      status: Number(entry.status || 200),
      source: String(entry.source || "unknown"),
      body: sanitizeValue(entry.body || {})
    });
    return;
  }
  const timestamp = nowIso();
  const statement = db.prepare(`
    INSERT INTO api_cache (id, method, path, request_key, status_code, response_json, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(method, path, request_key) DO UPDATE SET
      status_code = excluded.status_code,
      response_json = excluded.response_json,
      source = excluded.source,
      updated_at = excluded.updated_at
  `);
  statement.run(
    crypto.randomUUID(),
    String(entry.method || "GET").toUpperCase(),
    String(entry.path || "/"),
    String(entry.requestKey || ""),
    Number(entry.status || 200),
    JSON.stringify(sanitizeValue(entry.body || {})),
    String(entry.source || "unknown"),
    timestamp,
    timestamp
  );
}

function readCachedApiResponse(entry) {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    const key = JSON.stringify({
      method: String(entry.method || "GET").toUpperCase(),
      path: String(entry.path || "/"),
      requestKey: String(entry.requestKey || "")
    });
    return db.memoryStore.api_cache.get(key) || null;
  }
  const row = db.prepare(`
    SELECT status_code, response_json, source
    FROM api_cache
    WHERE method = ? AND path = ? AND request_key = ?
  `).get(
    String(entry.method || "GET").toUpperCase(),
    String(entry.path || "/"),
    String(entry.requestKey || "")
  );
  if (!row) return null;
  return {
    status: row.status_code,
    source: row.source,
    body: parseJson(row.response_json, {})
  };
}

function recordAuditLog(entry) {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    db.memoryStore.audit_logs.push({
      ...entry,
      details: sanitizeValue(entry.details || {})
    });
    return;
  }
  db.prepare(`
    INSERT INTO audit_logs (id, method, path, outcome, status_code, proxy_source, detail_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    String(entry.method || "GET").toUpperCase(),
    String(entry.path || "/"),
    String(entry.outcome || "success"),
    Number(entry.statusCode || 200),
    String(entry.proxySource || "unknown"),
    JSON.stringify(sanitizeValue(entry.details || {})),
    nowIso()
  );
}

function listAuditLogs(options = {}) {
  const db = ensureDatabase();
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 500));
  const proxySource = String(options.proxySource || "");
  if (isMemoryDatabase(db)) {
    return db.memoryStore.audit_logs
      .filter((row) => !proxySource || String(row.proxySource || "") === proxySource)
      .slice(-limit)
      .reverse()
      .map((row) => ({
        id: row.id || null,
        method: String(row.method || "GET").toUpperCase(),
        path: String(row.path || "/"),
        outcome: String(row.outcome || "success"),
        statusCode: Number(row.statusCode || 200),
        proxySource: String(row.proxySource || "unknown"),
        details: sanitizeValue(row.details || {}),
        createdAt: row.createdAt || null
      }));
  }
  const columns = "id, method, path, outcome, status_code, proxy_source, detail_json, created_at";
  const rows = proxySource
    ? db.prepare(`
        SELECT ${columns} FROM audit_logs WHERE proxy_source = ? ORDER BY created_at DESC LIMIT ?
      `).all(proxySource, limit)
    : db.prepare(`
        SELECT ${columns} FROM audit_logs ORDER BY created_at DESC LIMIT ?
      `).all(limit);
  return rows.map((row) => ({
    id: row.id,
    method: row.method,
    path: row.path,
    outcome: row.outcome,
    statusCode: row.status_code,
    proxySource: row.proxy_source,
    details: parseJson(row.detail_json, {}),
    createdAt: row.created_at
  }));
}

function recordImportJob(entry) {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    db.memoryStore.import_jobs.push({
      ...entry,
      details: sanitizeValue(entry.details || {})
    });
    return;
  }
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO import_jobs (id, route_hash, file_name, row_count, status, detail_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    String(entry.routeHash || ""),
    String(entry.fileName || "unknown"),
    Number(entry.rowCount || 0),
    String(entry.status || "submitted"),
    JSON.stringify(sanitizeValue(entry.details || {})),
    timestamp,
    timestamp
  );
}

function listImportJobs(options = {}) {
  const db = ensureDatabase();
  const routeHash = String(options.routeHash || "");
  const limit = Math.max(1, Math.min(Number(options.pageSize || options.limit || 500), 1000));
  const offset = Math.max(0, Number(options.offset || 0));
  const filters = [];
  const params = [];

  if (routeHash) {
    filters.push("route_hash = ?");
    params.push(routeHash);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT id, route_hash, file_name, row_count, status, detail_json, created_at, updated_at
    FROM import_jobs
    ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  const total = db.prepare(`
    SELECT COUNT(*) AS count
    FROM import_jobs
    ${where}
  `).get(...params).count;

  return {
    rows: rows.map((row) => {
      const details = parseJson(row.detail_json, {});
      return {
        id: row.id,
        name: row.file_name,
        status: row.status,
        remark: details.kind || details.action || `${row.row_count} row(s)`,
        createDate: row.created_at,
        updateDate: row.updated_at,
        stationId: details.stationId || details.SITE_ID || "",
        routeHash: row.route_hash,
        rowCount: row.row_count
      };
    }),
    total
  };
}

function recordExportJob(entry) {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    db.memoryStore.export_jobs.push({
      ...entry,
      details: sanitizeValue(entry.details || {})
    });
    return;
  }
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO export_jobs (id, route_hash, row_count, format, status, detail_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    String(entry.routeHash || ""),
    Number(entry.rowCount || 0),
    String(entry.format || "csv"),
    String(entry.status || "completed"),
    JSON.stringify(sanitizeValue(entry.details || {})),
    timestamp,
    timestamp
  );
}

function recordPrintJob(entry) {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    db.memoryStore.print_jobs.push({
      ...entry,
      details: sanitizeValue(entry.details || {})
    });
    return;
  }
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO print_jobs (id, route_hash, receipt_type, status, detail_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    String(entry.routeHash || ""),
    String(entry.receiptType || "credit"),
    String(entry.status || "completed"),
    JSON.stringify(sanitizeValue(entry.details || {})),
    timestamp,
    timestamp
  );
}

function recordWriteConfirmation(entry) {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    db.memoryStore.write_confirmations.push({
      ...entry,
      details: sanitizeValue(entry.details || {})
    });
    return;
  }
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO write_confirmations (id, endpoint, action, confirmation_text, authorization_provided, status, detail_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    String(entry.endpoint || ""),
    String(entry.action || ""),
    String(entry.confirmationText || ""),
    entry.authorizationProvided ? 1 : 0,
    String(entry.status || "submitted"),
    JSON.stringify(sanitizeValue(entry.details || {})),
    timestamp,
    timestamp
  );
}

function saveAccountBinding(entry) {
  const db = ensureDatabase();
  const normalized = {
    customerId: String(entry.customerId || ""),
    meterId: String(entry.meterId || ""),
    tariffId: String(entry.tariffId || ""),
    ctRatio: String(entry.ctRatio || ""),
    stationId: String(entry.stationId || ""),
    remark: String(entry.remark || ""),
    source: String(entry.source || "local-fallback"),
    status: String(entry.status || "active"),
    details: sanitizeValue(entry.details || {})
  };
  if (isMemoryDatabase(db)) {
    const existingIndex = db.memoryStore.account_bindings.findIndex((row) =>
      String(row.customerId || "") === normalized.customerId
      && String(row.meterId || "") === normalized.meterId
    );
    const previous = existingIndex === -1 ? null : db.memoryStore.account_bindings[existingIndex];
    const nextRow = {
      ...normalized,
      id: previous?.id || crypto.randomUUID(),
      createdAt: previous?.createdAt || nowIso(),
      updatedAt: nowIso()
    };
    if (existingIndex === -1) db.memoryStore.account_bindings.push(nextRow);
    else db.memoryStore.account_bindings.splice(existingIndex, 1, nextRow);
    return nextRow;
  }
  const timestamp = nowIso();
  const existing = db.prepare(`
    SELECT id, created_at
    FROM account_bindings
    WHERE customer_id = ? AND meter_id = ?
  `).get(normalized.customerId, normalized.meterId);
  const id = existing?.id || crypto.randomUUID();
  db.prepare(`
    INSERT INTO account_bindings (
      id, customer_id, meter_id, tariff_id, ct_ratio, station_id, remark, source, status, detail_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(customer_id, meter_id) DO UPDATE SET
      tariff_id = excluded.tariff_id,
      ct_ratio = excluded.ct_ratio,
      station_id = excluded.station_id,
      remark = excluded.remark,
      source = excluded.source,
      status = excluded.status,
      detail_json = excluded.detail_json,
      updated_at = excluded.updated_at
  `).run(
    id,
    normalized.customerId,
    normalized.meterId,
    normalized.tariffId,
    normalized.ctRatio,
    normalized.stationId,
    normalized.remark,
    normalized.source,
    normalized.status,
    JSON.stringify(normalized.details),
    existing?.created_at || timestamp,
    timestamp
  );
  return {
    ...normalized,
    id,
    createdAt: existing?.created_at || timestamp,
    updatedAt: timestamp
  };
}

function deleteAccountBinding(entry) {
  const db = ensureDatabase();
  const customerId = String(entry.customerId || "");
  const meterId = String(entry.meterId || "");
  if (isMemoryDatabase(db)) {
    const before = db.memoryStore.account_bindings.length;
    db.memoryStore.account_bindings = db.memoryStore.account_bindings.filter((row) =>
      !(String(row.customerId || "") === customerId && String(row.meterId || "") === meterId)
    );
    return before - db.memoryStore.account_bindings.length;
  }
  const result = db.prepare(`
    DELETE FROM account_bindings
    WHERE customer_id = ? AND meter_id = ?
  `).run(customerId, meterId);
  return Number(result.changes || 0);
}

// Rows written by the old silent-fallback path carry status "active" even
// though they never reached upstream. Anything whose source is a fallback or a
// rejection is unsynced by definition, whatever its stored status says.
const unsyncedBindingSources = new Set(["local-fallback", "upstream-rejected"]);

function isPendingBinding(row = {}) {
  return String(row.status || "") === "pending" || unsyncedBindingSources.has(String(row.source || ""));
}

function accountBindingDetails(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function listAccountBindings(options = {}) {
  const db = ensureDatabase();
  const customerId = String(options.customerId || "").trim();
  const meterId = String(options.meterId || "").trim();
  const stationId = String(options.stationId || "").trim().toUpperCase();
  const status = String(options.status || "").trim();
  const searchTerm = String(options.searchTerm || "").trim().toLowerCase();
  const matchesSearch = (row) => !searchTerm || [row.customerId, row.meterId, row.tariffId, row.stationId]
    .some((value) => String(value || "").toLowerCase().includes(searchTerm));
  if (isMemoryDatabase(db)) {
    let rows = db.memoryStore.account_bindings.slice();
    if (customerId) rows = rows.filter((row) => String(row.customerId || "") === customerId);
    if (meterId) rows = rows.filter((row) => String(row.meterId || "") === meterId);
    if (stationId) rows = rows.filter((row) => String(row.stationId || "").toUpperCase() === stationId);
    if (status === "pending") rows = rows.filter(isPendingBinding);
    else if (status) rows = rows.filter((row) => String(row.status || "") === status && !isPendingBinding(row));
    return rows.filter(matchesSearch).map((row) => {
      const details = accountBindingDetails(row.details);
      return {
        customerId: row.customerId,
        meterId: row.meterId,
        tariffId: row.tariffId,
        ctRatio: row.ctRatio,
        stationId: row.stationId,
        remark: row.remark,
        source: row.source,
        status: row.status,
        lastError: String(details.lastError || ""),
        attempts: Number(details.attempts || 0),
        createDate: row.createdAt,
        updateDate: row.updatedAt,
        _localFallback: true
      };
    });
  }
  const clauses = [];
  const params = [];
  if (customerId) {
    clauses.push("customer_id = ?");
    params.push(customerId);
  }
  if (meterId) {
    clauses.push("meter_id = ?");
    params.push(meterId);
  }
  if (stationId) {
    clauses.push("UPPER(station_id) = ?");
    params.push(stationId);
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT customer_id, meter_id, tariff_id, ct_ratio, station_id, remark, source, status, detail_json, created_at, updated_at
    FROM account_bindings
    ${whereClause}
    ORDER BY updated_at DESC
  `).all(...params);
  return rows.map((row) => {
    const details = accountBindingDetails(row.detail_json);
    return {
      customerId: row.customer_id,
      meterId: row.meter_id,
      tariffId: row.tariff_id,
      ctRatio: row.ct_ratio,
      stationId: row.station_id,
      remark: row.remark,
      source: row.source,
      status: row.status,
      lastError: String(details.lastError || ""),
      attempts: Number(details.attempts || 0),
      createDate: row.created_at,
      updateDate: row.updated_at,
      _localFallback: true
    };
  }).filter((row) => {
    if (!matchesSearch(row)) return false;
    if (status === "pending") return isPendingBinding(row);
    if (status) return String(row.status || "") === status && !isPendingBinding(row);
    return true;
  });
}

function tableCounts() {
  const db = ensureDatabase();
  const names = [
    "users",
    "roles",
    "permissions",
    "audit_logs",
    "api_cache",
    "import_jobs",
    "export_jobs",
    "print_jobs",
    "write_confirmations",
    "account_bindings",
    "automation_deliveries",
    "sms_notifications",
    "vendor_organizations",
    "vendor_wallets",
    "wallet_ledger_entries",
    "wallet_holds",
    "wallet_funding_requests",
    "wallet_funding_proofs",
    "wallet_purchase_orders",
    "wallet_purchase_deliveries",
    "wallet_audit_events",
    "vendor_onboarding_submissions",
    "vendor_documents",
    "wallet_approval_requests",
    "wallet_reconciliation_runs",
    "wallet_risk_events"
  ];
  if (isMemoryDatabase(db)) {
    return Object.fromEntries(names.map((name) => [
      name,
      db.memoryStore[name] instanceof Map ? db.memoryStore[name].size : db.memoryStore[name].length
    ]));
  }
  const counts = {};
  for (const name of names) {
    counts[name] = db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get().count;
  }
  return counts;
}

function recordAutomationDelivery(entry) {
  const db = ensureDatabase();
  if (isMemoryDatabase(db)) {
    db.memoryStore.automation_deliveries.push({
      ...entry,
      details: sanitizeValue(entry.details || {})
    });
    return;
  }
  db.prepare(`
    INSERT INTO automation_deliveries (id, incident_id, incident_kind, incident_title, webhook_id, webhook_name, attempt_number, ok, status_code, error_text, detail_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(entry.id || crypto.randomUUID()),
    String(entry.incidentId || ""),
    String(entry.incidentKind || ""),
    String(entry.incidentTitle || ""),
    String(entry.webhookId || ""),
    String(entry.webhookName || ""),
    Math.max(1, Number(entry.attemptNumber || 1)),
    entry.ok ? 1 : 0,
    Number(entry.status || 0),
    String(entry.error || ""),
    JSON.stringify(sanitizeValue(entry.details || {})),
    String(entry.createdAt || nowIso())
  );
}

function listAutomationDeliveries(options = {}) {
  const db = ensureDatabase();
  const limit = Math.max(1, Math.min(Number(options.limit || 50), 200));
  if (isMemoryDatabase(db)) {
    const rows = db.memoryStore.automation_deliveries
      .slice()
      .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
      .slice(0, limit);
    return {
      rows: rows.map((row) => ({
        id: row.id,
        incidentId: row.incidentId,
        incidentKind: row.incidentKind,
        incidentTitle: row.incidentTitle,
        webhookId: row.webhookId,
        webhookName: row.webhookName,
        attemptNumber: Number(row.attemptNumber || 1),
        ok: row.ok === true,
        status: Number(row.status || 0),
        error: String(row.error || ""),
        createdAt: String(row.createdAt || ""),
        details: sanitizeValue(row.details || {})
      })),
      total: db.memoryStore.automation_deliveries.length
    };
  }
  const rows = db.prepare(`
    SELECT id, incident_id, incident_kind, incident_title, webhook_id, webhook_name, attempt_number, ok, status_code, error_text, detail_json, created_at
    FROM automation_deliveries
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
  const total = db.prepare(`SELECT COUNT(*) AS count FROM automation_deliveries`).get().count;
  return {
    rows: rows.map((row) => ({
      id: row.id,
      incidentId: row.incident_id,
      incidentKind: row.incident_kind,
      incidentTitle: row.incident_title,
      webhookId: row.webhook_id,
      webhookName: row.webhook_name,
      attemptNumber: row.attempt_number,
      ok: Boolean(row.ok),
      status: row.status_code,
      error: row.error_text,
      createdAt: row.created_at,
      details: parseJson(row.detail_json, {})
    })),
    total
  };
}

function mapSmsNotificationRow(row = {}) {
  const details = row.details || parseJson(row.detail_json, {});
  return {
    id: row.id,
    messageSid: row.messageSid || row.message_sid,
    to: row.to || row.to_number,
    from: row.from || row.from_number,
    body: row.body,
    status: row.status,
    errorCode: row.errorCode || row.error_code || "",
    errorMessage: row.errorMessage || row.error_message || "",
    reference: row.reference || "",
    callbackUrl: row.callbackUrl || row.callback_url || "",
    details,
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at,
    sentAt: row.sentAt || row.sent_at || null,
    deliveredAt: row.deliveredAt || row.delivered_at || null
  };
}

function recordSmsNotification(entry) {
  const db = ensureDatabase();
  const timestamp = String(entry.createdAt || nowIso());
  const row = {
    id: String(entry.id || crypto.randomUUID()),
    messageSid: String(entry.messageSid || ""),
    to: String(entry.to || ""),
    from: String(entry.from || ""),
    body: String(entry.body || ""),
    status: String(entry.status || "queued"),
    errorCode: String(entry.errorCode || ""),
    errorMessage: String(entry.errorMessage || ""),
    reference: String(entry.reference || ""),
    callbackUrl: String(entry.callbackUrl || ""),
    details: sanitizeValue(entry.details || {}),
    createdAt: timestamp,
    updatedAt: String(entry.updatedAt || timestamp),
    sentAt: entry.sentAt || null,
    deliveredAt: entry.deliveredAt || null
  };
  if (!row.messageSid) throw new Error("messageSid is required");

  if (isMemoryDatabase(db)) {
    const existingIndex = db.memoryStore.sms_notifications.findIndex((item) => item.messageSid === row.messageSid);
    if (existingIndex >= 0) db.memoryStore.sms_notifications[existingIndex] = row;
    else db.memoryStore.sms_notifications.push(row);
    return mapSmsNotificationRow(row);
  }

  db.prepare(`
    INSERT INTO sms_notifications (
      id, message_sid, to_number, from_number, body, status, error_code, error_message,
      reference, callback_url, detail_json, created_at, updated_at, sent_at, delivered_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_sid) DO UPDATE SET
      to_number = excluded.to_number,
      from_number = excluded.from_number,
      body = excluded.body,
      status = excluded.status,
      error_code = excluded.error_code,
      error_message = excluded.error_message,
      reference = excluded.reference,
      callback_url = excluded.callback_url,
      detail_json = excluded.detail_json,
      updated_at = excluded.updated_at,
      sent_at = COALESCE(excluded.sent_at, sms_notifications.sent_at),
      delivered_at = COALESCE(excluded.delivered_at, sms_notifications.delivered_at)
  `).run(
    row.id,
    row.messageSid,
    row.to,
    row.from,
    row.body,
    row.status,
    row.errorCode,
    row.errorMessage,
    row.reference,
    row.callbackUrl,
    JSON.stringify(row.details),
    row.createdAt,
    row.updatedAt,
    row.sentAt,
    row.deliveredAt
  );
  return getSmsNotification(row.messageSid);
}

function updateSmsNotificationStatus(entry) {
  const db = ensureDatabase();
  const messageSid = String(entry.messageSid || "");
  if (!messageSid) throw new Error("messageSid is required");
  const timestamp = String(entry.updatedAt || nowIso());
  const status = String(entry.status || "unknown");
  const terminalDeliveredAt = status === "delivered" ? timestamp : null;
  const sentAt = status === "sent" ? timestamp : null;
  const event = {
    status,
    errorCode: String(entry.errorCode || ""),
    errorMessage: String(entry.errorMessage || ""),
    raw: sanitizeValue(entry.raw || {}),
    receivedAt: timestamp
  };

  if (isMemoryDatabase(db)) {
    let existing = db.memoryStore.sms_notifications.find((item) => item.messageSid === messageSid);
    if (!existing) {
      existing = {
        id: String(entry.id || crypto.randomUUID()),
        messageSid,
        to: String(entry.to || ""),
        from: String(entry.from || ""),
        body: String(entry.body || ""),
        status,
        errorCode: "",
        errorMessage: "",
        reference: String(entry.reference || ""),
        callbackUrl: "",
        details: { events: [] },
        createdAt: timestamp,
        updatedAt: timestamp,
        sentAt: null,
        deliveredAt: null
      };
      db.memoryStore.sms_notifications.push(existing);
    }
    existing.status = status;
    existing.errorCode = event.errorCode;
    existing.errorMessage = event.errorMessage;
    existing.updatedAt = timestamp;
    existing.sentAt = existing.sentAt || sentAt;
    existing.deliveredAt = existing.deliveredAt || terminalDeliveredAt;
    existing.details = sanitizeValue({
      ...(existing.details || {}),
      events: [...((existing.details || {}).events || []), event]
    });
    return mapSmsNotificationRow(existing);
  }

  const current = getSmsNotification(messageSid);
  const details = sanitizeValue({
    ...(current?.details || {}),
    events: [...((current?.details || {}).events || []), event]
  });
  db.prepare(`
    INSERT INTO sms_notifications (
      id, message_sid, to_number, from_number, body, status, error_code, error_message,
      reference, callback_url, detail_json, created_at, updated_at, sent_at, delivered_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_sid) DO UPDATE SET
      status = excluded.status,
      error_code = excluded.error_code,
      error_message = excluded.error_message,
      detail_json = excluded.detail_json,
      updated_at = excluded.updated_at,
      sent_at = COALESCE(sms_notifications.sent_at, excluded.sent_at),
      delivered_at = COALESCE(sms_notifications.delivered_at, excluded.delivered_at)
  `).run(
    current?.id || String(entry.id || crypto.randomUUID()),
    messageSid,
    current?.to || String(entry.to || ""),
    current?.from || String(entry.from || ""),
    current?.body || String(entry.body || ""),
    status,
    event.errorCode,
    event.errorMessage,
    current?.reference || String(entry.reference || ""),
    current?.callbackUrl || "",
    JSON.stringify(details),
    current?.createdAt || timestamp,
    timestamp,
    sentAt,
    terminalDeliveredAt
  );
  return getSmsNotification(messageSid);
}

function getSmsNotification(messageSid) {
  const db = ensureDatabase();
  const sid = String(messageSid || "");
  if (!sid) return null;
  if (isMemoryDatabase(db)) {
    const row = db.memoryStore.sms_notifications.find((item) => item.messageSid === sid);
    return row ? mapSmsNotificationRow(row) : null;
  }
  const row = db.prepare(`
    SELECT id, message_sid, to_number, from_number, body, status, error_code, error_message,
      reference, callback_url, detail_json, created_at, updated_at, sent_at, delivered_at
    FROM sms_notifications
    WHERE message_sid = ?
  `).get(sid);
  return row ? mapSmsNotificationRow(row) : null;
}

function listSmsNotifications(options = {}) {
  const db = ensureDatabase();
  const limit = Math.max(1, Math.min(Number(options.limit || 50), 200));
  const status = String(options.status || "").trim();
  if (isMemoryDatabase(db)) {
    let rows = db.memoryStore.sms_notifications.slice();
    if (status) rows = rows.filter((row) => String(row.status || "") === status);
    rows = rows
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
      .slice(0, limit);
    return { rows: rows.map(mapSmsNotificationRow), total: db.memoryStore.sms_notifications.length };
  }
  const rows = status
    ? db.prepare(`
      SELECT id, message_sid, to_number, from_number, body, status, error_code, error_message,
        reference, callback_url, detail_json, created_at, updated_at, sent_at, delivered_at
      FROM sms_notifications
      WHERE status = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(status, limit)
    : db.prepare(`
      SELECT id, message_sid, to_number, from_number, body, status, error_code, error_message,
        reference, callback_url, detail_json, created_at, updated_at, sent_at, delivered_at
      FROM sms_notifications
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit);
  const total = db.prepare(`SELECT COUNT(*) AS count FROM sms_notifications`).get().count;
  return { rows: rows.map(mapSmsNotificationRow), total };
}

function resetForTests() {
  if (database && typeof database.close === "function") database.close();
  database = null;
  activePath = "";
  memoryStore = null;
}

module.exports = {
  cacheApiResponse,
  databasePath,
  deleteAccountBinding,
  ensureDatabase,
  getMeterTokenOverride,
  getSgcTokenRule,
  getSmsNotification,
  listAccountBindings,
  listAuditLogs,
  listMeterTokenOverrides,
  listSgcTokenRules,
  listImportJobs,
  listAutomationDeliveries,
  listSmsNotifications,
  readCachedApiResponse,
  recordAutomationDelivery,
  recordAuditLog,
  recordExportJob,
  recordImportJob,
  recordPrintJob,
  recordSmsNotification,
  recordWriteConfirmation,
  resetForTests,
  saveAccountBinding,
  setMeterTokenOverride,
  setSgcTokenRule,
  tableCounts,
  updateSmsNotificationStatus,
  writableRoot,
  getOemManufacturer,
  listOemManufacturers,
  upsertOemManufacturer,
  deleteOemManufacturer,
  getOemEndpointConfig,
  listOemEndpointConfigs,
  upsertOemEndpointConfig,
  deleteOemEndpointConfig,
  getOemCredentials,
  upsertOemCredentials,
  listOemStationMappings,
  countOemStationMappings,
  upsertOemStationMapping,
  deleteOemStationMapping
};
