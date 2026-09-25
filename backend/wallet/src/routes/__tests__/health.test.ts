import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

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

import healthRoutes from '../health.js';

describe('readiness', () => {
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
