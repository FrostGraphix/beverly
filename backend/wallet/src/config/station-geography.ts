export interface StationGeography {
    state: 'Nasarawa' | 'Ondo' | 'Kaduna';
    country: 'Nigeria';
}

const STATION_GEOGRAPHY: Readonly<Record<string, StationGeography>> = Object.freeze({
    MUSHA: { state: 'Nasarawa', country: 'Nigeria' },
    OGUFA: { state: 'Nasarawa', country: 'Nigeria' },
    KYAKALE: { state: 'Nasarawa', country: 'Nigeria' },
    UMAISHA: { state: 'Nasarawa', country: 'Nigeria' },
    TUNGA: { state: 'Nasarawa', country: 'Nigeria' },
    BONDU: { state: 'Ondo', country: 'Nigeria' },
    KADUNA: { state: 'Kaduna', country: 'Nigeria' },
    'MILE 9 & 10': { state: 'Ondo', country: 'Nigeria' },
    'MILE 9': { state: 'Ondo', country: 'Nigeria' },
    'MILE_9': { state: 'Ondo', country: 'Nigeria' },
    'MILE 9 AND 10': { state: 'Ondo', country: 'Nigeria' },
});

function canonicalStationId(value: string): string {
    return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

export function stationGeography(stationId: string, name?: string): StationGeography | null {
    return STATION_GEOGRAPHY[canonicalStationId(stationId)]
        ?? STATION_GEOGRAPHY[canonicalStationId(name ?? '')]
        ?? null;
}
