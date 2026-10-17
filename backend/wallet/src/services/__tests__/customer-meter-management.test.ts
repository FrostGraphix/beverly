import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../../db/supabase.js', () => ({ adminClient: { from: mocks.from } }));
vi.mock('../audit.js', () => ({ logAction: vi.fn() }));

import { listCustomerMeters, unlinkMeter } from '../customer-purchase.js';

describe('customer meter management', () => {
    beforeEach(() => mocks.from.mockReset());

    it('lists every linked meter for one customer', async () => {
        const rows = [{ id: 'home', meter_id: '44120000001' }, { id: 'office', meter_id: '44120000002' }];
        mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ not: () => ({ order: async () => ({ data: rows, error: null }) }) }) }) });
        await expect(listCustomerMeters('customer-1')).resolves.toEqual(rows);
    });

    it('does not report an empty list when loading fails', async () => {
        mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ not: () => ({ order: async () => ({ data: null, error: { message: 'Database unavailable' } }) }) }) }) });
        await expect(listCustomerMeters('customer-1')).rejects.toThrow('Database unavailable');
    });

    it('does not report removal when deletion fails', async () => {
        mocks.from.mockReturnValue({
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'home', meter_id: '44120000001' }, error: null }) }) }) }),
            delete: () => ({ eq: () => ({ eq: async () => ({ error: { message: 'Database unavailable' } }) }) }),
        });
        await expect(unlinkMeter('customer-1', 'user-1', 'home')).rejects.toThrow('Database unavailable');
    });
});
