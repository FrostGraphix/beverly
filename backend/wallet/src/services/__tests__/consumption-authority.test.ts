import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cross-tenant isolation proofs for the consumption engine.
 *
 * The regression these lock down: queryConsumption used to take an optional
 * `scope_id`, and `scope: 'meter'` with no scope_id applied NO filter at all —
 * returning every meter in every station. Authority is now a required argument,
 * so the leak is unreachable; these tests assert that stays true.
 */

interface Row {
    station_id: string;
    meter_id: string;
    customer_id: string | null;
    customer_name: string | null;
    period_type: string;
    period_start: string;
    kwh_total: number;
    reading_count: number;
    last_refreshed_at: string;
}

const AGGREGATES: Row[] = [
    row('TUNGA', 'M-T1', 'C-1', 'Ada', 100),
    row('TUNGA', 'M-T2', 'C-2', 'Bala', 200),
    row('MUSHA', 'M-M1', 'C-3', 'Chi', 300),
    row('OGUFA', 'M-O1', 'C-4', 'Dele', 400),
];

function row(station: string, meter: string, customerId: string, name: string, kwh: number): Row {
    return {
        station_id: station,
        meter_id: meter,
        customer_id: customerId,
        customer_name: name,
        period_type: 'month',
        period_start: '2026-07-01',
        kwh_total: kwh,
        reading_count: 30,
        last_refreshed_at: '2026-07-17T00:00:00.000Z',
    };
}

const PURCHASES = [
    { meter_id: 'M-T1', station_id: 'TUNGA', amount_minor: 500_00, created_at: '2026-07-05T10:00:00Z', status: 'delivered' },
    { meter_id: 'M-M1', station_id: 'MUSHA', amount_minor: 900_00, created_at: '2026-07-06T10:00:00Z', status: 'delivered' },
];

/** Minimal PostgREST-shaped builder honouring .in()/.eq() so filters are real. */
function makeBuilder(table: string) {
    const filters: Array<(r: any) => boolean> = [];
    let from = 0;
    let to = Number.MAX_SAFE_INTEGER;
    const builder: any = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        gte: (col: string, val: string) => { filters.push((r) => String(r[col]) >= val); return builder; },
        lte: (col: string, val: string) => { filters.push((r) => String(r[col]) <= val); return builder; },
        eq: (col: string, val: any) => { filters.push((r) => String(r[col]) === String(val)); return builder; },
        in: (col: string, vals: any[]) => { filters.push((r) => vals.map(String).includes(String(r[col]))); return builder; },
        range: (start: number, end: number) => { from = start; to = end; return builder; },
        then: (resolve: any) => {
            const source = table === 'meter_consumption_aggregates' ? AGGREGATES : PURCHASES;
            return resolve({ data: source.filter((r) => filters.every((f) => f(r))).slice(from, to + 1), error: null });
        },
    };
    return builder;
}

vi.mock('../../db/supabase.js', () => ({
    adminClient: { from: (table: string) => makeBuilder(table), rpc: async () => ({ data: null, error: null }) },
}));

import {
    allStations,
    metersAuthority,
    queryConsumption,
    stationsAuthority,
    queryMeterBreakdown,
} from '../consumption.js';

const monthly = { scope: 'meter' as const, period_type: 'month' as const };

