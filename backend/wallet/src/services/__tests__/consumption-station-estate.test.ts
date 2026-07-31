import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The "all stationID" contract.
 *
 * The regression these lock down: the refreshable estate was the hardcoded
 * constant ['KYAKALE','MUSHA','UMAISHA','TUNGA','OGUFA']. Onboarding a sixth
 * station left its aggregates permanently stale — every consumption page in
 * the portal then showed that station as flat zero, indistinguishable from a
 * site with no usage. The estate now comes from the database.
 */

interface AggregateRow {
    station_id: string;
    meter_id: string;
    customer_id: string | null;
    customer_name: string | null;
    period_type: string;
    period_start: string;
    kwh_total: number;
    reading_count: number;
    tariff_value_ngn: number;
    priced_kwh: number;
    unpriced_kwh: number;
    last_refreshed_at: string;
}

function agg(station: string, meter: string, period: string, kwh: number, valueNgn = 0): AggregateRow {
    return {
        station_id: station,
        meter_id: meter,
        customer_id: `C-${meter}`,
        customer_name: `Cust ${meter}`,
        period_type: 'month',
        period_start: period,
        kwh_total: kwh,
        reading_count: 10,
        tariff_value_ngn: valueNgn,
        priced_kwh: valueNgn > 0 ? kwh : 0,
        unpriced_kwh: valueNgn > 0 ? 0 : kwh,
        last_refreshed_at: '2026-07-29T00:00:00.000Z',
    };
}

let AGGREGATES: AggregateRow[] = [];
let PURCHASES: any[] = [];
let DISCOVERED: string[] = [];
let discoveryError: string | null = null;
const refreshCalls: string[] = [];
const failingStations = new Set<string>();

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
    adminClient: {
        from: (table: string) => makeBuilder(table),
        rpc: async (name: string, args?: any) => {
            if (name === 'list_consumption_station_ids') {
                if (discoveryError) return { data: null, error: { message: discoveryError } };
                return { data: DISCOVERED.map((station_id) => ({ station_id })), error: null };
            }
            if (name === 'refresh_meter_reading_aggregates_for_station') {
                const station = String(args?.p_station_id ?? '');
                refreshCalls.push(station);
                if (failingStations.has(station)) return { data: null, error: { message: 'boom' } };
                return { data: { station }, error: null };
            }
            return { data: null, error: null };
        },
    },
}));

import {
    allStations,
    canonicalStationId,
    listConsumptionStationIds,
    queryConsumption,
    refreshConsumptionAggregates,
    stationsAuthority,
} from '../consumption.js';

beforeEach(() => {
    AGGREGATES = [];
    PURCHASES = [];
    DISCOVERED = [];
    discoveryError = null;
    refreshCalls.length = 0;
    failingStations.clear();
    vi.clearAllMocks();
});

describe('station estate discovery', () => {
    it('refreshes every station the database reports, not a hardcoded five', async () => {
        DISCOVERED = ['TUNGA', 'MUSHA', 'UMAISHA', 'KYAKALE', 'OGUFA', 'NEW-SITE'];
        const result = await refreshConsumptionAggregates();
        expect(refreshCalls.sort()).toEqual([...DISCOVERED].sort());
        expect(result.refreshedStations).toBe(6);
        expect(result.ok).toBe(true);
    });

    it('lists discovered stations canonically and without duplicates', async () => {
        DISCOVERED = [' tunga ', 'TUNGA', 'Musha'];
        expect(await listConsumptionStationIds()).toEqual(['MUSHA', 'TUNGA']);
    });

    it('falls back to the seed list when discovery fails, rather than refreshing nothing', async () => {
        discoveryError = 'registry unreachable';
        const result = await refreshConsumptionAggregates();
        expect(refreshCalls.sort()).toEqual(['KYAKALE', 'MUSHA', 'OGUFA', 'TUNGA', 'UMAISHA']);
        expect(result.refreshedStations).toBe(5);
    });

    it('an explicit station list is honoured verbatim and never widened', async () => {
        DISCOVERED = ['TUNGA', 'MUSHA', 'NEW-SITE'];
        await refreshConsumptionAggregates(['new-site']);
        expect(refreshCalls).toEqual(['NEW-SITE']);
    });

    it('reports partial failure honestly', async () => {
        DISCOVERED = ['TUNGA', 'MUSHA'];
        failingStations.add('MUSHA');
        const result = await refreshConsumptionAggregates();
        expect(result.ok).toBe(false);
        expect(result.failedStations).toBe(1);
        expect(result.refreshedStations).toBe(1);
        expect(result.stations.find((s) => s.stationId === 'MUSHA')?.error).toBe('boom');
    });
});

describe('station id canonicalisation', () => {
    it('collapses casing and padding to one id', () => {
        expect(canonicalStationId(' tunga ')).toBe('TUNGA');
        expect(canonicalStationId(null)).toBe('');
    });

    it('a station stored in mixed case is one row, not two', async () => {
        AGGREGATES = [
            agg('TUNGA', 'M-1', '2026-07-01', 100),
            agg('tunga', 'M-2', '2026-07-01', 50),
        ];
        // Authority uppercases, so the mixed-case row is reachable only if the
        // caller is unscoped — which is exactly where the split used to show.
        const rows = await queryConsumption({ scope: 'station', period_type: 'month' }, allStations());
        expect(rows).toHaveLength(1);
        expect(rows[0]!.scope_id).toBe('TUNGA');
        expect(rows[0]!.kwh_total).toBe(150);
    });
});

