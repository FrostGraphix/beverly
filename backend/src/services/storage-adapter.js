"use strict";

const crypto = require("crypto");
const localDatabase = require("./local-database");
const supabase = require("./supabase-service");

const tableNames = [
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
  "automation_deliveries"
];

function slugPart(value, fallback = "artifact") {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function useSupabase() {
  return process.env.SESSION_STORE_MODE === "supabase" && supabase.serviceConfigured();
}

function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (!value || typeof value !== "object") return value;
  const sanitized = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "authorizationPassword") continue;
    sanitized[key] = sanitizeValue(entry);
  }
  return sanitized;
}

function nowIso() {
  return new Date().toISOString();
}

function stableId(prefix) {
  return crypto.createHash("sha256").update(prefix).digest("hex");
}

async function saveArtifact({ bucket, routeHash, filename, content, contentType }) {
  return runWithFallback(
    () => null,
    async () => {
      const day = new Date().toISOString().slice(0, 10);
      const hash = stableId(`${routeHash || ""}:${filename || ""}:${Date.now()}`).slice(0, 12);
      const objectPath = `${day}/${slugPart(routeHash, "route")}/${hash}-${slugPart(filename, "artifact")}`;
      return supabase.uploadStorageObject(bucket, objectPath, content, contentType);
    }
  );
}

function countFromRange(value) {
  const match = String(value || "").match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function mapAccountBindingRow(row = {}) {
  return {
    customerId: row.customer_id,
    meterId: row.meter_id,
    tariffId: row.tariff_id,
    ctRatio: row.ct_ratio,
    stationId: row.station_id,
    remark: row.remark,
    createDate: row.created_at,
    updateDate: row.updated_at,
    _supabase: true
  };
}

async function runWithFallback(localAction, remoteAction) {
  if (!useSupabase()) return localAction();
  try {
    return await remoteAction();
  } catch (error) {
    console.error("[supabase-storage]", error instanceof Error ? error.message : String(error));
    return localAction();
  }
}

function ensureDatabase() {
  return localDatabase.ensureDatabase();
}

async function cacheApiResponse(entry) {
  return runWithFallback(
    () => localDatabase.cacheApiResponse(entry),
    () => supabase.restRequest("/api_cache?on_conflict=method,path,request_key", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: {
        id: crypto.randomUUID(),
        method: String(entry.method || "GET").toUpperCase(),
        path: String(entry.path || "/"),
        request_key: String(entry.requestKey || ""),
        status_code: Number(entry.status || 200),
        response_json: sanitizeValue(entry.body || {}),
        source: String(entry.source || "unknown"),
        updated_at: nowIso()
      }
    })
  );
}

async function readCachedApiResponse(entry) {
  return runWithFallback(
    () => localDatabase.readCachedApiResponse(entry),
    async () => {
      const method = encodeURIComponent(String(entry.method || "GET").toUpperCase());
      const path = encodeURIComponent(String(entry.path || "/"));
      const requestKey = encodeURIComponent(String(entry.requestKey || ""));
      const rows = await supabase.restRequest(`/api_cache?method=eq.${method}&path=eq.${path}&request_key=eq.${requestKey}&select=status_code,response_json,source&limit=1`);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return null;
      return {
        status: row.status_code,
        source: row.source,
        body: row.response_json || {}
      };
    }
  );
}

async function recordAuditLog(entry) {
  return runWithFallback(
    () => localDatabase.recordAuditLog(entry),
    () => supabase.restRequest("/audit_logs", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        method: String(entry.method || "GET").toUpperCase(),
        path: String(entry.path || "/"),
        outcome: String(entry.outcome || "success"),
        status_code: Number(entry.statusCode || 200),
        proxy_source: String(entry.proxySource || "unknown"),
        detail_json: sanitizeValue(entry.details || {}),
        user_id: entry.userId || null,
        request_id: entry.requestId || null
      }
    })
  );
}

