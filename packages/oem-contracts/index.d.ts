/** Stable failure codes for installation resolution. */
export type OemInstallationErrorCode =
  | 'OEM_INSTALLATION_MISSING'
  | 'OEM_INSTALLATION_AMBIGUOUS'
  | 'OEM_INSTALLATION_INVALID'
  | 'OEM_INSTALLATION_INACTIVE'
  | 'OEM_TENANT_FORBIDDEN';

/** An installation identity already scoped by its caller. */
export interface InstallationIdentity {
  readonly id: string;
}

/** An installation authorized by its server-side tenant context. */
export interface InstallationContext extends InstallationIdentity {
  readonly tenantId: string;
  readonly status: string;
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

/** Authorize only active installations for ordinary live operations. */
export declare function authorizeInstallation<T extends InstallationContext>(
  installation: T,
  tenantId: string
): T;
