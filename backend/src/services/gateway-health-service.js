"use strict";

const crypto = require("crypto");
const supabase = require("./supabase-service");

const memoryStates = new Map();
const memoryIncidents = new Map();

function gatewayIsDown(row = {}) {
  if (typeof row.status === "boolean") return !row.status;
  const status = String(row.status || "").trim();
  if (status) return /offline|down|fault|error/i.test(status);
  return row.successRate !== undefined && Number(row.successRate) <= 0;
}

function gatewayRows(payload) {
  if (Array.isArray(payload?.result?.data)) return payload.result.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function gatewayTotal(payload, fallback = 0) {
  return Number(payload?.result?.total ?? payload?.data?.total ?? payload?.total ?? fallback) || fallback;
}

function stateKey(stationId, gatewayId) {
  return `${stationId}::${gatewayId}`;
}

function outageId(gateway, checkedAt) {
  const reportedAt = gateway.lastReportedAt || checkedAt.slice(0, 16);
  return crypto.createHash("sha256")
    .update(`${gateway.stationId}\0${gateway.gatewayId}\0${reportedAt}`)
    .digest("hex");
}

function normalizeGateway(row = {}) {
  const gatewayId = String(row.gatewayId || row.id || "").trim();
  if (!gatewayId) return null;
  const stationId = String(row.stationId || row.station || "UNASSIGNED").trim() || "UNASSIGNED";
  return {
    gatewayId,
    gatewayName: String(row.gatewayName || row.name || gatewayId).trim() || gatewayId,
    stationId,
    isDown: gatewayIsDown(row),
    status: String(row.status ?? "Unknown"),
    successRate: Number.isFinite(Number(row.successRate)) ? Number(row.successRate) : null,
    lastReportedAt: row.updateDate || row.updatedAt || null,
  };
}

function mapStateRow(row) {
  return {
    gatewayId: row.gateway_id,
    gatewayName: row.gateway_name,
    stationId: row.station_id,
    isDown: row.is_down === true,
    status: row.last_status,
    successRate: row.success_rate == null ? null : Number(row.success_rate),
    lastReportedAt: row.last_reported_at,
    changedAt: row.changed_at,
    checkedAt: row.checked_at,
    openIncidentId: row.open_incident_id,
  };
}

function mapIncidentRow(row) {
  return {
    id: row.id,
    gatewayId: row.gateway_id,
    gatewayName: row.gateway_name,
    stationId: row.station_id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    lastStatus: row.last_status,
    successRate: row.success_rate == null ? null : Number(row.success_rate),
    lastReportedAt: row.last_reported_at,
    updatedAt: row.updated_at,
  };
}

function stateRecord(state) {
  return {
    station_id: state.stationId,
    gateway_id: state.gatewayId,
    gateway_name: state.gatewayName,
    is_down: state.isDown,
    last_status: state.status,
    success_rate: state.successRate,
    last_reported_at: state.lastReportedAt,
    changed_at: state.changedAt,
    checked_at: state.checkedAt,
    open_incident_id: state.openIncidentId,
  };
}

function incidentRecord(incident) {
  return {
    id: incident.id,
    station_id: incident.stationId,
    gateway_id: incident.gatewayId,
    gateway_name: incident.gatewayName,
    status: incident.status,
    started_at: incident.startedAt,
    ended_at: incident.endedAt,
    last_status: incident.lastStatus,
    success_rate: incident.successRate,
    last_reported_at: incident.lastReportedAt,
    updated_at: incident.updatedAt,
  };
}

async function fetchAllGateways(fetchPage, stationId, pageSize = 500) {
  const payload = { pageNumber: 1, pageSize, ...(stationId ? { stationId } : {}) };
  const first = await fetchPage(payload);
  if (!first || Number(first.status) >= 400) throw new Error(first?.body?.reason || "Live gateway read failed");
  const body = first.body || first;
  const rows = [...gatewayRows(body)];
  const total = gatewayTotal(body, rows.length);
  const pages = Math.ceil(total / pageSize);
  for (let pageNumber = 2; pageNumber <= pages; pageNumber += 1) {
    const result = await fetchPage({ ...payload, pageNumber });
    if (!result || Number(result.status) >= 400) throw new Error(result?.body?.reason || "Live gateway page failed");
    rows.push(...gatewayRows(result.body || result));
  }
  if (rows.length < total) throw new Error(`Live gateway read incomplete: received ${rows.length} of ${total}`);
  return rows;
}

async function loadPersistence(stationId) {
  if (!supabase.serviceConfigured()) return { source: "memory", warning: "Supabase service role is not configured" };
  try {
    const stationFilter = stationId ? `&station_id=eq.${encodeURIComponent(stationId)}` : "";
    const [states, incidents] = await Promise.all([
      supabase.restRequest(`/gateway_health_state?select=*&order=checked_at.desc${stationFilter}`),
      supabase.restRequest(`/gateway_health_incidents?select=*&order=started_at.desc&limit=25${stationFilter}`),
    ]);
    for (const row of Array.isArray(states) ? states : []) {
      const state = mapStateRow(row);
      memoryStates.set(stateKey(state.stationId, state.gatewayId), state);
    }
    for (const row of Array.isArray(incidents) ? incidents : []) {
      const incident = mapIncidentRow(row);
      memoryIncidents.set(incident.id, incident);
    }
    return { source: "supabase", warning: "" };
  } catch (error) {
    return { source: "memory", warning: error instanceof Error ? error.message : String(error) };
  }
}

async function persistChanges(states, incidents, persistence) {
  for (const state of states) memoryStates.set(stateKey(state.stationId, state.gatewayId), state);
  for (const incident of incidents) memoryIncidents.set(incident.id, incident);
  if (persistence.source !== "supabase") return persistence;
  try {
    if (incidents.length) {
      await supabase.restRequest("/gateway_health_incidents?on_conflict=id", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: incidents.map(incidentRecord),
      });
    }
    await supabase.restRequest("/gateway_health_state?on_conflict=station_id,gateway_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: states.map(stateRecord),
    });
    return persistence;
  } catch (error) {
    return { source: "memory", warning: error instanceof Error ? error.message : String(error) };
  }
}

