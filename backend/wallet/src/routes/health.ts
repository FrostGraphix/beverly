/**
 * Health + readiness endpoints.
 *   GET /health      — liveness (cheap)
 *   GET /ready       — readiness (verifies DB + Redis)
 *   GET /version     — build info
 */
import type { FastifyPluginAsync } from 'fastify';
import { adminClient } from '../db/supabase.js';
import { redisConnection } from '../queue/index.js';

const route: FastifyPluginAsync = async (fastify) => {
    fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

    fastify.get('/ready', async (_req, reply) => {
        const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

        // DB
        const dbStart = Date.now();
        try {
            const { error } = await adminClient.from('wallets').select('id').limit(1);
            checks.database = error
                ? { ok: false, error: error.message }
                : { ok: true, latencyMs: Date.now() - dbStart };
        } catch (e) {
            checks.database = { ok: false, error: (e as Error).message };
        }

        // Redis
        const redisStart = Date.now();
        try {
            const pong = await redisConnection.ping();
            checks.redis = pong === 'PONG'
                ? { ok: true, latencyMs: Date.now() - redisStart }
                : { ok: false, error: `unexpected ping reply: ${pong}` };
        } catch (e) {
            checks.redis = { ok: false, error: (e as Error).message };
        }

        const allOk = Object.values(checks).every((c) => c.ok);
        reply.code(allOk ? 200 : 503).send({ status: allOk ? 'ready' : 'degraded', checks });
        return undefined;
    });

    fastify.get('/version', async () => ({
        service: 'beverly-wallet-backend',
        version: process.env.npm_package_version ?? '0.1.0',
        node: process.version,
        env: process.env.NODE_ENV,
    }));
};

export default route;
