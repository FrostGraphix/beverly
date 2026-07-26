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
  "automation_deliveries",
  "sms_notifications"
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

function uuidOrNull(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function mapAuditRow(entry = {}) {
  const method = String(entry.method || "GET").toUpperCase();
  const path = String(entry.path || "/");
  const normalizedPath = path.toLowerCase();
  const action = normalizedPath.includes("login") ? "login"
    : normalizedPath.includes("logout") ? "logout"
      : normalizedPath.includes("import") ? "import"
        : normalizedPath.includes("export") ? "export"
          : normalizedPath.includes("remote") ? "remote_command"
            : method === "DELETE" ? "delete"
              : ["PUT", "PATCH"].includes(method) ? "update"
                : method === "POST" ? "create"
                  : "download";
  const details = sanitizeValue({
    ...(entry.details || {}),
    method,
    outcome: String(entry.outcome || "success"),
    statusCode: Number(entry.statusCode || 200),
    proxySource: String(entry.proxySource || "unknown")
  });
  return {
    user_id: uuidOrNull(entry.userId),
    action,
    resource: path,
    resource_id: entry.resourceId || null,
    detail: details,
    source: String(entry.proxySource || "unknown"),
    request_id: uuidOrNull(entry.requestId),
    metadata: details
  };
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
      body: mapAuditRow(entry)
    })
  );
}

async function listAuditLogs(options = {}) {
  return runWithFallback(
    () => localDatabase.listAuditLogs(options),
    async () => {
      const limit = Math.max(1, Math.min(Number(options.limit || 100), 500));
      const proxySource = String(options.proxySource || "");
      const sourceFilter = proxySource ? `&source=eq.${encodeURIComponent(proxySource)}` : "";
      const rows = await supabase.restRequest(`/audit_logs?select=*${sourceFilter}&order=created_at.desc&limit=${limit}`);
      return (Array.isArray(rows) ? rows : []).map((row) => {
        const details = row.detail_json || row.detail || row.metadata || {};
        return {
          id: row.id || null,
          method: String(row.method || details.method || "GET").toUpperCase(),
          path: String(row.path || row.resource || "/"),
          outcome: String(row.outcome || details.outcome || "success"),
          statusCode: Number(row.status_code || details.statusCode || 200),
          proxySource: String(row.proxy_source || row.source || details.proxySource || "unknown"),
          details,
          createdAt: row.created_at || null
        };
      });
    }
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

// Meter token-format (STS S1/S2) overrides — persisted to Supabase in production,
// local SQLite otherwise (same fallback model as account bindings).
function mapOverrideRow(row) {
  if (!row) return null;
  return {
    meterId: row.meter_id,
    isS2: row.is_s2 === true || row.is_s2 === 1,
    note: row.note || "",
    updatedBy: row.updated_by || "",
    updatedAt: row.updated_at
  };
}

async function getMeterTokenOverride(meterId) {
  return runWithFallback(
    () => localDatabase.getMeterTokenOverride(meterId),
    async () => {
      const id = encodeURIComponent(String(meterId || ""));
      const rows = await supabase.restRequest(`/meter_token_overrides?meter_id=eq.${id}&select=meter_id,is_s2,note,updated_by,updated_at&limit=1`);
      return mapOverrideRow(Array.isArray(rows) ? rows[0] : rows);
    }
  );
}

async function setMeterTokenOverride(entry = {}) {
  const meterId = String(entry.meterId || "").trim();
  const clear = entry.isS2 === null || entry.isS2 === undefined || entry.isS2 === "auto";
  return runWithFallback(
    () => localDatabase.setMeterTokenOverride(entry),
    async () => {
      if (clear) {
        await supabase.restRequest(`/meter_token_overrides?meter_id=eq.${encodeURIComponent(meterId)}`, {
          method: "DELETE",
          prefer: "return=minimal"
        });
        return { meterId, cleared: true };
      }
      const isS2 = entry.isS2 === true || entry.isS2 === 1 || entry.isS2 === "true" || entry.isS2 === "1";
      const rows = await supabase.restRequest("/meter_token_overrides?on_conflict=meter_id", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body: {
          meter_id: meterId,
          is_s2: isS2,
          note: String(entry.note || ""),
          updated_by: String(entry.updatedBy || ""),
          updated_at: nowIso()
        }
      });
      return mapOverrideRow(Array.isArray(rows) ? rows[0] : rows);
    }
  );
}

async function listMeterTokenOverrides() {
  return runWithFallback(
    () => localDatabase.listMeterTokenOverrides(),
    async () => {
      const rows = await supabase.restRequest("/meter_token_overrides?select=meter_id,is_s2,note,updated_by,updated_at&order=updated_at.desc");
      return (Array.isArray(rows) ? rows : []).map(mapOverrideRow);
    }
  );
}

// SGC-level rules — one row classifies a whole supply group.
function mapSgcRuleRow(row) {
  if (!row) return null;
  return {
    sgc: row.sgc,
    isS2: row.is_s2 === true || row.is_s2 === 1,
    note: row.note || "",
    updatedBy: row.updated_by || "",
    updatedAt: row.updated_at
  };
}

async function getSgcTokenRule(sgc) {
  return runWithFallback(
    () => localDatabase.getSgcTokenRule(sgc),
    async () => {
      const id = encodeURIComponent(String(sgc || ""));
      const rows = await supabase.restRequest(`/sgc_token_rules?sgc=eq.${id}&select=sgc,is_s2,note,updated_by,updated_at&limit=1`);
      return mapSgcRuleRow(Array.isArray(rows) ? rows[0] : rows);
    }
  );
}

async function setSgcTokenRule(entry = {}) {
  const sgc = String(entry.sgc || "").trim();
  const clear = entry.isS2 === null || entry.isS2 === undefined || entry.isS2 === "auto";
  return runWithFallback(
    () => localDatabase.setSgcTokenRule(entry),
    async () => {
      if (clear) {
        await supabase.restRequest(`/sgc_token_rules?sgc=eq.${encodeURIComponent(sgc)}`, { method: "DELETE", prefer: "return=minimal" });
        return { sgc, cleared: true };
      }
      const isS2 = entry.isS2 === true || entry.isS2 === 1 || entry.isS2 === "true" || entry.isS2 === "1";
      const rows = await supabase.restRequest("/sgc_token_rules?on_conflict=sgc", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body: {
          sgc,
          is_s2: isS2,
          note: String(entry.note || ""),
          updated_by: String(entry.updatedBy || ""),
          updated_at: nowIso()
        }
      });
      return mapSgcRuleRow(Array.isArray(rows) ? rows[0] : rows);
    }
  );
}