describe('consumption authority isolation', () => {
    beforeEach(() => vi.clearAllMocks());

    it('super-admin authority sees every station', async () => {
        const rows = await queryConsumption(monthly, allStations());
        expect(rows.map((r) => r.meter_id).sort()).toEqual(['M-M1', 'M-O1', 'M-T1', 'M-T2']);
    });

    it('station-scoped staff never see another station', async () => {
        const rows = await queryConsumption(monthly, stationsAuthority(['TUNGA']));
        expect(rows.map((r) => r.meter_id).sort()).toEqual(['M-T1', 'M-T2']);
        expect(rows.some((r) => r.station_id !== 'TUNGA')).toBe(false);
    });

    it('multi-station staff see exactly their assignment', async () => {
        const rows = await queryConsumption(monthly, stationsAuthority(['TUNGA', 'MUSHA']));
        expect([...new Set(rows.map((r) => r.station_id))].sort()).toEqual(['MUSHA', 'TUNGA']);
    });

    // The core regression: omitting scope_id must not widen authority.
    it('omitted scope_id does NOT leak other stations', async () => {
        const rows = await queryConsumption({ ...monthly, scope_id: undefined }, stationsAuthority(['TUNGA']));
        expect(rows.every((r) => r.station_id === 'TUNGA')).toBe(true);
        expect(rows).toHaveLength(2);
    });

    it('a scope_id outside authority yields nothing, not the other station', async () => {
        const rows = await queryConsumption({ ...monthly, scope_id: 'M-M1' }, stationsAuthority(['TUNGA']));
        expect(rows).toEqual([]);
    });

    it('customer sees only their own meters', async () => {
        const rows = await queryConsumption(monthly, metersAuthority(['M-T1']));
        expect(rows.map((r) => r.meter_id)).toEqual(['M-T1']);
    });

    it('customer cannot reach a meter they do not own via scope_id', async () => {
        const rows = await queryConsumption({ ...monthly, scope_id: 'M-O1' }, metersAuthority(['M-T1']));
        expect(rows).toEqual([]);
    });

    it('empty authority resolves to nothing, never everything', async () => {
        expect(await queryConsumption(monthly, stationsAuthority([]))).toEqual([]);
        expect(await queryConsumption(monthly, metersAuthority([]))).toEqual([]);
    });

    it('blank and whitespace ids collapse to an empty authority', async () => {
        expect(await queryConsumption(monthly, stationsAuthority(['', '   ']))).toEqual([]);
        expect(await queryConsumption(monthly, metersAuthority(['', '  ']))).toEqual([]);
    });

    it('station authority is case-insensitive', async () => {
        const rows = await queryConsumption(monthly, stationsAuthority(['tunga']));
        expect(rows).toHaveLength(2);
    });

    it('meter breakdown intersects the requested station with authority', async () => {
        const allowed = await queryMeterBreakdown('TUNGA', 'month', stationsAuthority(['TUNGA']));
        expect(allowed).toHaveLength(2);

        const denied = await queryMeterBreakdown('MUSHA', 'month', stationsAuthority(['TUNGA']));
        expect(denied).toEqual([]);
    });
});

describe('consumption correctness', () => {
    it('groups every aggregate page before limiting output', async () => {
        const originalLength = AGGREGATES.length;
        AGGREGATES.push(...Array.from({ length: 1001 }, (_, i) => row('TUNGA', `M-X${i}`, 'C-X', 'Extra', 1)));
        try {
            const rows = await queryConsumption({ scope: 'station', period_type: 'month', limit: 1 }, stationsAuthority(['TUNGA']));
            expect(rows[0]!.kwh_total).toBe(1301);
        } finally {
            AGGREGATES.splice(originalLength);
        }
    });

    it('station scope aggregates meters and drops per-meter identity', async () => {
        const rows = await queryConsumption({ scope: 'station', period_type: 'month' }, stationsAuthority(['TUNGA']));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.kwh_total).toBe(300);       // 100 + 200
        expect(rows[0]!.reading_count).toBe(60);    // 30 + 30
        expect(rows[0]!.meter_id).toBeUndefined();
        expect(rows[0]!.customer_name).toBeUndefined();
    });

    it('cumulative scope rolls every authorised station into one series', async () => {
        const rows = await queryConsumption({ scope: 'cumulative', period_type: 'month' }, allStations());
        expect(rows).toHaveLength(1);
        expect(rows[0]!.scope_id).toBe('ALL');
        expect(rows[0]!.kwh_total).toBe(1000);
    });

    it('reports real naira spend instead of a hardcoded zero', async () => {
        const rows = await queryConsumption({ ...monthly, withSpend: true }, metersAuthority(['M-T1']));
        expect(rows[0]!.amount_minor_total).toBe(500_00);
    });

    it('sums every delivered purchase page', async () => {
        const originalLength = PURCHASES.length;
        PURCHASES.push(...Array.from({ length: 1001 }, () => ({
            meter_id: 'M-T1', station_id: 'TUNGA', amount_minor: 1,
            created_at: '2026-07-07T10:00:00Z', status: 'delivered',
        })));
        try {
            const rows = await queryConsumption({ ...monthly, withSpend: true }, metersAuthority(['M-T1']));
            expect(rows[0]!.amount_minor_total).toBe(510_01);
        } finally {
            PURCHASES.splice(originalLength);
        }
    });

    it('spend stays scoped — a customer sees no spend from other meters', async () => {
        const rows = await queryConsumption({ ...monthly, withSpend: true }, metersAuthority(['M-T2']));
        expect(rows[0]!.amount_minor_total).toBe(0);
    });

    it('vendor meter-level view exposes customer identity at their own site', async () => {
        const rows = await queryConsumption(monthly, stationsAuthority(['TUNGA']));
        expect(rows.map((r) => r.customer_name).sort()).toEqual(['Ada', 'Bala']);
    });
});
