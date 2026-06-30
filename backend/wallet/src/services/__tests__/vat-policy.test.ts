import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    from: vi.fn(),
}));

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: mocks.from,
    },
}));

import { approveVatPolicy, resolveVatRateBasisPoints } from '../vat-policy.js';

function query(result: unknown) {
    const chain: Record<string, any> = {};
    for (const method of ['select', 'eq', 'lte', 'order', 'limit', 'update']) {
        chain[method] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn(async () => ({ data: result, error: null }));
    chain.single = vi.fn(async () => ({ data: result, error: null }));
    return chain;
}

describe('VAT policy runtime', () => {
    beforeEach(() => {
        mocks.from.mockReset();
    });

    it('resolves the latest approved policy', async () => {
        mocks.from.mockReturnValueOnce(query({ rate_basis_points: 825 }));
        await expect(resolveVatRateBasisPoints(new Date('2026-06-24T12:00:00Z'))).resolves.toBe(825);
    });

    it('enforces maker-checker approval', async () => {
        mocks.from.mockReturnValueOnce(query({
            id: 'policy-1',
            status: 'pending',
            submitted_by: 'staff-1',
        }));
        await expect(approveVatPolicy('policy-1', 'staff-1'))
            .rejects.toThrow('different finance checker');
    });

    it('approves pending policies safely', async () => {
        const approved = {
            id: 'policy-1',
            label: 'Nigeria VAT 7.5%',
            rate_basis_points: 750,
            effective_at: '2026-07-01T00:00:00Z',
            status: 'approved',
            submitted_by: 'staff-1',
            approved_by: 'staff-2',
            approved_at: '2026-06-30T00:00:00Z',
        };
        mocks.from
            .mockReturnValueOnce(query({
                id: 'policy-1',
                status: 'pending',
                submitted_by: 'staff-1',
            }))
            .mockReturnValueOnce(query(approved));
        await expect(approveVatPolicy('policy-1', 'staff-2')).resolves.toMatchObject({
            id: 'policy-1',
            status: 'approved',
            approved_by: 'staff-2',
        });
    });
});