async function listSgcTokenRules() {
  return runWithFallback(
    () => localDatabase.listSgcTokenRules(),
    async () => {
      const rows = await supabase.restRequest("/sgc_token_rules?select=sgc,is_s2,note,updated_by,updated_at&order=updated_at.desc");
      return (Array.isArray(rows) ? rows : []).map(mapSgcRuleRow);
    }
  );
}

// ── OEM manufacturer registry ───────────────────────────────────────────────
// Top-level tenant entity for the multi-OEM proxy. Supabase column is `capabilities`
// (jsonb); the local SQLite mirror stores the same shape as `capabilities_json` text.
function mapOemManufacturerRow(row) {
  if (!row) return null;
  let capabilities = row.capabilities ?? row.capabilities_json ?? {};
  if (typeof capabilities === "string") {
    try {
      capabilities = JSON.parse(capabilities);
    } catch {
      capabilities = {};
    }
  }
  const isSeedDefault = row.is_seed_default === true || row.is_seed_default === 1 || row.slug === "calinmeter";
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

async function getOemManufacturer(idOrSlug) {
  return runWithFallback(
    () => localDatabase.getOemManufacturer(idOrSlug),
    async () => {
      const key = encodeURIComponent(String(idOrSlug || ""));
      const rows = await supabase.restRequest(`/oem_manufacturers?or=(id.eq.${key},slug.eq.${key})&limit=1`);
      return mapOemManufacturerRow(Array.isArray(rows) ? rows[0] : rows);
    }
  );
}

async function listOemManufacturers() {
  return runWithFallback(
    () => localDatabase.listOemManufacturers(),
    async () => {
      const rows = await supabase.restRequest("/oem_manufacturers?select=*&order=created_at.asc");
      return (Array.isArray(rows) ? rows : []).map(mapOemManufacturerRow);
    }
  );
}

async function upsertOemManufacturer(entry = {}) {
  return runWithFallback(
    () => localDatabase.upsertOemManufacturer(entry),
    async () => {
      const slug = String(entry.slug || "").trim().toLowerCase();
      const body = {
        slug,
        display_name: String(entry.displayName || slug),
        logo_storage_path: String(entry.logoStoragePath || ""),
        status: String(entry.status || "draft"),
        is_seed_default: Boolean(entry.isSeedDefault),
        capabilities: entry.capabilities && typeof entry.capabilities === "object" ? entry.capabilities : {},
        vending_strategy: String(entry.vendingStrategy || "sts_token"),
        rate_limit_window_ms: entry.rateLimitWindowMs != null ? Number(entry.rateLimitWindowMs) : null,
        rate_limit_max_requests: entry.rateLimitMaxRequests != null ? Number(entry.rateLimitMaxRequests) : null,
        updated_at: nowIso()
      };
      const rows = await supabase.restRequest("/oem_manufacturers?on_conflict=slug", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body
      });
      return mapOemManufacturerRow(Array.isArray(rows) ? rows[0] : rows);
    }
  );
}

