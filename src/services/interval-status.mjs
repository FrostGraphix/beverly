const NORMAL_STATUS_VALUES = new Set([
  "normal",
  "closed",
  "false",
  "0",
  "no",
  "ok",
  "okay",
  "off",
  "inactive"
]);

const CHECK_STATUS_VALUES = new Set([
  "check",
  "open",
  "true",
  "1",
  "yes",
  "abnormal",
  "error",
  "failed",
  "failure",
  "tamper",
  "tampered",
  "low",
  "reverse",
  "reversed",
  "unbalance",
  "unbalanced",
  "on",
  "active"
]);

// Hourly modal follows the reference site: false-ish states are Normal.
export function normalizeHourlyStatus(value) {
  if (value === null || value === undefined || value === "") return "Normal";
  if (typeof value === "boolean") return value ? "Check" : "Normal";
  if (typeof value === "number") return value === 0 ? "Normal" : "Check";

  const text = String(value).trim().toLowerCase();
  if (!text) return "Normal";
  if (NORMAL_STATUS_VALUES.has(text)) return "Normal";
  if (CHECK_STATUS_VALUES.has(text)) return "Check";

  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric === 0 ? "Normal" : "Check";

  return "Check";
}

export function normalizeIntervalStatus(value) {
  return normalizeHourlyStatus(value);
}

// Main interval table intentionally uses the inverse label mapping.
// Keep this separate so hourly modal changes cannot flip again.
export function normalizeIntervalTableStatus(value) {
  return normalizeHourlyStatus(value) === "Normal" ? "Check" : "Normal";
}
