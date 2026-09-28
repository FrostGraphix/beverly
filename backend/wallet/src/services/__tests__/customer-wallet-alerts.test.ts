import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, sendWebPush, queueAdd } = vi.hoisted(() => ({
    from: vi.fn(), sendWebPush: vi.fn(), queueAdd: vi.fn(),
}));
vi.mock('../../db/supabase.js', () => ({ adminClient: { from } }));
vi.mock('../push-notifications.js', () => ({ sendWebPush }));
vi.mock('../../queue/index.js', () => ({ notificationsQueue: { add: queueAdd } }));

import { notifyTokenPurchased, notifyWalletFunded } from '../notifications.js';

describe('customer funding alerts', () => {
    beforeEach(() => {
        from.mockReset();
        sendWebPush.mockReset().mockResolvedValue({ sent: 0, failed: 0 });
        queueAdd.mockReset().mockResolvedValue({ id: 'job-1' });
    });

    it('stores a wallet credit in the deployed inbox schema', async () => {
        const stored: any[] = [];
        from.mockImplementation((table: string) => {
            if (table === 'customers') return {
                select: () => ({ eq: () => ({ maybeSingle: async () => ({
                    data: { id: 'customer-1', phone: null, email: null, full_name: 'Customer', notification_preferences: null },
                    error: null,
                }) }) }),
            };
            if (table === 'notifications') return {
                upsert: (row: any) => ({ select: () => ({ maybeSingle: async () => {
                    if (row.message !== row.body) return { data: null, error: new Error('null value in column "message"') };
                    stored.push(row);
                    return { data: { id: 'notice-1' }, error: null };
                } }) }),
            };
            throw new Error(`unexpected table: ${table}`);
        });

        await notifyWalletFunded('customer-1', { amountMinor: 5000000, reference: 'funding-1' });
        expect(stored).toHaveLength(1);
        expect(stored[0].body).toContain('₦50,000.00');
    });

    it('delivers without Redis on production serverless', async () => {
        const stored: any[] = [];
        queueAdd.mockRejectedValue(new Error('Redis queue disabled'));
        from.mockImplementation((table: string) => {
            if (table === 'customers') return {
                select: () => ({ eq: () => ({ maybeSingle: async () => ({
                    data: { id: 'customer-1', phone: null, email: null, full_name: 'Customer', notification_preferences: null },
                    error: null,
                }) }) }),
            };
            if (table === 'notifications') return {
                upsert: (row: any) => ({ select: () => ({ maybeSingle: async () => {
                    stored.push(row);
                    return { data: { id: 'notice-1' }, error: null };
                } }) }),
            };
            throw new Error(`unexpected table: ${table}`);
        });
        vi.stubEnv('NODE_ENV', 'production');
        try {
            await expect(notifyWalletFunded('customer-1', { amountMinor: 5000000, reference: 'funding-1' })).resolves.toBeUndefined();
            expect(stored).toHaveLength(1);
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it('stores one recharge alert after retried delivery', async () => {
        const stored: any[] = [];
        const save = (row: any) => ({ select: () => ({ maybeSingle: async () => {
            if (stored.some((existing) => existing.dedupe_key === row.dedupe_key && row.dedupe_key)) {
                return { data: null, error: null };
            }
            stored.push(row);
            return { data: { id: 'notice-1' }, error: null };
        }, single: async () => {
            stored.push(row);
            return { data: { id: `notice-${stored.length}` }, error: null };
        } }) });
        from.mockImplementation((table: string) => {
            if (table === 'customers') return {
                select: () => ({ eq: () => ({ maybeSingle: async () => ({
                    data: { id: 'customer-1', phone: null, email: null, full_name: 'Customer', notification_preferences: null },
                    error: null,
                }) }) }),
            };
            if (table === 'notifications') return { insert: save, upsert: save };
            throw new Error(`unexpected table: ${table}`);
        });
        const recharge = { purchaseOrderId: 'order-1', meterId: '47005375572', amountMinor: 100000, units: 2.6578 };
        await notifyTokenPurchased('customer-1', recharge);
        await notifyTokenPurchased('customer-1', recharge);
        expect(stored).toHaveLength(1);
        expect(stored[0].body).toContain('47005375572');
        expect(stored[0].body).not.toContain('1234');
        expect(stored[0].metadata).not.toHaveProperty('token');
    });
});
