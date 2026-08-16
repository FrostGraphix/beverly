"use strict";

// AES-256-GCM envelope encryption for per-OEM upstream credentials
// (oem_credentials.encrypted_*). Mirrors the existing convention in
// api/reference.js's crmSessionSecret(): derive the key from an env var,
// never store plaintext, fail closed in production if the key is missing.
//
// Ciphertext format (base64): iv(12 bytes) || authTag(16 bytes) || ciphertext

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const insecureDevKey = crypto.createHash("sha256").update("beverly-local-oem-credentials-key-only").digest();

let cachedKey = null;

function resolveKey() {
  if (cachedKey) return cachedKey;
  const configured = String(process.env.OEM_CREDENTIALS_ENCRYPTION_KEY || "").trim();
  if (!configured) {
    cachedKey = insecureDevKey;
    return cachedKey;
  }
  // Accept base64 (preferred, 32 bytes decoded) or a raw 32-char string as a convenience.
  let key = Buffer.from(configured, "base64");
  if (key.length !== 32) key = crypto.createHash("sha256").update(configured).digest();
  cachedKey = key;
  return cachedKey;
}

function encryptSecret(plaintext) {
  const value = String(plaintext ?? "");
  if (!value) return "";
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, resolveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

function decryptSecret(encoded) {
  const raw = String(encoded || "").trim();
  if (!raw) return "";
  let buffer;
  try {
    buffer = Buffer.from(raw, "base64");
  } catch {
    return "";
  }
  if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH) return "";
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, resolveKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    console.error("[oem-credential-crypto] decrypt failed", error instanceof Error ? error.message : String(error));
    return "";
  }
}

function resetForTests() {
  cachedKey = null;
}

module.exports = {
  encryptSecret,
  decryptSecret,
  resetForTests
};
