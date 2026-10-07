"use strict";

const MAX_ENTRY_BYTES = 64 * 1024;
const CACHE_TTL_MS = 60 * 60 * 1000;

function cacheAdmission({ pathname, method, status, body, requiresLiveRead, isWriteRequest }) {
  if (requiresLiveRead(pathname) || isWriteRequest(pathname, method)
    || !Number.isInteger(status) || status < 200 || status >= 400) return null;
  let bytes;
  try {
    bytes = Buffer.byteLength(JSON.stringify(body ?? {}), "utf8");
  } catch {
    return null;
  }
  if (bytes > MAX_ENTRY_BYTES) return null;
  return { bytes, expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString() };
}

module.exports = { cacheAdmission, CACHE_TTL_MS, MAX_ENTRY_BYTES };