async function deleteOemManufacturer(idOrSlug) {
  return runWithFallback(
    () => localDatabase.deleteOemManufacturer(idOrSlug),
    async () => {
      const key = encodeURIComponent(String(idOrSlug || ""));
      await supabase.restRequest(`/oem_manufacturers?or=(id.eq.${key},slug.eq.${key})`, { method: "DELETE", prefer: "return=minimal" });
      return { deleted: true };
    }
  );
}

// ── OEM endpoint configuration ──────────────────────────────────────────────
// One row per (oemId, logicalKey) — the declarative path/method/casing/field-map
// a new manufacturer needs instead of hardcoded per-OEM proxy branches.
function mapOemEndpointConfigRow(row) {
  if (!row) return null;
  const parseMaybeJson = (value) => {
    if (value && typeof value === "object") return value;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    }
    return {};
  };
  return {
    oemId: row.oem_id,
    logicalKey: row.logical_key,
    upstreamPath: row.upstream_path,
    method: row.method,
    casingVariant: row.casing_variant || "",
    requestFieldMap: parseMaybeJson(row.request_field_map),
    responseFieldMap: parseMaybeJson(row.response_field_map),
    payloadShape: parseMaybeJson(row.payload_shape),
    paginationStyle: row.pagination_style || "none",
    requiresLiveRead: row.requires_live_read === true || row.requires_live_read === 1,
    isWriteOverride: row.is_write_override === null || row.is_write_override === undefined ? null : (row.is_write_override === true || row.is_write_override === 1),
    adapterFnName: row.adapter_fn_name || "",
    enabled: row.enabled === true || row.enabled === 1,
    updatedAt: row.updated_at
  };
}

async function getOemEndpointConfig(oemId, logicalKey) {
  return runWithFallback(
    () => localDatabase.getOemEndpointConfig(oemId, logicalKey),
    async () => {
      const rows = await supabase.restRequest(
        `/oem_endpoint_configs?oem_id=eq.${encodeURIComponent(oemId)}&logical_key=eq.${encodeURIComponent(logicalKey)}&limit=1`
      );
      return mapOemEndpointConfigRow(Array.isArray(rows) ? rows[0] : rows);
    }
  );
}