async function recordImportJob(entry) {
  return runWithFallback(
    () => localDatabase.recordImportJob(entry),
    () => supabase.restRequest("/import_jobs", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        route_hash: String(entry.routeHash || ""),
        file_name: String(entry.fileName || "unknown"),
        row_count: Number(entry.rowCount || 0),
        status: String(entry.status || "submitted"),
        detail_json: sanitizeValue(entry.details || {}),
        storage_bucket: entry.storageBucket || null,
        storage_path: entry.storagePath || null
      }
    })
  );
}

async function listImportJobs(options = {}) {
  return runWithFallback(
    () => localDatabase.listImportJobs(options),
    async () => {
      const limit = Math.max(1, Math.min(Number(options.pageSize || options.limit || 500), 1000));
      const offset = Math.max(0, Number(options.offset || 0));
      const routeHash = String(options.routeHash || "");
      const routeFilter = routeHash ? `&route_hash=eq.${encodeURIComponent(routeHash)}` : "";
      const rangeEnd = offset + limit - 1;
      const rows = await supabase.restRequest(`/import_jobs?select=id,route_hash,file_name,row_count,status,detail_json,created_at,updated_at${routeFilter}&order=created_at.desc`, {
        headers: {
          Range: `${offset}-${rangeEnd}`
        }
      });
      return {
        rows: (Array.isArray(rows) ? rows : []).map((row) => {
          const details = row.detail_json || {};
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
        total: Array.isArray(rows) ? rows.length : 0
      };
    }
  );
}

async function recordExportJob(entry) {
  return runWithFallback(
    () => localDatabase.recordExportJob(entry),
    () => supabase.restRequest("/export_jobs", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        route_hash: String(entry.routeHash || ""),
        row_count: Number(entry.rowCount || 0),
        format: String(entry.format || "csv"),
        status: String(entry.status || "completed"),
        detail_json: sanitizeValue(entry.details || {}),
        storage_bucket: entry.storageBucket || null,
        storage_path: entry.storagePath || null
      }
    })
  );
}

async function recordPrintJob(entry) {
  return runWithFallback(
    () => localDatabase.recordPrintJob(entry),
    () => supabase.restRequest("/print_jobs", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        route_hash: String(entry.routeHash || ""),
        receipt_type: String(entry.receiptType || "credit"),
        status: String(entry.status || "completed"),
        detail_json: sanitizeValue(entry.details || {}),
        storage_bucket: entry.storageBucket || null,
        storage_path: entry.storagePath || null
      }
    })
  );
}

async function recordWriteConfirmation(entry) {
  return runWithFallback(
    () => localDatabase.recordWriteConfirmation(entry),
    () => supabase.restRequest("/write_confirmations", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        endpoint: String(entry.endpoint || ""),
        action: String(entry.action || ""),
        confirmation_text: String(entry.confirmationText || ""),
        authorization_provided: Boolean(entry.authorizationProvided),
        status: String(entry.status || "submitted"),
        detail_json: sanitizeValue(entry.details || {})
      }
    })
  );
}

async function saveAccountBinding(entry) {
  return runWithFallback(
    () => localDatabase.saveAccountBinding(entry),
    async () => {
      const rows = await supabase.restRequest("/account_bindings?on_conflict=customer_id,meter_id", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body: {
          id: crypto.randomUUID(),
          customer_id: String(entry.customerId || ""),
          meter_id: String(entry.meterId || ""),
          tariff_id: String(entry.tariffId || ""),
          ct_ratio: String(entry.ctRatio || ""),
          station_id: String(entry.stationId || ""),
          remark: String(entry.remark || ""),
          source: String(entry.source || "supabase"),
          status: String(entry.status || "active"),
          detail_json: sanitizeValue(entry.details || {})
        }
      });
      return mapAccountBindingRow(Array.isArray(rows) ? rows[0] : rows);
    }
  );
}

async function deleteAccountBinding(entry) {
  const customerId = encodeURIComponent(String(entry.customerId || ""));
  const meterId = encodeURIComponent(String(entry.meterId || ""));
  return runWithFallback(
    () => localDatabase.deleteAccountBinding(entry),
    async () => {
      await supabase.restRequest(`/account_bindings?customer_id=eq.${customerId}&meter_id=eq.${meterId}`, {
        method: "DELETE",
        prefer: "return=minimal"
      });
      return 1;
    }
  );
}

