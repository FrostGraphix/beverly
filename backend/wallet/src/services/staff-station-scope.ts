import type { FastifyRequest } from 'fastify';

export const ALL_STATIONS_SCOPE = '*';

export function normalizeStaffStationIds(values: unknown[]): string[] {
    const normalized = [...new Set(values
        .map((value) => String(value ?? '').trim().toUpperCase())
        .filter(Boolean))];
    return normalized.includes(ALL_STATIONS_SCOPE) ? [ALL_STATIONS_SCOPE] : normalized;
}

/** null means estate-wide access; [] means the staff account is unassigned. */
export function staffStations(req: FastifyRequest): string[] | null {
    if (req.actor?.role === 'super-admin') return null;
    const stations = normalizeStaffStationIds(req.actor?.stationIds ?? [req.actor?.stationId]);
    return stations.includes(ALL_STATIONS_SCOPE) ? null : stations;
}

export function hasAllStationsScope(stationIds: unknown): boolean {
    return Array.isArray(stationIds)
        && stationIds.some((value) => String(value ?? '').trim() === ALL_STATIONS_SCOPE);
}
