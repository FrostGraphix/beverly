import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalScanCommand = process.env.PROFILE_PICTURE_SCAN_COMMAND;

afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalScanCommand === undefined) delete process.env.PROFILE_PICTURE_SCAN_COMMAND;
    else process.env.PROFILE_PICTURE_SCAN_COMMAND = originalScanCommand;
});

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
                fileScanning: { ok: true, mode: 'disabled' },
            },
        });
    });

    it('rejects production readiness without malware scanning', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.PROFILE_PICTURE_SCAN_COMMAND;
        const app = Fastify();
        await app.register(healthRoutes);
        const response = await app.inject({ method: 'GET', url: '/ready' });
        await app.close();

        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({
            status: 'degraded',
            checks: { fileScanning: { ok: false, mode: 'required', error: 'scanner_not_configured' } },
        });
    });

    it('accepts production readiness when a scanner is configured', async () => {
        process.env.NODE_ENV = 'production';
        process.env.PROFILE_PICTURE_SCAN_COMMAND = 'scanner';
        const app = Fastify();
        await app.register(healthRoutes);
        const response = await app.inject({ method: 'GET', url: '/ready' });
        await app.close();

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            status: 'ready',
            checks: { fileScanning: { ok: true, mode: 'required' } },
        });
    });
});
