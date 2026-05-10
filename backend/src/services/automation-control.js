"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { listAutomationDeliveries: listAutomationDeliveriesLocal } = require("./local-database");
const {
  recordAutomationDelivery
} = require("./storage-adapter");

const root = path.resolve(__dirname, "..", "..", "..");

function writableRoot() {
  if (process.env.VERCEL || process.env.AWS_REGION) return process.env.TMPDIR || process.env.TEMP || "/tmp";
  return path.join(root, "tmp");
}

const controlPath = path.join(writableRoot(), "automation-control.json");
const incidentDir = path.join(writableRoot(), "automation-incidents");

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function defaultControlState() {
  return {
    alerts: {
      enabled: true
    },
    deliveryPolicy: {
      retryCount: 2,
      retryDelayMs: 400
    },
    webhooks: [],
    remediation: {
      retryFailedRefreshOnce: true,
      captureIncidentArtifact: true,
      forceWriteGuardOnAuthFailure: true,
      runHotRefreshOnSmokeFailure: true
    },
    incidents: []
  };
}

function normalizeWebhook(entry = {}, index = 0) {
  const url = String(entry.url || "").trim();
  return {
    id: String(entry.id || `hook-${Date.now()}-${index}`),
    name: String(entry.name || `Webhook ${index + 1}`).trim(),
    url,
    secret: String(entry.secret || "").trim(),
    enabled: entry.enabled !== false,
    events: Array.isArray(entry.events) && entry.events.length
      ? entry.events.map((value) => String(value || "").trim()).filter(Boolean)
      : ["refresh-failure", "live-auth-failure", "manual-test", "smoke-failure"]
  };
}

function normalizeIncident(entry = {}) {
  return {
    id: String(entry.id || `incident-${Date.now()}`),
    kind: String(entry.kind || "manual-test"),
    severity: String(entry.severity || "info"),
    title: String(entry.title || "Automation event"),
    message: String(entry.message || ""),
    source: String(entry.source || "automation-control"),
    createdAt: String(entry.createdAt || new Date().toISOString()),
    details: entry.details && typeof entry.details === "object" ? entry.details : {},
    alerts: Array.isArray(entry.alerts) ? entry.alerts : [],
    remediation: Array.isArray(entry.remediation) ? entry.remediation : []
  };
}

function normalizeDelivery(entry = {}) {
  return {
    id: String(entry.id || `delivery-${Date.now()}`),
    createdAt: String(entry.createdAt || new Date().toISOString()),
    incidentId: String(entry.incidentId || ""),
    incidentKind: String(entry.incidentKind || "manual-test"),
    incidentTitle: String(entry.incidentTitle || "Automation event"),
    webhookId: String(entry.webhookId || ""),
    webhookName: String(entry.webhookName || "Webhook"),
    ok: entry.ok === true,
    status: Number(entry.status || 0),
    error: String(entry.error || "")
  };
}

function normalizeControlState(source = {}) {
  const fallback = defaultControlState();
  const incidents = Array.isArray(source.incidents) ? source.incidents.map(normalizeIncident).slice(0, 20) : fallback.incidents;
  return {
    alerts: {
      enabled: source?.alerts?.enabled !== false
    },
    deliveryPolicy: {
      retryCount: Math.max(0, Math.min(Number(source?.deliveryPolicy?.retryCount ?? fallback.deliveryPolicy.retryCount), 5)),
      retryDelayMs: Math.max(0, Math.min(Number(source?.deliveryPolicy?.retryDelayMs ?? fallback.deliveryPolicy.retryDelayMs), 10000))
    },
    webhooks: Array.isArray(source.webhooks) ? source.webhooks.map(normalizeWebhook) : fallback.webhooks,
    remediation: {
      retryFailedRefreshOnce: source?.remediation?.retryFailedRefreshOnce !== false,
      captureIncidentArtifact: source?.remediation?.captureIncidentArtifact !== false,
      forceWriteGuardOnAuthFailure: source?.remediation?.forceWriteGuardOnAuthFailure !== false,
      runHotRefreshOnSmokeFailure: source?.remediation?.runHotRefreshOnSmokeFailure !== false
    },
    incidents
  };
}

function readAutomationControl() {
  return normalizeControlState(readJson(controlPath, defaultControlState()));
}

