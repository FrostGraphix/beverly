import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ insertCalled: false, purchaseSelect: '' }));

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: (table: string) => {
            const state: { inserted?: boolean } = {};
            const builder: any = {
                select: (columns?: string) => {
                    if (table === 'purchase_orders') mocks.purchaseSelect = columns ?? '';
                    return builder;
                },
                eq: () => builder,
                gte: () => builder,
                lte: () => builder,
                insert: () => { state.inserted = true; mocks.insertCalled = true; return builder; },
                maybeSingle: async () => ({ data: null, error: null }),
                single: async () => ({ data: { id: 'batch-1' }, error: null }),
                then: (resolve: (value: any) => void) => {
                    if (table === 'purchase_orders' && !state.inserted) {
                        return resolve({ data: null, error: { message: 'database unavailable' } });
                    }
                    return resolve({ data: [], error: null });
                },
            };
            return builder;
        },
    },
}));

import { computeSettlementBatch } from '../settlement.js';

describe('settlement batches', () => {
    it('never writes a zero settlement when purchase loading fails', async () => {
        mocks.insertCalled = false;
        mocks.purchaseSelect = '';

        await expect(computeSettlementBatch(
            '11111111-1111-4111-8111-111111111111',
            '2026-08-15',
            '2026-08-15',
        )).rejects.toThrow('Settlement purchase query failed');

        expect(mocks.insertCalled).toBe(false);
        expect(mocks.purchaseSelect).toBe('amount_minor');
    });
});
