'use strict';

/** A stable, non-provider-specific contract failure. */
class OemContractError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'OemContractError';
    this.code = code;
  }
}

/**
 * Resolve exactly one trusted installation candidate.
 * Callers must scope candidates by actor and resource before calling.
 * @param {ReadonlyArray<{ id: string }>} candidates
 * @returns {{ id: string }}
 */
function resolveInstallation(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new OemContractError('OEM_INSTALLATION_MISSING', 'Installation is required');
  }
  if (candidates.length !== 1) {
    throw new OemContractError('OEM_INSTALLATION_AMBIGUOUS', 'Installation is ambiguous');
  }
  const candidate = candidates[0];
  if (!candidate || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.id)) {
    throw new OemContractError('OEM_INSTALLATION_INVALID', 'Installation identity is invalid');
  }
  return candidate;
}

/**
 * Authorize a resolved installation for ordinary live operations.
 * Sandbox and canary operations require separate, explicit controls.
 * @param {{ id: string, tenantId: string, status: string }} installation
 * @param {string} tenantId
 * @returns {{ id: string, tenantId: string, status: string }}
 */
function authorizeInstallation(installation, tenantId) {
  resolveInstallation([installation]);
  if (!tenantId || installation.tenantId !== tenantId) {
    throw new OemContractError('OEM_TENANT_FORBIDDEN', 'Tenant cannot access installation');
  }
  if (installation.status !== 'active') {
    throw new OemContractError('OEM_INSTALLATION_INACTIVE', 'Installation is not active');
  }
  return installation;
}

/**
 * Enforce an operation's declared support level.
 * Missing and non-executable states always deny execution.
 * @param {Readonly<Record<string, string>>} manifest
 * @param {string} capability
 * @param {'read' | 'write'} access
 * @returns {string}
 */
function requireCapability(manifest, capability, access) {
  const state = manifest && Object.hasOwn(manifest, capability) ? manifest[capability] : undefined;
  const allowed = access === 'read'
    ? ['read_only', 'write_supported', 'async_supported']
    : access === 'write'
      ? ['write_supported', 'async_supported']
      : [];
  if (!allowed.includes(state)) {
    throw new OemContractError('OEM_CAPABILITY_UNSUPPORTED', 'OEM operation is unsupported');
  }
  return state;
}

/**
 * Validate a canonical adapter result before financial state changes.
 * @param {unknown} outcome
 * @returns {Record<string, unknown>}
 */
function requireVendOutcome(outcome) {
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
    throw new OemContractError('OEM_OUTCOME_INVALID', 'OEM outcome is invalid');
  }
  const value = /** @type {Record<string, unknown>} */ (outcome);
  const status = value.status;
  const statuses = ['confirmed_success', 'confirmed_failure', 'pending', 'unknown', 'requires_manual_review'];
  if (!statuses.includes(status)) {
    throw new OemContractError('OEM_OUTCOME_INVALID', 'OEM outcome is invalid');
  }
  if (value.providerReference !== undefined && (typeof value.providerReference !== 'string' || !value.providerReference.trim())) {
    throw new OemContractError('OEM_OUTCOME_INVALID', 'OEM provider reference is invalid');
  }
  if (value.token !== undefined && (typeof value.token !== 'string' || !value.token.trim())) {
    throw new OemContractError('OEM_OUTCOME_INVALID', 'OEM token is invalid');
  }
  if (status === 'confirmed_success' && (typeof value.providerReference !== 'string' || !value.providerReference.trim())) {
    throw new OemContractError('OEM_OUTCOME_INVALID', 'Confirmed success lacks provider evidence');
  }
  if ((status === 'confirmed_failure' || status === 'requires_manual_review') && (typeof value.reason !== 'string' || !value.reason.trim())) {
    throw new OemContractError('OEM_OUTCOME_INVALID', 'OEM outcome lacks a reason');
  }
  return value;
}

module.exports = { OemContractError, resolveInstallation, authorizeInstallation, requireCapability, requireVendOutcome };
