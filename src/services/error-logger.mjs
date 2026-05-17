const logKey = "beverly.clientErrors";
const maxEntries = 30;

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

export function errorReference(prefix = "ERR") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function recordClientError(event, error, context = {}) {
  const reference = context.reference || errorReference();
  const entry = {
    reference,
    event,
    message: error?.message || String(error || "Unknown error"),
    status: error?.response?.status || error?.status || 0,
    url: error?.config?.url || context.url || "",
    method: error?.config?.method || context.method || "",
    context: safeJson(context),
    at: new Date().toISOString()
  };

  try {
    const existing = JSON.parse(localStorage.getItem(logKey) || "[]");
    localStorage.setItem(logKey, JSON.stringify([entry, ...existing].slice(0, maxEntries)));
  } catch {
    /* localStorage can fail in restricted modes. */
  }

  console.error(`[${event}]`, JSON.stringify(entry));
  return reference;
}

export function readClientErrors() {
  try {
    return JSON.parse(localStorage.getItem(logKey) || "[]");
  } catch {
    return [];
  }
}
