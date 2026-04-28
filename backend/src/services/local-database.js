"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const defaultDatabasePath = path.resolve(__dirname, "..", "..", "data", "reference-crm.sqlite");

let database = null;
let activePath = "";

function nowIso() {
  return new Date().toISOString();
}

function databasePath() {
  return process.env.LOCAL_DB_PATH ? path.resolve(process.env.LOCAL_DB_PATH) : defaultDatabasePath;
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
  `);

  seedSecurityTables(database);
  return database;
}

function cacheApiResponse(entry) {
  const db = ensureDatabase();
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

function recordExportJob(entry) {
  const db = ensureDatabase();
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
    "write_confirmations"
  ];
  const counts = {};
  for (const name of names) {
    counts[name] = db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get().count;
  }
  return counts;
}

function resetForTests() {
  if (database && typeof database.close === "function") database.close();
  database = null;
  activePath = "";
}

module.exports = {
  cacheApiResponse,
  databasePath,
  ensureDatabase,
  readCachedApiResponse,
  recordAuditLog,
  recordExportJob,
  recordImportJob,
  recordPrintJob,
  recordWriteConfirmation,
  resetForTests,
  tableCounts
};
