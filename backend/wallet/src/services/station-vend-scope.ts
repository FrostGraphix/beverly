export type StationVendScopeErrorCode =
    | 'station_assignment_required'
    | 'meter_station_unavailable'
    | 'cross_station_vend_forbidden';

export class StationVendScopeError extends Error {
    constructor(message: string, public readonly code: StationVendScopeErrorCode) {
        super(message);
        this.name = 'StationVendScopeError';
    }
}

export function normalizeStationId(value: string | null | undefined): string {
    return String(value ?? '').trim().toUpperCase().replace(/[\s_\-&]+/g, '');
}

export function assertStationVendAllowed(
    assignedStationId: string | null | undefined,
    meterStationId: string | null | undefined,
): void {
    const assigned = normalizeStationId(assignedStationId);
    const meter = normalizeStationId(meterStationId);

    if (!assigned) {
        throw new StationVendScopeError(
            'Your station is not assigned. Contact Beverly support before vending.',
            'station_assignment_required',
        );
    }
    if (!meter || meter === 'UNKNOWN') {
        throw new StationVendScopeError(
            'The meter station could not be verified. No purchase was started.',
            'meter_station_unavailable',
        );
    }
    if (assigned !== meter) {
        throw new StationVendScopeError(
            `This meter belongs to ${meter}. Your account is assigned to ${assigned}.`,
            'cross_station_vend_forbidden',
        );
    }
}
