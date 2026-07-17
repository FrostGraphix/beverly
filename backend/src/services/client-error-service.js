const { recordAuditLog, listAuditLogs } = require("./storage-adapter");

const proxySource = "client-error";
const maxBatchSize = 20;
const maxFieldLength = 500;

function clampText(value, length = maxFieldLength) {
  return String(value || "").slice(0, length);
}

function sanitizeEntry(entry = {}) {
  if (!entry || typeof entry !== "object") return null;
  const message = clampText(entry.message);
  if (!message) return null;
  return {
    reference: clampText(entry.reference, 64),
    event: clampText(entry.event, 64) || "client-error",
    message,
    status: Number.isFinite(Number(entry.status)) ? Number(entry.status) : 0,
    url: clampText(entry.url, 300),
    method: clampText(entry.method, 10).toUpperCase(),
    route: clampText(entry.route, 120),
    userAgent: clampText(entry.userAgent, 200),
    at: clampText(entry.at, 40)
  };
}

async function ingestClientErrors(entries, actor = {}) {
  const batch = (Array.isArray(entries) ? entries : [])
    .slice(0, maxBatchSize)
    .map(sanitizeEntry)
    .filter(Boolean);

  for (const entry of batch) {
    await recordAuditLog({
      method: "POST",
      path: "/client-error",
      outcome: entry.event,
      statusCode: entry.status || 0,
      proxySource,
      details: {
        ...entry,
        actorUserId: clampText(actor.userId, 64),
        actorRoleId: clampText(actor.roleId, 64)
      }
    });
  }
  return { accepted: batch.length, dropped: (Array.isArray(entries) ? entries.length : 0) - batch.length };
}

async function listClientErrors(options = {}) {
  const rows = await listAuditLogs({ proxySource, limit: options.limit || 100 });
  return {
    total: rows.length,
    errors: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      outcome: row.outcome,
      statusCode: row.statusCode,
      ...row.details
    }))
  };
}

module.exports = {
  ingestClientErrors,
  listClientErrors
};