async function listOemEndpointConfigs(oemId) {
  return runWithFallback(
    () => localDatabase.listOemEndpointConfigs(oemId),
    async () => {
      const rows = await supabase.restRequest(`/oem_endpoint_configs?oem_id=eq.${encodeURIComponent(oemId)}&order=logical_key.asc`);
      return (Array.isArray(rows) ? rows : []).map(mapOemEndpointConfigRow);
    }
  );
}

async function upsertOemEndpointConfig(entry = {}) {
  return runWithFallback(
    () => localDatabase.upsertOemEndpointConfig(entry),
    async () => {
      const body = {
        oem_id: String(entry.oemId || ""),
        logical_key: String(entry.logicalKey || ""),
        upstream_path: String(entry.upstreamPath || ""),
        method: String(entry.method || "GET").toUpperCase(),
        casing_variant: String(entry.casingVariant || ""),
        request_field_map: entry.requestFieldMap && typeof entry.requestFieldMap === "object" ? entry.requestFieldMap : {},
        response_field_map: entry.responseFieldMap && typeof entry.responseFieldMap === "object" ? entry.responseFieldMap : {},
        payload_shape: entry.payloadShape && typeof entry.payloadShape === "object" ? entry.payloadShape : {},
        pagination_style: String(entry.paginationStyle || "none"),
        requires_live_read: Boolean(entry.requiresLiveRead),
        is_write_override: entry.isWriteOverride === null || entry.isWriteOverride === undefined ? null : Boolean(entry.isWriteOverride),
        adapter_fn_name: String(entry.adapterFnName || ""),
        enabled: entry.enabled !== false,
        updated_at: nowIso()
      };
      const rows = await supabase.restRequest("/oem_endpoint_configs?on_conflict=oem_id,logical_key", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body
      });
      return mapOemEndpointConfigRow(Array.isArray(rows) ? rows[0] : rows);
    }
  );
}

async function deleteOemEndpointConfig(oemId, logicalKey) {
  return runWithFallback(
    () => localDatabase.deleteOemEndpointConfig(oemId, logicalKey),
    async () => {
      await supabase.restRequest(
        `/oem_endpoint_configs?oem_id=eq.${encodeURIComponent(oemId)}&logical_key=eq.${encodeURIComponent(logicalKey)}`,
        { method: "DELETE", prefer: "return=minimal" }
      );
      return { deleted: true };
    }
  );
}

// ── OEM credentials ──────────────────────────────────────────────────────────
// Values here are already AES-256-GCM encrypted by the caller (see
// oem-credential-crypto.js) — this layer only persists/retrieves ciphertext.
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

async function getOemCredentials(oemId) {
  return runWithFallback(
    () => localDatabase.getOemCredentials(oemId),
    async () => {
      const rows = await supabase.restRequest(`/oem_credentials?oem_id=eq.${encodeURIComponent(oemId)}&limit=1`);
      return mapOemCredentialsRow(Array.isArray(rows) ? rows[0] : rows);
    }
  );
}

async function upsertOemCredentials(entry = {}) {
  return runWithFallback(
    () => localDatabase.upsertOemCredentials(entry),
    async () => {
      const body = {
        oem_id: String(entry.oemId || ""),
        auth_strategy: String(entry.authStrategy || "bearer_static"),
        base_url: String(entry.baseUrl || ""),
        encrypted_bearer_token: String(entry.encryptedBearerToken || ""),
        encrypted_client_secret: String(entry.encryptedClientSecret || ""),
        encrypted_username: String(entry.encryptedUsername || ""),
        encrypted_password: String(entry.encryptedPassword || ""),
        token_endpoint_path: String(entry.tokenEndpointPath || ""),
        api_key_header_name: String(entry.apiKeyHeaderName || ""),
        encryption_key_version: Number(entry.encryptionKeyVersion || 1),
        updated_at: nowIso(),
        updated_by: String(entry.updatedBy || "")
      };
      const rows = await supabase.restRequest("/oem_credentials?on_conflict=oem_id", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body
      });
      return mapOemCredentialsRow(Array.isArray(rows) ? rows[0] : rows);
    }
  );
}