async function listAccountBindings(options = {}) {
  return runWithFallback(
    () => localDatabase.listAccountBindings(options),
    async () => {
      const filters = [
        "select=customer_id,meter_id,tariff_id,ct_ratio,station_id,remark,created_at,updated_at"
      ];
      if (options.customerId) filters.push(`customer_id=eq.${encodeURIComponent(String(options.customerId))}`);
      if (options.meterId) filters.push(`meter_id=eq.${encodeURIComponent(String(options.meterId))}`);
      if (options.stationId) filters.push(`station_id=eq.${encodeURIComponent(String(options.stationId).toUpperCase())}`);
      filters.push("order=updated_at.desc");
      const rows = await supabase.restRequest(`/account_bindings?${filters.join("&")}`);
      return (Array.isArray(rows) ? rows : []).map(mapAccountBindingRow);
    }
  );
}

async function recordAutomationDelivery(entry) {
  return runWithFallback(
    () => localDatabase.recordAutomationDelivery(entry),
    () => supabase.restRequest("/automation_deliveries", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        id: String(entry.id || crypto.randomUUID()),
        incident_id: String(entry.incidentId || ""),
        incident_kind: String(entry.incidentKind || ""),
        incident_title: String(entry.incidentTitle || ""),
        webhook_id: String(entry.webhookId || ""),
        webhook_name: String(entry.webhookName || ""),
        attempt_number: Math.max(1, Number(entry.attemptNumber || 1)),
        ok: Boolean(entry.ok),
        status_code: Number(entry.status || 0),
        error_text: String(entry.error || ""),
        detail_json: sanitizeValue(entry.details || {}),
        created_at: String(entry.createdAt || nowIso())
      }
    })
  );
}

async function listAutomationDeliveries(options = {}) {
  return runWithFallback(
    () => localDatabase.listAutomationDeliveries(options),
    async () => {
      const limit = Math.max(1, Math.min(Number(options.limit || 50), 200));
      const rows = await supabase.restRequest(`/automation_deliveries?select=id,incident_id,incident_kind,incident_title,webhook_id,webhook_name,attempt_number,ok,status_code,error_text,detail_json,created_at&order=created_at.desc&limit=${limit}`);
      return {
        rows: (Array.isArray(rows) ? rows : []).map((row) => ({
          id: row.id,
          incidentId: row.incident_id,
          incidentKind: row.incident_kind,
          incidentTitle: row.incident_title,
          webhookId: row.webhook_id,
          webhookName: row.webhook_name,
          attemptNumber: Number(row.attempt_number || 1),
          ok: row.ok === true,
          status: Number(row.status_code || 0),
          error: String(row.error_text || ""),
          createdAt: String(row.created_at || ""),
          details: sanitizeValue(row.detail_json || {})
        })),
        total: Array.isArray(rows) ? rows.length : 0
      };
    }
  );
}

async function tableCounts() {
  return runWithFallback(
    () => localDatabase.tableCounts(),
    async () => {
      const counts = {};
      for (const name of tableNames) {
        const { response } = await supabase.restRequestWithResponse(`/${name}?select=id&limit=1`, {
          headers: {
            Prefer: "count=exact"
          }
        });
        counts[name] = countFromRange(response.headers.get("content-range"));
      }
      return counts;
    }
  );
}

module.exports = {
  cacheApiResponse,
  ensureDatabase,
  listAutomationDeliveries,
  listAccountBindings,
  listImportJobs,
  readCachedApiResponse,
  deleteAccountBinding,
  recordAutomationDelivery,
  recordAuditLog,
  recordExportJob,
  recordImportJob,
  recordPrintJob,
  recordWriteConfirmation,
  saveAccountBinding,
  stableId,
  saveArtifact,
  tableCounts,
  useSupabase
};