function incidentAlert(incident, source) {
  return {
    id: incident.id,
    kind: incident.status === "open" ? "down" : "recovered",
    gateway: incident.gatewayId,
    gatewayName: incident.gatewayName,
    station: incident.stationId,
    status: incident.lastStatus,
    successRate: incident.successRate,
    lastReportedAt: incident.lastReportedAt,
    startedAt: incident.startedAt,
    endedAt: incident.endedAt,
    source,
  };
}

async function refreshGatewayHealth(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const checkedAt = now.toISOString();
  const rows = await fetchAllGateways(options.fetchPage, options.stationId || "", options.pageSize || 500);
  let persistence = await loadPersistence(options.stationId || "");
  const states = [];
  const changedIncidents = [];

  for (const row of rows) {
    const gateway = normalizeGateway(row);
    if (!gateway) continue;
    const key = stateKey(gateway.stationId, gateway.gatewayId);
    const previous = memoryStates.get(key);
    const changedAt = previous && previous.isDown === gateway.isDown ? previous.changedAt : checkedAt;
    let openIncidentId = previous?.openIncidentId || null;

    if (gateway.isDown && !previous?.isDown) {
      openIncidentId = outageId(gateway, checkedAt);
      changedIncidents.push({
        id: openIncidentId,
        gatewayId: gateway.gatewayId,
        gatewayName: gateway.gatewayName,
        stationId: gateway.stationId,
        status: "open",
        startedAt: checkedAt,
        endedAt: null,
        lastStatus: gateway.status,
        successRate: gateway.successRate,
        lastReportedAt: gateway.lastReportedAt,
        updatedAt: checkedAt,
      });
    } else if (!gateway.isDown && previous?.isDown && openIncidentId) {
      const priorIncident = memoryIncidents.get(openIncidentId);
      changedIncidents.push({
        id: openIncidentId,
        gatewayId: gateway.gatewayId,
        gatewayName: gateway.gatewayName,
        stationId: gateway.stationId,
        status: "recovered",
        startedAt: priorIncident?.startedAt || previous.changedAt,
        endedAt: checkedAt,
        lastStatus: gateway.status,
        successRate: gateway.successRate,
        lastReportedAt: gateway.lastReportedAt,
        updatedAt: checkedAt,
      });
      openIncidentId = null;
    }

    states.push({ ...gateway, changedAt, checkedAt, openIncidentId });
  }

  const scope = String(options.stationId || "");
  const incidentsToPersist = new Map(
    [...memoryIncidents.values(), ...changedIncidents]
      .filter((incident) => !scope || incident.stationId === scope)
      .map((incident) => [incident.id, incident]),
  );
  persistence = await persistChanges(states, [...incidentsToPersist.values()], persistence);
  const incidents = [...memoryIncidents.values()]
    .filter((incident) => !scope || incident.stationId === scope)
    .sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)))
    .slice(0, 25);
  const source = `live-gateway+${persistence.source}`;
  return {
    alerts: incidents.map((incident) => incidentAlert(incident, source)),
    events: changedIncidents.map((incident) => incidentAlert(incident, source)),
    checkedAt,
    gatewayCount: states.length,
    source,
    warning: persistence.warning,
  };
}

function resetGatewayHealthMemory() {
  memoryStates.clear();
  memoryIncidents.clear();
}

module.exports = {
  fetchAllGateways,
  gatewayIsDown,
  normalizeGateway,
  refreshGatewayHealth,
  resetGatewayHealthMemory,
};
