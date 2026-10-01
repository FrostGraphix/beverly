import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
    PAYSTACK_PAYMENTS_ENABLED: false,
    PAYSTACK_SECRET_KEY: undefined as string | undefined,
    PAYSTACK_PUBLIC_KEY: undefined as string | undefined,
    PAYSTACK_WEBHOOK_URL: undefined as string | undefined,
}));

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: () => ({
            select: () => ({
                limit: async () => ({ data: [], error: null }),
            }),
        }),
    },
}));

vi.mock('../../queue/index.js', () => ({
    queuesEnabled: false,
    redisConnection: { ping: vi.fn() },
}));

vi.mock('../../config/env.js', () => ({
    env: mockEnv,
}));

import healthRoutes from '../health.js';

describe('readiness', () => {
    beforeEach(() => {
        mockEnv.PAYSTACK_PAYMENTS_ENABLED = false;
        mockEnv.PAYSTACK_SECRET_KEY = undefined;
        mockEnv.PAYSTACK_PUBLIC_KEY = undefined;
        mockEnv.PAYSTACK_WEBHOOK_URL = undefined;
    });

    it('rejects traffic when enabled Paystack credentials are unavailable', async () => {
        mockEnv.PAYSTACK_PAYMENTS_ENABLED = true;
        mockEnv.PAYSTACK_WEBHOOK_URL = 'https://example.test/api/v1/webhook/paystack';
        const app = Fastify();
        await app.register(healthRoutes);
        const response = await app.inject({ method: 'GET', url: '/ready' });
        await app.close();

        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({
            status: 'degraded',
            checks: {
                paystack: { ok: false, mode: 'required', error: 'credentials_unavailable' },
            },
        });
    });

    it('accepts intentional serverless queue mode', async () => {
        const app = Fastify();
        await app.register(healthRoutes);
        const response = await app.inject({ method: 'GET', url: '/ready' });
        await app.close();

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            status: 'ready',
            checks: {
                database: { ok: true },
                redis: { ok: true, mode: 'disabled' },
            },
        });
    });
});