// ── OEM station/community mappings — drives each card's install count ──────
function mapOemStationMappingRow(row) {
  if (!row) return null;
  return {
    oemId: row.oem_id,
    stationId: row.station_id,
    communityLabel: row.community_label || "",
    createdAt: row.created_at
  };
}

async function listOemStationMappings(oemId, oemSlug = "") {
  const rows = await runWithFallback(
    () => localDatabase.listOemStationMappings(oemId),
    async () => {
      const result = await supabase.restRequest(`/oem_station_mappings?oem_id=eq.${encodeURIComponent(oemId)}&order=station_id.asc`);
      return (Array.isArray(result) ? result : []).map(mapOemStationMappingRow);
    }
  );
  if (Array.isArray(rows) && rows.length > 0) return rows;

  const key = (String(oemId || "") + " " + String(oemSlug || "")).toLowerCase();
  if (key.includes("calin") || key.includes("b0e00000")) {
    try {
      const stations = await supabase.restRequest(`/stations?select=id,name,remark&order=id.asc`);
      if (Array.isArray(stations) && stations.length > 0) {
        return stations.map((st) => ({
          oemId: String(oemId || ""),
          stationId: String(st.id || st.name || ""),
          communityLabel: String(st.name || st.remark || st.id || "")
        }));
      }
    } catch {
      // ignore
    }
  }
  return rows || [];
}

async function countOemStationMappings(oemId, oemSlug = "") {
  const count = await runWithFallback(
    () => localDatabase.countOemStationMappings(oemId),
    async () => {
      const result = await supabase.restRequestWithResponse(`/oem_station_mappings?oem_id=eq.${encodeURIComponent(oemId)}&select=station_id`, {
        headers: { Prefer: "count=exact", Range: "0-0" }
      });
      const contentRange = String(result.response.headers.get("content-range") || "");
      const total = Number(contentRange.split("/")[1]);
      return Number.isFinite(total) ? total : (Array.isArray(result.body) ? result.body.length : 0);
    }
  );
  if (count > 0) return count;
  const key = (String(oemId || "") + " " + String(oemSlug || "")).toLowerCase();
  if (key.includes("calin") || key.includes("b0e00000")) {
    try {
      const stationRes = await supabase.restRequestWithResponse(`/stations?select=id`, {
        headers: { Prefer: "count=exact", Range: "0-0" }
      });
      const cr = String(stationRes?.response?.headers?.get("content-range") || "");
      const stationTotal = Number(cr.split("/")[1]);
      if (Number.isFinite(stationTotal) && stationTotal > 0) return stationTotal;
    } catch {
      // ignore
    }
  }
  return count;
}

async function upsertOemStationMapping(entry = {}) {
  return runWithFallback(
    () => localDatabase.upsertOemStationMapping(entry),
    async () => {
      const body = {
        oem_id: String(entry.oemId || ""),
        station_id: String(entry.stationId || ""),
        community_label: String(entry.communityLabel || ""),
        created_at: nowIso()
      };
      const rows = await supabase.restRequest("/oem_station_mappings?on_conflict=oem_id,station_id", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body
      });
      return mapOemStationMappingRow(Array.isArray(rows) ? rows[0] : rows);
    }
  );
}

async function deleteOemStationMapping(oemId, stationId) {
  return runWithFallback(
    () => localDatabase.deleteOemStationMapping(oemId, stationId),
    async () => {
      await supabase.restRequest(
        `/oem_station_mappings?oem_id=eq.${encodeURIComponent(oemId)}&station_id=eq.${encodeURIComponent(stationId)}`,
        { method: "DELETE", prefer: "return=minimal" }
      );
      return { deleted: true };
    }
  );
}

module.exports = {
  cacheApiResponse,
  ensureDatabase,
  getMeterTokenOverride,
  setMeterTokenOverride,
  listMeterTokenOverrides,
  getSgcTokenRule,
  setSgcTokenRule,
  listSgcTokenRules,
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
  deleteOemStationMapping,
  mapAuditRow,
  listAutomationDeliveries,
  listAccountBindings,
  listAuditLogs,
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
