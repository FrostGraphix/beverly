import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: {
    runs: Record<string, any>;
    dbTxns: Array<{ amount_minor: number }>;
    gatewayPages: Array<Array<{ amount: number }>>;
    fetchCalls: string[];
} = {
    runs: {},
    dbTxns: [],
    gatewayPages: [],
    fetchCalls: [],
};

function makeBuilder(table: string) {
    const state: any = { table, filters: {}, updateData: null, upsertData: null };
    const builder: any = {
        select: () => builder,
        upsert: (data: any) => { state.upsertData = data; return builder; },
        update: (data: any) => { state.updateData = data; return builder; },
        eq: (column: string, value: any) => { state.filters[column] = value; return builder; },
        in: () => builder,
        gte: () => builder,
        lte: () => builder,
        order: () => builder,
        limit: () => builder,
        single: async () => {
            if (state.upsertData) {
                const id = `run-${state.upsertData.run_date}`;
                store.runs[id] = { id, ...state.upsertData };
                return { data: { id }, error: null };
            }
            const run = Object.values(store.runs).find((r: any) => r.run_date === state.filters.run_date);
            return { data: run ?? null, error: run ? null : { code: 'PGRST116' } };
        },
        then: (resolve: any) => {
            if (state.updateData && state.filters.id && store.runs[state.filters.id]) {
                Object.assign(store.runs[state.filters.id], state.updateData);
                return resolve({ data: null, error: null });
            }
            if (table === 'payment_transactions') {
                return resolve({ data: store.dbTxns, error: null });
            }
            return resolve({ data: null, error: null });
        },
    };
    return builder;
}

vi.mock('../../db/supabase.js', () => ({
    adminClient: { from: (table: string) => makeBuilder(table) },
}));

import { runDailyReconciliation } from '../reconciliation.js';

function stubFetch() {
    vi.stubGlobal('fetch', async (url: string) => {
        store.fetchCalls.push(String(url));
        const page = Number(new URL(String(url)).searchParams.get('page') || 1);
        const data = store.gatewayPages[page - 1] ?? [];
        return { json: async () => ({ status: true, data }) } as any;
    });
}

describe('daily reconciliation', () => {
    beforeEach(() => {
        store.runs = {};
        store.dbTxns = [];
        store.gatewayPages = [];
        store.fetchCalls = [];
        process.env.PAYSTACK_SECRET_KEY = 'sk_test_x';
        stubFetch();
    });

    it('sums every gateway page, not just the first', async () => {
        store.dbTxns = Array.from({ length: 250 }, () => ({ amount_minor: 100_00 }));
        store.gatewayPages = [
            Array.from({ length: 200 }, () => ({ amount: 100_00 })),
            Array.from({ length: 50 }, () => ({ amount: 100_00 })),
        ];
        await runDailyReconciliation('2026-07-14');
        const run: any = Object.values(store.runs)[0];
        expect(store.fetchCalls.length).toBe(2);
        expect(run.gateway_total_minor).toBe(250 * 100_00);
        expect(run.mismatch_minor).toBe(0);
        expect(run.status).toBe('ok');
    });

    it('raises mismatch when the delta crosses the alert threshold', async () => {
        store.dbTxns = [{ amount_minor: 100_00 }];
        store.gatewayPages = [[{ amount: 2_100_000_00 }]];
        await runDailyReconciliation('2026-07-14');
        const run: any = Object.values(store.runs)[0];
        expect(run.status).toBe('mismatch');
        expect(run.notes).toContain('Delta');
    });

    it('marks the run as gateway-unverified when the key is missing', async () => {
        delete process.env.PAYSTACK_SECRET_KEY;
        store.dbTxns = [{ amount_minor: 100_00 }];
        await runDailyReconciliation('2026-07-14');
        const run: any = Object.values(store.runs)[0];
        expect(run.status).toBe('ok');
        expect(run.gateway_total_minor).toBeNull();
        expect(run.notes).toContain('gateway unverified');
    });

    it('skips a date that already reconciled ok', async () => {
        store.runs['run-2026-07-14'] = { id: 'run-2026-07-14', run_date: '2026-07-14', status: 'ok' };
        await runDailyReconciliation('2026-07-14');
        expect(store.fetchCalls.length).toBe(0);
    });
});
