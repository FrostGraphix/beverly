const logKey = "beverly.clientErrors";
const maxEntries = 30;
const shipEndpoint = "/api/system/client-errors";
const shipDelayMs = 5000;
const maxQueueEntries = 20;

let shipQueue = [];
let shipTimer = null;
let handlersInstalled = false;

function canShip() {
  return typeof window !== "undefined" && typeof fetch === "function";
}

function scheduleShip() {
  if (!canShip() || shipTimer) return;
  shipTimer = setTimeout(() => {
    shipTimer = null;
    flushClientErrors();
  }, shipDelayMs);
}

export async function flushClientErrors() {
  if (!canShip() || !shipQueue.length) return;
  const batch = shipQueue.splice(0, maxQueueEntries);
  try {
    await fetch(shipEndpoint, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errors: batch })
    });
  } catch {
    // Telemetry is best-effort — requeue once, capped, never throw.
    shipQueue = [...batch, ...shipQueue].slice(0, maxQueueEntries);
  }
}

export function installGlobalErrorHandlers() {
  if (handlersInstalled || typeof window === "undefined") return;
  handlersInstalled = true;
  window.addEventListener("error", (event) => {
    recordClientError("window-error", event?.error || event?.message, {
      url: String(event?.filename || ""),
      line: event?.lineno || 0
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    recordClientError("unhandled-rejection", event?.reason, {});
  });
  window.addEventListener("pagehide", () => {
    flushClientErrors();
  });
}

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

  if (canShip()) {
    shipQueue = [...shipQueue, {
      reference: entry.reference,
      event: entry.event,
      message: entry.message,
      status: entry.status,
      url: entry.url,
      method: entry.method,
      route: typeof window !== "undefined" ? String(window.location?.hash || "") : "",
      userAgent: typeof navigator !== "undefined" ? String(navigator.userAgent || "") : "",
      at: entry.at
    }].slice(-maxQueueEntries);
    scheduleShip();
  }
  return reference;
}

export function readClientErrors() {
  try {
    return JSON.parse(localStorage.getItem(logKey) || "[]");
  } catch {
    return [];
  }
}
