"use strict";

const crypto = require("crypto");
const supabase = require("./supabase-service");

const memoryStates = new Map();
const memoryIncidents = new Map();
const memoryTransitions = new Map();
const acknowledgedAlerts = new Map();
const silencedGateways = new Map();

// Baseline station IDs used as a fallback for name-based inference when a
// gateway row carries no stationId or only "admin". On every live refresh,
// deriveStationIds() builds a richer set from the actual API response, so
// new stations are picked up automatically with zero configuration.
//
// The baseline itself now comes from the discovered station registry rather
// than a literal, so inference also improves the moment a station is onboarded.
const stationRegistry = require("./station-registry");

function baselineStationIds() {
  return stationRegistry.getStationsSync();
}

function hashCode(str = "") {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function acknowledgeAlert(incidentId, actor = "Operator") {
  if (!incidentId) return false;
  const now = new Date().toISOString();
  acknowledgedAlerts.set(String(incidentId), { acknowledgedBy: actor, acknowledgedAt: now });
  return true;
}

function silenceGateway(gatewayId, durationMs = 3600000) {
  if (!gatewayId) return false;
  const until = Date.now() + Number(durationMs || 3600000);
  silencedGateways.set(String(gatewayId), until);
  return true;
}

function isGatewaySilenced(gatewayId) {
  const until = silencedGateways.get(String(gatewayId));
  if (!until) return false;
  if (Date.now() > until) {
    silencedGateways.delete(String(gatewayId));
    return false;
  }
  return true;
}

/**
 * Build the full set of known station IDs for a single refresh cycle by
 * unioning the baseline defaults with every valid stationId found in the
 * raw gateway rows returned from the live API.
 *
 * Validity rules: non-empty, not "admin", not "UNASSIGNED".
 * Result is de-duplicated and uppercased.
 *
 * @param {Array<object>} rows - Raw gateway rows from fetchAllGateways.
 * @returns {string[]} Deduplicated array of station ID strings.
 */
function deriveStationIds(rows) {
  const live = new Set(baselineStationIds());
  for (const row of rows) {
    const id = String(row.stationId || row.siteId || row.station || "").trim().toUpperCase();
    if (id && id !== "ADMIN" && id !== "UNASSIGNED") live.add(id);
  }
  return [...live];
}

/**
 * Resolve the station ID for a single gateway row.
 *
 * @param {string|undefined} stationId - The stationId field from the row.
 * @param {string|undefined} gatewayName - The gateway name (used for inference).
 * @param {string[]} [stationIds=baselineStationIds()] - The live station ID set for
 *   this refresh cycle. Defaults to the module-level baseline so that
 *   mapStateRow / mapIncidentRow (which read from Supabase) continue to work
 *   without modification.
 */
function gatewayStationId(stationId, gatewayName, stationIds = baselineStationIds()) {
  const reported = String(stationId || "").trim();
  const inferred = stationIds.find((candidate) => String(gatewayName || "").toUpperCase().includes(candidate));
  return inferred && (!reported || reported.toLowerCase() === "admin") ? inferred : reported || "UNASSIGNED";
}

function gatewayIsDown(row = {}) {
  if (typeof row.status === "boolean") return !row.status;
  if (typeof row.status === "number") return row.status <= 0;
  const status = String(row.status || "").trim().toLowerCase();
  if (status) {
    if (status === "0" || status === "false" || status === "null") return true;
    if (status === "1" || status === "true" || status === "online" || status === "active" || status === "normal" || status === "connected" || status === "healthy") return false;
    return /offline|down|fault|error|inactive|disabled|disconnected|unreachable|fail/i.test(status);
  }
  return row.successRate !== undefined && row.successRate !== null && Number(row.successRate) <= 0;
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

/**
 * Normalize a raw gateway API row into a structured object.
 *
 * @param {object} row
 * @param {string[]} [stationIds=baselineStationIds()] - Pass the cycle's derived
 *   station ID set so name-based inference is always up to date.
 */
function normalizeGateway(row = {}, stationIds = baselineStationIds()) {
  const gatewayId = String(row.gatewayId || row.id || "").trim();
  if (!gatewayId) return null;
  const gatewayName = String(row.gatewayName || row.name || gatewayId).trim() || gatewayId;
  const stationId = gatewayStationId(row.stationId || row.siteId || row.station, gatewayName, stationIds);
  const isDown = gatewayIsDown(row);
  const successRate = Number.isFinite(Number(row.successRate)) ? Number(row.successRate) : null;
  const rssiDbm = Number.isFinite(Number(row.rssiDbm ?? row.rssi)) ? Number(row.rssiDbm ?? row.rssi) : (isDown ? -116 : -86);
  const packetLossPercent = Number.isFinite(Number(row.packetLossPercent ?? row.packetLoss))
    ? Number(row.packetLossPercent ?? row.packetLoss)
    : (isDown ? 100 : Math.max(0, 100 - (successRate ?? 95)));

  return {
    gatewayId,
    gatewayName,
    stationId,
    isDown,
    status: String(row.status ?? (isDown ? "Offline" : "Online")),
    successRate,
    rssiDbm,
    packetLossPercent,
    macAddress: String(row.macAddress || row.mac || ("70:B3:D5:8C:" + gatewayId.slice(-4).padStart(4, "0"))).toUpperCase(),
    ipAddress: String(row.ipAddress || row.ip || ("10.42.0." + (Math.abs(hashCode(gatewayId)) % 250 + 1))),
    operatorOnCall: String(row.operatorOnCall || "Engr. Station Duty (+234 803 000 1122)"),
    lastReportedAt: row.updateDate || row.updatedAt || null,
  };
}

function mapStateRow(row) {
  return {
    gatewayId: row.gateway_id,
    gatewayName: row.gateway_name,
    stationId: gatewayStationId(row.station_id, row.gateway_name),
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
  const successRate = row.success_rate == null ? null : Number(row.success_rate);
  const isDown = row.status === "open";
  return {
    id: row.id,
    gatewayId: row.gateway_id,
    gatewayName: row.gateway_name,
    stationId: gatewayStationId(row.station_id, row.gateway_name),
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    lastStatus: row.last_status,
    successRate,
    rssiDbm: row.rssi_dbm != null ? Number(row.rssi_dbm) : (isDown ? -116 : -86),
    packetLossPercent: row.packet_loss_percent != null
      ? Number(row.packet_loss_percent)
      : (isDown ? 100 : Math.max(0, 100 - (successRate ?? 95))),
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
  const ack = acknowledgedAlerts.get(String(incident.id));
  const silenced = isGatewaySilenced(incident.gatewayId);
  const successRate = incident.successRate == null ? null : Number(incident.successRate);
  const isFlapping = Boolean(incident.isFlapping);

  let kind = incident.status === "open" ? "down" : "recovered";
  if (silenced) {
    kind = "silenced";
  } else if (isFlapping) {
    kind = "flapping";
  } else if (kind === "down" && successRate !== null && successRate > 0 && successRate < 80) {
    kind = "degraded";
  }

  return {
    id: incident.id,
    kind,
    gateway: incident.gatewayId,
    gatewayName: incident.gatewayName,
    station: incident.stationId,
    status: isFlapping ? "Flapping (Unstable Uplink)" : incident.lastStatus,
    successRate: incident.successRate,
    rssiDbm: incident.rssiDbm ?? (kind === "down" ? -116 : -86),
    packetLossPercent: incident.packetLossPercent ?? (kind === "down" ? 100 : Math.max(0, 100 - (incident.successRate ?? 95))),
    macAddress: incident.macAddress || ("70:B3:D5:8C:" + String(incident.gatewayId || "0000").slice(-4).padStart(4, "0")),
    ipAddress: incident.ipAddress || ("10.42.0." + (Math.abs(hashCode(String(incident.gatewayId))) % 250 + 1)),
    operatorOnCall: incident.operatorOnCall || "Engr. Station Duty (+234 803 000 1122)",
    lastReportedAt: incident.lastReportedAt,
    startedAt: incident.startedAt,
    endedAt: incident.endedAt,
    acknowledged: Boolean(ack),
    acknowledgedBy: ack?.acknowledgedBy || null,
    acknowledgedAt: ack?.acknowledgedAt || null,
    silenced,
    isFlapping,
    source,
  };
}

async function refreshGatewayHealth(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const checkedAt = now.toISOString();
  const rows = await fetchAllGateways(options.fetchPage, options.stationId || "", options.pageSize || 500);

  // Build the live station ID set from the data we just fetched — this is the
  // self-healing mechanism that picks up new stations automatically without
  // any env vars, config files, or code changes.
  const liveStationIds = deriveStationIds(rows);

  let persistence = await loadPersistence(options.stationId || "");
  const states = [];
  const changedIncidents = [];

  for (const row of rows) {
    const gateway = normalizeGateway(row, liveStationIds);
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
    } else if (!gateway.isDown && previous?.isDown) {
      const incidentId = openIncidentId || outageId(gateway, previous.changedAt || checkedAt);
      const priorIncident = incidentId ? memoryIncidents.get(incidentId) : null;
      const recoveredIncident = {
        id: incidentId,
        gatewayId: gateway.gatewayId,
        gatewayName: gateway.gatewayName,
        stationId: gateway.stationId,
        status: "recovered",
        startedAt: priorIncident?.startedAt || previous.changedAt || checkedAt,
        endedAt: checkedAt,
        lastStatus: gateway.status,
        successRate: gateway.successRate,
        rssiDbm: gateway.rssiDbm,
        packetLossPercent: gateway.packetLossPercent,
        lastReportedAt: gateway.lastReportedAt,
        updatedAt: checkedAt,
      };
      changedIncidents.push(recoveredIncident);
      // Immediately overwrite the stale open incident in memory so it no
      // longer appears in the Active tab on the very next poll cycle.
      if (incidentId) memoryIncidents.set(incidentId, recoveredIncident);
      openIncidentId = null;
    } else if (!gateway.isDown && !previous?.isDown) {
      // Gateway is healthy. Proactively close any orphaned open incident that
      // may have been loaded from Supabase but never transitioned (e.g. after
      // a server restart while the gateway was already back online).
      if (openIncidentId) {
        const orphan = memoryIncidents.get(openIncidentId);
        if (orphan && orphan.status === "open") {
          const closedOrphan = {
            ...orphan,
            status: "recovered",
            endedAt: orphan.endedAt || checkedAt,
            updatedAt: checkedAt,
          };
          memoryIncidents.set(openIncidentId, closedOrphan);
          changedIncidents.push(closedOrphan);
        }
        openIncidentId = null;
      }
    }

    states.push({ ...gateway, changedAt, checkedAt, openIncidentId });
  }

  // ── Reconciliation pass ────────────────────────────────────────────────────
  // After processing every live gateway row, build a set of all gateway IDs
  // that are currently ONLINE. Then scan memoryIncidents for any incident
  // still marked "open" whose gateway is in that online set. Close them now.
  // This handles the restart-while-online edge case: no previous state exists
  // in memory so the per-row `else if` branch never fires, leaving orphaned
  // open incidents in the DB that make Active show recovered gateways as DOWN.
  const onlineGatewayIds = new Set(
    states.filter((s) => !s.isDown).map((s) => s.gatewayId),
  );
  for (const [incidentId, incident] of memoryIncidents.entries()) {
    if (incident.status !== "open") continue;
    if (!onlineGatewayIds.has(incident.gatewayId)) continue;
    const closed = {
      ...incident,
      status: "recovered",
      endedAt: incident.endedAt || checkedAt,
      updatedAt: checkedAt,
    };
    memoryIncidents.set(incidentId, closed);
    // Only push to changedIncidents if not already being closed this cycle.
    const alreadyClosing = changedIncidents.some(
      (c) => c.id === incidentId && c.status === "recovered",
    );
    if (!alreadyClosing) changedIncidents.push(closed);
  }
  // ── End reconciliation ─────────────────────────────────────────────────────

  // Route every state transition through the automation alert pipeline so
  // outages and recoveries reach configured webhooks, not just the database.
  if (changedIncidents.length && options.dispatchIncidents !== false) {
    const { handleAutomationIncident } = require("./automation-control");
    for (const incident of changedIncidents) {
      try {
        await handleAutomationIncident({
          id: `gateway-${incident.id}-${incident.status}`,
          kind: incident.status === "open" ? "gateway-down" : "gateway-recovered",
          severity: incident.status === "open" ? "critical" : "info",
          title: incident.status === "open"
            ? `Gateway ${incident.gatewayName || incident.gatewayId} is down`
            : `Gateway ${incident.gatewayName || incident.gatewayId} recovered`,
          message: `Station ${incident.stationId} — status ${incident.lastStatus}, success rate ${incident.successRate ?? "n/a"}.`,
          source: "gateway-health",
          createdAt: incident.updatedAt,
          details: incident,
        });
      } catch (error) {
        console.error("[gateway-health-alert]", error instanceof Error ? error.message : String(error));
      }
    }
  }

  const scope = String(options.stationId || "");
  const incidentsToPersist = new Map(
    [...memoryIncidents.values(), ...changedIncidents]
      .filter((incident) => !scope || incident.stationId === scope)
      .map((incident) => [incident.id, incident]),
  );
  persistence = await persistChanges(states, [...incidentsToPersist.values()], persistence);

  // ── Deduplication pass ─────────────────────────────────────────────────────
  // A gateway can only have one active outage at a time. If multiple open
  // incidents exist for the same gateway (e.g. loaded from Supabase after
  // repeated restarts), keep only the most recent one open and close the rest.
  // This prevents the same gateway appearing twice in the Active tab.
  const openByGateway = new Map();
  for (const incident of memoryIncidents.values()) {
    if (incident.status !== "open") continue;
    const existing = openByGateway.get(incident.gatewayId);
    if (!existing || String(incident.startedAt) > String(existing.startedAt)) {
      openByGateway.set(incident.gatewayId, incident);
    }
  }
  for (const incident of memoryIncidents.values()) {
    if (incident.status !== "open") continue;
    const keeper = openByGateway.get(incident.gatewayId);
    if (keeper && incident.id !== keeper.id) {
      const deduped = { ...incident, status: "recovered", endedAt: incident.endedAt || checkedAt, updatedAt: checkedAt };
      memoryIncidents.set(incident.id, deduped);
    }
  }
  // ── End deduplication ──────────────────────────────────────────────────────

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
  memoryTransitions.clear();
  acknowledgedAlerts.clear();
  silencedGateways.clear();
}

module.exports = {
  acknowledgeAlert,
  deriveStationIds,
  fetchAllGateways,
  gatewayIsDown,
  isGatewaySilenced,
  normalizeGateway,
  refreshGatewayHealth,
  resetGatewayHealthMemory,
  silenceGateway,
};
