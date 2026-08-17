import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryError = new Error('financial storage unavailable');

function failedQuery() {
    const query: any = new Proxy({}, {
        get: (_target, property) => {
            if (property === 'then') {
                return (resolve: (value: unknown) => void) => resolve({ data: null, error: queryError });
            }
            return () => query;
        },
    });
    return query;
}

vi.mock('../../db/supabase.js', () => ({
    adminClient: { from: () => failedQuery() },
}));

vi.mock('../../services/wallets.js', () => ({
    findWalletByOwner: vi.fn(async () => ({
        id: 'wallet-1',
        currency: 'NGN',
        status: 'active',
        daily_debit_cap_minor: null,
        monthly_debit_cap_minor: null,
    })),
}));

vi.mock('../../services/notifications.js', () => ({
    notifyTokenPurchased: vi.fn(async () => undefined),
}));

vi.mock('../../queue/index.js', () => ({
    exportsQueue: { add: vi.fn(async () => undefined) },
    notificationsQueue: { add: vi.fn(async () => undefined) },
}));

import customerRoutes from '../customer.js';

async function createApp() {
    const app = Fastify();
    app.decorate('requireCustomer', () => async (req: any) => {
        req.actor = { userId: 'user-1', customerId: 'customer-1', role: 'customer' };
    });
    app.decorate('requireKycTier', () => async (req: any) => {
        req.actor = { userId: 'user-1', customerId: 'customer-1', role: 'customer' };
    });
    await app.register(customerRoutes);
    return app;
}

describe('customer financial report HTTP seam', () => {
    let app: Awaited<ReturnType<typeof createApp>>;

    beforeEach(async () => {
        app = await createApp();
    });

    it('does not report an empty ledger when storage fails', async () => {
        const response = await app.inject({ method: 'GET', url: '/wallet/ledger' });
        expect(response.statusCode).toBe(500);
        expect(response.json()).not.toEqual({ entries: [] });
        await app.close();
    });

    it('does not report zero balances when storage fails', async () => {
        const response = await app.inject({ method: 'GET', url: '/wallet' });
        expect(response.statusCode).toBe(500);
        await app.close();
    });

    it('does not report empty funding when storage fails', async () => {
        const response = await app.inject({ method: 'GET', url: '/funding' });
        expect(response.statusCode).toBe(500);
        expect(response.json()).not.toMatchObject({ funding: [] });
        await app.close();
    });

    it('does not report empty receipts when storage fails', async () => {
        const response = await app.inject({ method: 'GET', url: '/receipts' });
        expect(response.statusCode).toBe(500);
        expect(response.json()).not.toMatchObject({ receipts: [] });
        await app.close();
    });

    it('does not report missing receipts when storage fails', async () => {
        const response = await app.inject({ method: 'GET', url: '/receipts/order-1' });
        expect(response.statusCode).toBe(500);
        await app.close();
    });
});
