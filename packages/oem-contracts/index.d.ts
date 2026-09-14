/** Stable failure codes for installation resolution. */
export type OemInstallationErrorCode =
  | 'OEM_INSTALLATION_MISSING'
  | 'OEM_INSTALLATION_AMBIGUOUS'
  | 'OEM_INSTALLATION_INVALID';

/** An installation identity already scoped by its caller. */
export interface InstallationIdentity {
  readonly id: string;
}

/** A stable, non-provider-specific contract failure. */
export declare class OemContractError extends Error {
  readonly code: OemInstallationErrorCode;
  constructor(code: OemInstallationErrorCode, message: string);
}

/** Resolve exactly one trusted installation candidate. */
export declare function resolveInstallation<T extends InstallationIdentity>(
  candidates: readonly T[]
): T;