function saveAutomationControl(source = {}) {
  const next = normalizeControlState({
    ...readAutomationControl(),
    ...source,
    alerts: { ...readAutomationControl().alerts, ...(source.alerts || {}) },
    deliveryPolicy: { ...readAutomationControl().deliveryPolicy, ...(source.deliveryPolicy || {}) },
    remediation: { ...readAutomationControl().remediation, ...(source.remediation || {}) },
    webhooks: Array.isArray(source.webhooks) ? source.webhooks : readAutomationControl().webhooks,
    incidents: Array.isArray(source.incidents) ? source.incidents : readAutomationControl().incidents
  });
  writeJson(controlPath, next);
  return next;
}

function shouldDeliver(webhook, incident) {
  if (!webhook.enabled || !webhook.url) return false;
  if (!Array.isArray(webhook.events) || !webhook.events.length) return true;
  return webhook.events.includes("*") || webhook.events.includes(incident.kind);
}

async function postWebhook(webhook, payload, attemptNumber = 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(webhook.secret ? { "X-Automation-Secret": webhook.secret } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    return {
      ok: response.ok,
      status: response.status,
      webhookId: webhook.id,
      webhookName: webhook.name,
      attemptNumber
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      webhookId: webhook.id,
      webhookName: webhook.name,
      attemptNumber,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function persistIncidentArtifact(incident) {
  fs.mkdirSync(incidentDir, { recursive: true });
  const filePath = path.join(incidentDir, `${incident.createdAt.replace(/[:.]/g, "-")}-${incident.kind}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(incident, null, 2)}\n`);
  return filePath;
}

function applyAutomationRemediation(incident, control = readAutomationControl()) {
  const actions = [];
  if (control.remediation.captureIncidentArtifact) {
    const artifactPath = persistIncidentArtifact(incident);
    actions.push({
      type: "capture-incident-artifact",
      status: "applied",
      artifactPath
    });
  }
  if (incident.kind === "live-auth-failure" && control.remediation.forceWriteGuardOnAuthFailure) {
    process.env.ALLOW_LIVE_WRITES = "false";
    actions.push({
      type: "force-write-guard",
      status: "applied",
      value: "false"
    });
  }
  return actions;
}

async function dispatchAutomationAlerts(incident, control = readAutomationControl()) {
  if (!control.alerts.enabled) return [];
  const deliveries = [];
  for (const webhook of control.webhooks) {
    if (!shouldDeliver(webhook, incident)) continue;
    let attempt = 1;
    let delivery = await postWebhook(webhook, incident, attempt);
    deliveries.push(delivery);
    while (!delivery.ok && attempt <= control.deliveryPolicy.retryCount) {
      attempt += 1;
      if (control.deliveryPolicy.retryDelayMs > 0) await delay(control.deliveryPolicy.retryDelayMs);
      delivery = await postWebhook(webhook, incident, attempt);
      deliveries.push(delivery);
    }
  }
  return deliveries;
}

async function handleAutomationIncident(source = {}) {
  const control = readAutomationControl();
  const incident = normalizeIncident(source);
  incident.remediation = applyAutomationRemediation(incident, control);
  incident.alerts = await dispatchAutomationAlerts(incident, control);
  for (const alert of incident.alerts) {
    await recordAutomationDelivery({
      id: `delivery-${incident.id}-${alert.webhookId}-${alert.attemptNumber}`,
      incidentId: incident.id,
      incidentKind: incident.kind,
      incidentTitle: incident.title,
      webhookId: alert.webhookId,
      webhookName: alert.webhookName,
      attemptNumber: alert.attemptNumber,
      ok: alert.ok,
      status: alert.status,
      error: alert.error,
      createdAt: incident.createdAt,
      details: {
        source: incident.source
      }
    });
  }

  const next = saveAutomationControl({
    ...control,
    incidents: [incident, ...control.incidents].slice(0, 20)
  });

  return {
    incident,
    control: next
  };
}

function automationControlReport() {
  const control = readAutomationControl();
  const deliveries = listAutomationDeliveriesLocal({ limit: 50 });
  return {
    generatedAt: new Date().toISOString(),
    alerts: control.alerts,
    deliveryPolicy: control.deliveryPolicy,
    webhooks: control.webhooks,
    remediation: control.remediation,
    incidents: control.incidents,
    deliveryHistory: deliveries.rows.map(normalizeDelivery),
    writableRoot: writableRoot()
  };
}

module.exports = {
  automationControlReport,
  applyAutomationRemediation,
  controlPath,
  dispatchAutomationAlerts,
  handleAutomationIncident,
  incidentDir,
  readAutomationControl,
  saveAutomationControl
};