describe('period-complete trimming', () => {
    it('never returns a period that is missing stations the caller may see', async () => {
        AGGREGATES = [
            agg('A', 'M-A', '2026-07-01', 10),
            agg('B', 'M-B', '2026-07-01', 20),
            agg('C', 'M-C', '2026-07-01', 30),
            agg('A', 'M-A', '2026-06-01', 40),
            agg('B', 'M-B', '2026-06-01', 50),
        ];
        // limit 4 would slice mid-June, making June look like one station.
        const rows = await queryConsumption(
            { scope: 'station', period_type: 'month', limit: 4 },
            stationsAuthority(['A', 'B', 'C']),
        );
        expect(new Set(rows.map((r) => r.period_start))).toEqual(new Set(['2026-07-01']));
        expect(rows).toHaveLength(3);
    });

    it('still returns rows when a single period is wider than the limit', async () => {
        AGGREGATES = [
            agg('A', 'M-A', '2026-07-01', 10),
            agg('B', 'M-B', '2026-07-01', 20),
        ];
        const rows = await queryConsumption(
            { scope: 'station', period_type: 'month', limit: 1 },
            stationsAuthority(['A', 'B']),
        );
        expect(rows).toHaveLength(1);
    });
});

describe('energy value', () => {
    // The regression this locks: every consumption page rendered "₦0.00"
    // because the service only ever reported wallet spend, while the aggregate
    // rows already carried ₦43m of tariff-valued consumption that nothing read.
    it('surfaces the stored tariff valuation as minor units', async () => {
        AGGREGATES = [agg('TUNGA', 'M-1', '2026-07-01', 10.49, 3671.5)];
        const rows = await queryConsumption({ scope: 'meter', period_type: 'month' }, stationsAuthority(['TUNGA']));
        expect(rows[0]!.energy_value_minor).toBe(367_150);
        expect(rows[0]!.priced_kwh).toBe(10.49);
        expect(rows[0]!.unpriced_kwh).toBe(0);
    });

    it('sums valuation across meters when grouping a station', async () => {
        AGGREGATES = [
            agg('TUNGA', 'M-1', '2026-07-01', 10, 1000),
            agg('TUNGA', 'M-2', '2026-07-01', 20, 2500.25),
        ];
        const rows = await queryConsumption({ scope: 'station', period_type: 'month' }, stationsAuthority(['TUNGA']));
        expect(rows[0]!.energy_value_minor).toBe(350_025);
    });

    it('keeps energy value and wallet spend as separate figures', async () => {
        AGGREGATES = [agg('TUNGA', 'M-1', '2026-07-01', 10, 1000)];
        PURCHASES = [];
        const rows = await queryConsumption(
            { scope: 'station', period_type: 'month', withSpend: true },
            stationsAuthority(['TUNGA']),
        );
        // Real consumption, no wallet purchases — the estate's actual state.
        expect(rows[0]!.energy_value_minor).toBe(100_000);
        expect(rows[0]!.amount_minor_total).toBe(0);
    });

    it('treats a missing valuation as zero rather than NaN', async () => {
        AGGREGATES = [{ ...agg('TUNGA', 'M-1', '2026-07-01', 5), tariff_value_ngn: null as any, priced_kwh: null as any, unpriced_kwh: null as any }];
        const rows = await queryConsumption({ scope: 'meter', period_type: 'month' }, stationsAuthority(['TUNGA']));
        expect(rows[0]!.energy_value_minor).toBe(0);
        expect(rows[0]!.priced_kwh).toBe(0);
    });
});

describe('station revenue', () => {
    it('counts orders for meters that have no readings yet', async () => {
        AGGREGATES = [agg('TUNGA', 'M-1', '2026-07-01', 100)];
        PURCHASES = [
            { id: 1, meter_id: 'M-1', station_id: 'TUNGA', amount_minor: 100_00, created_at: '2026-07-04T09:00:00Z', status: 'delivered' },
            // Sold at TUNGA, but this meter has never reported a reading. Its
            // naira still belongs in the station's revenue line.
            { id: 2, meter_id: 'M-UNSEEN', station_id: 'TUNGA', amount_minor: 250_00, created_at: '2026-07-05T09:00:00Z', status: 'delivered' },
        ];
        const rows = await queryConsumption(
            { scope: 'station', period_type: 'month', withSpend: true },
            stationsAuthority(['TUNGA']),
        );
        expect(rows[0]!.amount_minor_total).toBe(350_00);
    });

    it('matches spend onto a station whose orders are stored lower-case', async () => {
        AGGREGATES = [agg('TUNGA', 'M-1', '2026-07-01', 100)];
        PURCHASES = [
            { id: 1, meter_id: 'M-1', station_id: 'TUNGA', amount_minor: 100_00, created_at: '2026-07-04T09:00:00Z', status: 'delivered' },
        ];
        const rows = await queryConsumption(
            { scope: 'station', period_type: 'month', withSpend: true },
            stationsAuthority([' tunga ']),
        );
        expect(rows[0]!.scope_id).toBe('TUNGA');
        expect(rows[0]!.amount_minor_total).toBe(100_00);
    });

    it('station revenue stays inside authority', async () => {
        AGGREGATES = [agg('TUNGA', 'M-1', '2026-07-01', 100)];
        PURCHASES = [
            { id: 1, meter_id: 'M-9', station_id: 'MUSHA', amount_minor: 900_00, created_at: '2026-07-04T09:00:00Z', status: 'delivered' },
        ];
        const rows = await queryConsumption(
            { scope: 'station', period_type: 'month', withSpend: true },
            stationsAuthority(['TUNGA']),
        );
        expect(rows[0]!.amount_minor_total).toBe(0);
    });
});
