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
import { pathToFileURL } from 'node:url';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { corsOrigins, env, isCorsOriginAllowed, isDev } from './config/env.js';
import authPlugin from './plugins/auth.js';
import auditTap from './plugins/audit-tap.js';
import errorHandler from './plugins/error-handler.js';
import routes from './routes/index.js';
import { redisConnection, closeQueues } from './queue/index.js';
import { startScheduler } from './jobs/scheduler.js';
import { startNotificationsWorker, closeNotificationsWorker } from './workers/notifications-worker.js';

export async function build() {
    if (env.NODE_ENV === 'production' && corsOrigins.length === 0) {
        throw new Error('CORS_ORIGINS is required in production.');
    }
    const app = Fastify({
        logger: {
            level: env.LOG_LEVEL,
            transport: isDev
                ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } }
                : undefined,
        },
        trustProxy: isDev,
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
        keyGenerator: (req) => req.ip,
    };
    if (queuesEnabled) rateLimitOptions.redis = redisConnection;
    await app.register(rateLimit, rateLimitOptions);

    app.addHook('onRequest', async (req, reply) => {
        const method = req.method.toUpperCase();
        const pathname = req.url.split('?')[0] ?? req.url;
        const policy = resolveMutationRoutePolicy(method, pathname);
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && pathname.startsWith('/api/v1/') && !policy) {
            return reply.code(404).send({ error: 'route_policy_missing', message: 'This mutation route is not enabled.' });
        }
        if (policy?.developerOnly && (env.NODE_ENV === 'production' || !env.DEV_CONSOLE_ENABLED)) {
            return reply.code(404).send({ error: 'not_found', message: 'Route not found.' });
        }
        if (!env.MONEY_WRITES_ENABLED && policy?.money) {
            return reply.code(503).send({
                error: 'money_writes_disabled',
                message: 'Money writes are disabled for this deployment.',
            });
        }
        return undefined;
    });

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
            await closeNotificationsWorker();
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
        startNotificationsWorker();
    } catch (err) {
        app.log.error({ err }, 'failed to start');
        process.exit(1);
    }
}

const invokedAsScript = process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) void main();
