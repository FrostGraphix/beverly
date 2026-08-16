/**
 * Per-meter STS token-format (S1/S2) overrides.
 *
 * The credit-token `isS2` flag is normally guessed from meter phase, but phase
 * does not reliably map to the STS standard — some three-phase meters expect S1
 * tokens and vice-versa. These helpers read/write an explicit per-meter pin so
 * token generation uses the format the meter actually accepts.
 *
 * Backed by the CRM local store via /api/local/meter-token-format/*.
 */
import { postApi } from "./api.js";

function unwrap(response) {
  if (response && typeof response === "object" && ("result" in response || "data" in response)) {
    return response.result ?? response.data ?? null;
  }
  return response ?? null;
}

/**
 * @returns {Promise<{ meterId: string, isS2: boolean, note?: string, updatedBy?: string, updatedAt?: string } | null>}
 */
export async function getMeterTokenFormat(meterId) {
  const id = String(meterId || "").trim();
  if (!id) return null;
  try {
    const res = await postApi("/api/local/meter-token-format/read", { meterId: id });
    const body = unwrap(res);
    return body && typeof body === "object" && "isS2" in body ? body : null;
  } catch {
    return null;
  }
}

/**
 * Pin (or clear) the token format for a meter.
 * @param {string} meterId
 * @param {boolean|null|"auto"} isS2 - true=S2, false=S1, null/"auto"=clear (revert to phase default)
 * @param {string} [note]
 */
export async function setMeterTokenFormat(meterId, isS2, note = "") {
  const id = String(meterId || "").trim();
  if (!id) throw new Error("meterId is required");
  const res = await postApi("/api/local/meter-token-format/save", { meterId: id, isS2, note });
  return unwrap(res);
}

export async function listMeterTokenFormats() {
  try {
    const res = await postApi("/api/local/meter-token-format/read", {});
    const body = unwrap(res);
    return Array.isArray(body) ? body : [];
  } catch {
    return [];
  }
}

// ── SGC-level rules (one rule classifies a whole supply group) ──────────────
export async function getSgcTokenRule(sgc) {
  const id = String(sgc || "").trim();
  if (!id) return null;
  try {
    const res = await postApi("/api/local/sgc-token-rule/read", { sgc: id });
    const body = unwrap(res);
    return body && typeof body === "object" && "isS2" in body ? body : null;
  } catch {
    return null;
  }
}

export async function setSgcTokenRule(sgc, isS2, note = "") {
  const id = String(sgc || "").trim();
  if (!id) throw new Error("sgc is required");
  const res = await postApi("/api/local/sgc-token-rule/save", { sgc: id, isS2, note });
  return unwrap(res);
}

export async function listSgcTokenRules() {
  try {
    const res = await postApi("/api/local/sgc-token-rule/read", {});
    const body = unwrap(res);
    return Array.isArray(body) ? body : [];
  } catch {
    return [];
  }
}

/** Look up a meter's SGC from the energy catalog (best-effort). */
export async function lookupMeterSgc(meterId) {
  const id = String(meterId || "").trim();
  if (!id) return "";
  try {
    const res = await postApi("/api/meter/read", { meterId: id, pageNumber: 1, pageSize: 50 });
    const buckets = [res?.result?.data, res?.result?.records, res?.data?.data, res?.data, res?.records];
    let rows = [];
    for (const b of buckets) { if (Array.isArray(b)) { rows = b; break; } }
    const row = rows.find((r) => String(r.meterId || r.meter_id || r.id || "").trim() === id) || rows[0];
    return row ? String(row.sgc || "").trim() : "";
  } catch {
    return "";
  }
}

/**
 * Resolve the effective isS2 for a meter using the full hierarchy:
 *   1. per-meter override  2. SGC rule  3. (undefined → caller's phase fallback)
 * @param {string} meterId
 * @param {{ sgc?: string }} [opts] - pass sgc to skip the catalog lookup
 * @returns {Promise<boolean|undefined>}
 */
export async function resolveMeterIsS2Override(meterId, opts = {}) {
  const record = await getMeterTokenFormat(meterId);
  if (record && typeof record.isS2 === "boolean") return record.isS2;

  const sgc = String(opts.sgc || "").trim() || (await lookupMeterSgc(meterId));
  if (sgc) {
    const rule = await getSgcTokenRule(sgc);
    if (rule && typeof rule.isS2 === "boolean") return rule.isS2;
  }
  return undefined;
}
