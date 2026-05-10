"use strict";

const crypto = require("crypto");
const supabase = require("./supabase-service");

const snapshotPolicies = [
  { type: "dashboard", match: /^\/api\/dashboard\b/i, seconds: 300, title: "Dashboard" },
  { type: "station-summary", match: /\/station\/read$/i, seconds: 900, title: "Station Summary" },
  { type: "token-record", match: /\/token\/.*record\/read/i, seconds: 900, title: "Token Records" },
  { type: "consumption", match: /DailyData|PrepayReport|Consumption/i, seconds: 3600, title: "Consumption" },
  { type: "customer-risk", match: /\/customer\/read$|\/account\/read$/i, seconds: 3600, title: "Customer Risk Source" },
  { type: "daily-report", match: /DailyDataMeter|LongNonpurchase|LowPurchase/i, seconds: 86400, title: "Daily Report" }
];

function snapshotsEnabled() {
  return process.env.SNAPSHOT_STORE_ENABLED === "true" || process.env.SESSION_STORE_MODE === "supabase";
}

function snapshotPolicy(pathname) {
  const pathText = String(pathname || "");
  return snapshotPolicies.find((policy) => policy.match.test(pathText)) || null;
}

function stableHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function rowCountFromPayload(payload) {
  if (Array.isArray(payload?.result?.data)) return payload.result.data.length;
  if (Array.isArray(payload?.data?.data)) return payload.data.data.length;
  if (Array.isArray(payload?.result)) return payload.result.length;
  if (Array.isArray(payload?.data)) return payload.data.length;
  return 0;
}

function totalFromPayload(payload) {
  const values = [
    payload?.result?.total,
    payload?.data?.total,
    payload?.total,
    rowCountFromPayload(payload)
  ];
  const found = values.find((value) => Number.isFinite(Number(value)));
  return Number(found || 0);
}

function snapshotSummary(payload) {
  return {
    code: payload?.code ?? null,
    reason: payload?.reason || payload?.msg || "",
    proxySource: payload?._proxy?.source || "",
    rows: rowCountFromPayload(payload),
    total: totalFromPayload(payload)
  };
}

function scopeFromPayload(payload) {
  const source = Array.isArray(payload) ? payload[0] || {} : payload || {};
  return source.stationId || source.SITE_ID || source.siteId || source.customerId || source.meterId || "global";
}

async function writeSnapshot({ pathname, requestKey, requestPayload, responsePayload }) {
  if (!snapshotsEnabled() || !supabase.serviceConfigured()) return null;
  const policy = snapshotPolicy(pathname);
  if (!policy || !responsePayload || responsePayload.code >= 400) return null;

  const scopeKey = String(scopeFromPayload(requestPayload));
  const snapshotKey = stableHash(`${policy.type}:${pathname}:${requestKey}`);
  const capturedAt = new Date();
  const expiresAt = new Date(capturedAt.getTime() + policy.seconds * 1000);

  return supabase.restRequest("/operational_snapshots?on_conflict=snapshot_key,scope_key", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      snapshot_key: snapshotKey,
      snapshot_type: policy.type,
      scope_key: scopeKey,
      title: policy.title,
      source_path: pathname,
      request_key: requestKey,
      payload_json: responsePayload,
      summary_json: snapshotSummary(responsePayload),
      row_count: rowCountFromPayload(responsePayload),
      freshness_seconds: policy.seconds,
      captured_at: capturedAt.toISOString(),
      expires_at: expiresAt.toISOString()
    }
  });
}

async function readSnapshot({ type = "", scope = "global", limit = 20 } = {}) {
  if (!snapshotsEnabled() || !supabase.serviceConfigured()) return { rows: [], total: 0 };
  const filters = [
    "select=id,snapshot_key,snapshot_type,scope_key,title,source_path,summary_json,row_count,captured_at,expires_at",
    "order=captured_at.desc",
    `limit=${Math.max(1, Math.min(Number(limit || 20), 100))}`
  ];
  if (type) filters.push(`snapshot_type=eq.${encodeURIComponent(type)}`);
  if (scope) filters.push(`scope_key=eq.${encodeURIComponent(scope)}`);
  const rows = await supabase.restRequest(`/operational_snapshots?${filters.join("&")}`);
  return {
    rows: Array.isArray(rows) ? rows : [],
    total: Array.isArray(rows) ? rows.length : 0
  };
}

function snapshotSchedule() {
  return snapshotPolicies.map((policy) => ({
    type: policy.type,
    freshnessSeconds: policy.seconds,
    cadence: policy.seconds < 3600 ? `${Math.round(policy.seconds / 60)} minutes` : `${Math.round(policy.seconds / 3600)} hour(s)`,
    title: policy.title
  }));
}

module.exports = {
  readSnapshot,
  snapshotPolicy,
  snapshotSchedule,
  snapshotsEnabled,
  writeSnapshot
};
