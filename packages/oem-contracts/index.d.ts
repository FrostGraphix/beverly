/** Stable failure codes for installation resolution. */
export type OemInstallationErrorCode =
  | 'OEM_INSTALLATION_MISSING'
  | 'OEM_INSTALLATION_AMBIGUOUS'
  | 'OEM_INSTALLATION_INVALID'
  | 'OEM_INSTALLATION_INACTIVE'
  | 'OEM_TENANT_FORBIDDEN'
  | 'OEM_CAPABILITY_UNSUPPORTED'
  | 'OEM_OUTCOME_INVALID';

/** Audited capability states. */
export type CapabilityState =
  | 'unsupported'
  | 'read_only'
  | 'write_supported'
  | 'async_supported'
  | 'manual_upstream'
  | 'certification_required';

/** Server-owned capability manifest. */
export type CapabilityManifest = Readonly<Record<string, CapabilityState>>;

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

/** Reject missing or insufficient capability states. */
export declare function requireCapability(
  manifest: CapabilityManifest,
  capability: string,
  access: 'read' | 'write'
): CapabilityState;

/** Beverly-owned pagination request. */
export interface PageQuery {
  readonly limit: number;
  readonly cursor?: string;
}

/** Beverly-owned page envelope. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/** Normalized station identity. */
export interface CanonicalStation {
  readonly externalId: string;
  readonly name: string;
}

/** Normalized meter identity. */
export interface CanonicalMeter {
  readonly externalId: string;
  readonly externalStationId: string;
}

/** Installation-scoped meter lookup. */
export interface MeterLookup {
  readonly installationId: string;
  readonly externalMeterId: string;
}

/** Durable Beverly command fields required before OEM dispatch. */
export interface VendCommand extends MeterLookup {
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly amountMinor: number;
  readonly currency: string;
}

/** Installation-scoped provider outcome lookup. */
export interface VendStatusQuery {
  readonly installationId: string;
  readonly commandId: string;
  readonly providerReference?: string;
}

/** Normalized financial outcome. Timeout alone maps to unknown. */
export type VendOutcome =
  | { readonly status: 'confirmed_success'; readonly providerReference: string; readonly token?: string }
  | { readonly status: 'confirmed_failure'; readonly providerReference?: string; readonly reason: string }
  | { readonly status: 'pending'; readonly providerReference?: string }
  | { readonly status: 'unknown'; readonly providerReference?: string }
  | { readonly status: 'requires_manual_review'; readonly providerReference?: string; readonly reason: string };

/** Validate an adapter result before financial state changes. */
export declare function requireVendOutcome(outcome: unknown): VendOutcome;

/** Provider telemetry with unresolved counter and credit semantics preserved. */
export interface CanonicalTelemetryReading {
  readonly externalSiteId: string;
  readonly externalMeterId: string;
  readonly externalCustomerId?: string | null;
  readonly timestamp: string;
  readonly energyKwh?: number | null;
  readonly voltageAvg?: number | null;
  readonly currentAvg?: number | null;
  readonly powerFactorAvg?: number | null;
  readonly providerCreditBalance?: number | null;
  readonly state: 'on' | 'off' | 'fault';
  readonly type: 'customer' | 'totalizer';
  readonly energyInterpretation?: 'provider_total_unknown_semantics';
}

/** Validate telemetry without inventing provider semantics. */
export declare function requireTelemetryReading(reading: unknown): CanonicalTelemetryReading & {
  readonly energyInterpretation: 'provider_total_unknown_semantics';
};

/** Connection probe; never certifies an installation alone. */
export type ConnectionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/** Every provider adapter must implement Beverly's core operations. */
export interface MeterOemAdapter {
  capabilities(): CapabilityManifest;
  testConnection(): Promise<ConnectionResult>;
  listStations(query: PageQuery): Promise<Page<CanonicalStation>>;
  findMeter(input: MeterLookup): Promise<CanonicalMeter>;
  vend(command: VendCommand): Promise<VendOutcome>;
  getVendStatus(query: VendStatusQuery): Promise<VendOutcome>;
}
