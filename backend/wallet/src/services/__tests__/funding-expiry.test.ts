import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: { funding: Record<string, any> } = { funding: {} };

function makeBuilder(table: string) {
    const state: any = { statusIn: null, notNullColumn: null, ltColumn: null, ltValue: null, updateData: null };
    const rows = () => {
        if (table !== 'funding_requests') return [];
        return Object.values(store.funding).filter((row: any) => {
            if (state.statusIn && !state.statusIn.includes(row.status)) return false;
            if (state.notNullColumn && row[state.notNullColumn] == null) return false;
            if (state.ltColumn && !(row[state.ltColumn] < state.ltValue)) return false;
            return true;
        });
    };
    const builder: any = {
        select: () => builder,
        update: (data: any) => { state.updateData = data; return builder; },
        in: (column: string, values: any[]) => {
            if (column === 'status') state.statusIn = values;
            if (column === 'id') state.idIn = values;
            return builder;
        },
        not: (column: string) => { state.notNullColumn = column; return builder; },
        lt: (column: string, value: any) => { state.ltColumn = column; state.ltValue = value; return builder; },
        limit: () => builder,
        then: (resolve: any) => {
            let target = rows();
            if (state.idIn) target = target.filter((row: any) => state.idIn.includes(row.id));
            if (state.updateData) for (const row of target) Object.assign(row, state.updateData);
            return resolve({ data: target, error: null });
        },
    };
    return builder;
}

vi.mock('../../db/supabase.js', () => ({
    adminClient: { from: (table: string) => makeBuilder(table) },
}));
vi.mock('../fraud-engine.js', () => ({ refreshCustomerBaseline: async () => undefined }));
vi.mock('../vending.js', () => ({ reconcileRemoteSendOrders: async () => ({ checked: 0 }) }));
vi.mock('../../adapters/paystack.js', () => ({ verifyTransaction: async () => ({ status: 'success' }) }));
vi.mock('../payment-transactions.js', () => ({ fulfillSuccessfulPaystackTransaction: async () => ({ status: 'fulfilled' }) }));

import { expireStaleFundingRequests } from '../../jobs/scheduler.js';

const PAST = '2026-07-01T00:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';

function seed() {
    store.funding = {
        'stale-initiated': { id: 'stale-initiated', status: 'initiated', expires_at: PAST },
        'stale-proof': { id: 'stale-proof', status: 'proof_uploaded', expires_at: PAST },
        'fresh-initiated': { id: 'fresh-initiated', status: 'initiated', expires_at: FUTURE },
        'stale-under-review': { id: 'stale-under-review', status: 'under_review', expires_at: PAST },
        'stale-approved': { id: 'stale-approved', status: 'approved', expires_at: PAST },
        'no-expiry': { id: 'no-expiry', status: 'initiated', expires_at: null },
    };
}

describe('expireStaleFundingRequests', () => {
    beforeEach(seed);

    it('expires unpaid requests past their expiry', async () => {
        await expireStaleFundingRequests();
        expect(store.funding['stale-initiated'].status).toBe('expired');
        expect(store.funding['stale-proof'].status).toBe('expired');
    });

    it('leaves requests that have not expired yet', async () => {
        await expireStaleFundingRequests();
        expect(store.funding['fresh-initiated'].status).toBe('initiated');
        expect(store.funding['no-expiry'].status).toBe('initiated');
    });

    it('never touches requests holding real money', async () => {
        // under_review means a payment landed and needs a human; approved is
        // already credited. A sweeper must not close either out.
        await expireStaleFundingRequests();
        expect(store.funding['stale-under-review'].status).toBe('under_review');
        expect(store.funding['stale-approved'].status).toBe('approved');
    });
});
