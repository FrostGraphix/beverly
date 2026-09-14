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

module.exports = { OemContractError, resolveInstallation };
