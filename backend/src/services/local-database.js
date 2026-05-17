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

const defaultDatabasePath = path.resolve(__dirname, "..", "..", "data", "reference-crm.sqlite");

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
    wallet_risk_events: []
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
  `);

  seedSecurityTables(database);
  return database;
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

function listAccountBindings(options = {}) {
  const db = ensureDatabase();
  const customerId = String(options.customerId || "").trim();
  const meterId = String(options.meterId || "").trim();
  const stationId = String(options.stationId || "").trim().toUpperCase();
  if (isMemoryDatabase(db)) {
    let rows = db.memoryStore.account_bindings.slice();
    if (customerId) rows = rows.filter((row) => String(row.customerId || "") === customerId);
    if (meterId) rows = rows.filter((row) => String(row.meterId || "") === meterId);
    if (stationId) rows = rows.filter((row) => String(row.stationId || "").toUpperCase() === stationId);
    return rows.map((row) => ({
      customerId: row.customerId,
      meterId: row.meterId,
      tariffId: row.tariffId,
      ctRatio: row.ctRatio,
      stationId: row.stationId,
      remark: row.remark,
      createDate: row.createdAt,
      updateDate: row.updatedAt,
      _localFallback: true
    }));
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
    SELECT customer_id, meter_id, tariff_id, ct_ratio, station_id, remark, created_at, updated_at
    FROM account_bindings
    ${whereClause}
    ORDER BY updated_at DESC
  `).all(...params);
  return rows.map((row) => ({
    customerId: row.customer_id,
    meterId: row.meter_id,
    tariffId: row.tariff_id,
    ctRatio: row.ct_ratio,
    stationId: row.station_id,
    remark: row.remark,
    createDate: row.created_at,
    updateDate: row.updated_at,
    _localFallback: true
  }));
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
  listAccountBindings,
  listImportJobs,
  listAutomationDeliveries,
  readCachedApiResponse,
  recordAutomationDelivery,
  recordAuditLog,
  recordExportJob,
  recordImportJob,
  recordPrintJob,
  recordWriteConfirmation,
  resetForTests,
  saveAccountBinding,
  tableCounts,
  writableRoot
};
