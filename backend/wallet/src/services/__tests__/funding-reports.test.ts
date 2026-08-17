import { describe, expect, it, vi } from 'vitest';

const storageError = new Error('funding storage unavailable');

function failedQuery() {
    const query: any = new Proxy({}, {
        get: (_target, property) => {
            if (property === 'then') {
                return (resolve: (value: unknown) => void) => resolve({ data: null, error: storageError });
            }
            return () => query;
        },
    });
    return query;
}

vi.mock('../../db/supabase.js', () => ({
    adminClient: { from: () => failedQuery() },
}));

import { listPendingFunding, listVendorFunding } from '../funding.js';

describe('funding report service seam', () => {
    it('surfaces vendor funding query failures', async () => {
        await expect(listVendorFunding('vendor-1')).rejects.toThrow('funding storage unavailable');
    });

    it('surfaces pending funding query failures', async () => {
        await expect(listPendingFunding()).rejects.toThrow('funding storage unavailable');
    });
});
