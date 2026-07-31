import { postApi } from "./api.js";

const pendingReadPath = "/api/local/accountBindings/read";
const pendingRetryPath = "/api/local/accountBindings/retry";
const pendingDiscardPath = "/api/local/accountBindings/discard";

function collectionRows(response) {
  const payload = response?.result || response?.data || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function normalizeBinding(row = {}) {
  return {
    customerId: String(row.customerId || ""),
    meterId: String(row.meterId || ""),
    tariffId: String(row.tariffId || ""),
    ctRatio: String(row.ctRatio || ""),
    stationId: String(row.stationId || ""),
    remark: String(row.remark || ""),
    lastError: String(row.lastError || ""),
    attempts: Number(row.attempts || 0),
    updateDate: String(row.updateDate || "")
  };
}

export async function fetchPendingAccountBindings(options = {}, api = { postApi }) {
  const response = await api.postApi(pendingReadPath, {
    status: options.status || "pending",
    stationId: options.stationId || "",
    searchTerm: options.searchTerm || ""
  });
  return collectionRows(response).map(normalizeBinding);
}

export async function retryPendingAccountBindings(rows = [], api = { postApi }) {
  const response = await api.postApi(pendingRetryPath, { rows: rows.map(normalizeBinding) });
  const payload = response?.result || response?.data || {};
  return {
    attempted: Number(payload.attempted || 0),
    synced: Number(payload.synced || 0),
    failed: Number(payload.failed || 0),
    rows: Array.isArray(payload.rows) ? payload.rows : []
  };
}

export async function discardPendingAccountBindings(rows = [], api = { postApi }) {
  const response = await api.postApi(pendingDiscardPath, { rows: rows.map(normalizeBinding) });
  const payload = response?.result || response?.data || {};
  return { removed: Number(payload.removed || 0) };
}

export async function fetchMeterStats(options = {}, api = { postApi }) {
  const response = await api.postApi("/api/local/meterStats/read", { stationId: options.stationId || "" });
  const payload = response?.result || response?.data || {};
  return {
    totalMeters: Number(payload.totalMeters || 0),
    connectedMeters: Number(payload.connectedMeters || 0),
    activeMeters: Number(payload.activeMeters || 0),
    inactiveMeters: Number(payload.inactiveMeters || 0),
    unassignedMeters: Number(payload.unassignedMeters || 0),
    exact: payload.exact !== false
  };
}

export function summarizeSyncResult(result = {}) {
  const synced = Number(result.synced || 0);
  const failed = Number(result.failed || 0);
  if (!synced && !failed) return "Nothing to sync";
  if (!failed) return `${synced} binding${synced === 1 ? "" : "s"} synced to the API`;
  if (!synced) return `${failed} binding${failed === 1 ? "" : "s"} still rejected by the API`;
  return `${synced} synced, ${failed} still rejected`;
}
