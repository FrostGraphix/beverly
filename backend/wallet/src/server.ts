/**
 * Beverly Wallet Backend — entry point.
 *
 * Boots Fastify with:
 *   • Helmet (security headers)
 *   • CORS (whitelisted origins)
 *   • Rate limit (Redis-backed)
 *   • JWT auth plugin
 *   • Error handler
 *   • Routes
 *
 * Graceful shutdown on SIGTERM/SIGINT closes Fastify + BullMQ + Redis cleanly.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { env, isCorsOriginAllowed, isDev } from './config/env.js';
import authPlugin from './plugins/auth.js';
import auditTap from './plugins/audit-tap.js';
import errorHandler from './plugins/error-handler.js';
import routes from './routes/index.js';
import { redisConnection, closeQueues } from './queue/index.js';
import { startScheduler } from './jobs/scheduler.js';

async function build() {
    const app = Fastify({
        logger: {
            level: env.LOG_LEVEL,
            transport: isDev
                ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } }
                : undefined,
        },
        trustProxy: true,
        disableRequestLogging: false,
        genReqId: (req) =>
            (req.headers['x-correlation-id'] as string | undefined) ?? crypto.randomUUID(),
    });

    // Security
    await app.register(helmet, { contentSecurityPolicy: false });

    // CORS
    await app.register(cors, {
        origin: (origin, cb) => {
            if (isCorsOriginAllowed(origin)) {
                cb(null, true);
            } else {
                cb(new Error('CORS not allowed'), false);
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });

    // Rate limit. In development we intentionally use Fastify's in-memory
    // store so a missing local Redis service cannot block every request.
    const rateLimitOptions: Parameters<typeof rateLimit>[1] = {
        max: 200,
        timeWindow: '1 minute',
        keyGenerator: (req) => (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip,
    };
    if (!isDev) rateLimitOptions.redis = redisConnection;
    await app.register(rateLimit, rateLimitOptions);

    await app.register(sensible);
    await app.register(errorHandler);
    await app.register(authPlugin);
    await app.register(auditTap);
    await app.register(routes);

    return app;
}

async function main() {
    const app = await build();

    const shutdown = async (signal: string) => {
        app.log.info({ signal }, 'shutdown initiated');
        try {
            await app.close();
            await closeQueues();
            app.log.info('shutdown complete');
            process.exit(0);
        } catch (err) {
            app.log.error({ err }, 'shutdown error');
            process.exit(1);
        }
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));

    try {
        await app.listen({ port: env.PORT, host: '0.0.0.0' });
        startScheduler();
    } catch (err) {
        app.log.error({ err }, 'failed to start');
        process.exit(1);
    }
}

void main();
