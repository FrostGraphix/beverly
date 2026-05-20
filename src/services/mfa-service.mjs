/**
 * mfa-service.mjs — Two-Factor Authentication orchestration.
 * Owns: MFA enrollment, challenge, verification, recovery codes.
 * Used by: MfaChallengeModal.vue, MfaSetupFlow.vue, LoginPage.vue, SettingsPage.vue
 * Depends on: api.js
 */

import { postApi, getApi } from "./api";

/* ── MFA Enrollment ── */

/**
 * Enroll a new TOTP factor.
 * @returns {{ factorId: string, totpUri: string, secret: string, recoveryCodes: string[] }}
 */
export async function enrollMFA() {
  const res = await postApi("/api/auth/mfa/enroll", {});
  return res?.data || res;
}

/**
 * Verify the enrollment by confirming a TOTP code.
 * @param {string} factorId
 * @param {string} code — 6-digit TOTP
 * @returns {{ verified: boolean }}
 */
export async function verifyEnrollment(factorId, code) {
  const res = await postApi("/api/auth/mfa/verify-enrollment", { factorId, code });
  return res?.data || res;
}

/* ── MFA Challenge / Verify ── */

/**
 * Create a challenge for an enrolled factor.
 * @param {string} factorId
 * @returns {{ challengeId: string }}
 */
export async function createChallenge(factorId) {
  const res = await postApi("/api/auth/mfa/challenge", { factorId });
  return res?.data || res;
}

/**
 * Verify a challenge with a TOTP code.
 * @param {string} challengeId
 * @param {string} code — 6-digit TOTP
 * @returns {{ verified: boolean }}
 */
export async function verifyChallenge(challengeId, code) {
  const res = await postApi("/api/auth/mfa/verify-challenge", { challengeId, code });
  return res?.data || res;
}

/* ── Factor Management ── */

/**
 * Unenroll an existing MFA factor.
 * @param {string} factorId
 * @returns {{ success: boolean }}
 */
export async function unenrollMFA(factorId) {
  const res = await postApi("/api/auth/mfa/unenroll", { factorId });
  return res?.data || res;
}

/**
 * List all enrolled MFA factors.
 * @returns {{ factors: Array<{ id: string, type: string, status: string }> }}
 */
export async function listFactors() {
  const res = await getApi("/api/auth/mfa/factors");
  return res?.data || res;
}

/**
 * Quick status check: is MFA enrolled and verified?
 * @returns {{ enrolled: boolean, factorId: string|null }}
 */
export async function getMFAStatus() {
  try {
    const result = await listFactors();
    const factors = Array.isArray(result?.factors) ? result.factors : [];
    const active = factors.find((f) => f.status === "verified");
    return { enrolled: Boolean(active), factorId: active?.id || null };
  } catch {
    return { enrolled: false, factorId: null };
  }
}

/* ── Recovery Codes ── */

/**
 * Verify a recovery code (one-time use).
 * @param {string} code
 * @returns {{ verified: boolean }}
 */
export async function verifyRecoveryCode(code) {
  const res = await postApi("/api/auth/mfa/verify-recovery", { code });
  return res?.data || res;
}

/**
 * Build a downloadable text file of recovery codes.
 * @param {string[]} codes
 * @returns {string}
 */
export function generateRecoveryCodesText(codes) {
  return [
    "═══════════════════════════════════════",
    "  Beverly — Recovery Codes",
    "═══════════════════════════════════════",
    "",
    `  Generated: ${new Date().toISOString()}`,
    "",
    "  Each code can only be used once.",
    "  Store these codes in a safe place.",
    "",
    "  Codes:",
    "",
    ...codes.map((c, i) => `  ${String(i + 1).padStart(2, " ")}. ${c}`),
    "",
    "═══════════════════════════════════════",
    "  Do not share. Do not lose."
  ].join("\n");
}
