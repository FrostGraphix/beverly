/**
 * Fastify app builder — shared by the long-running server (server.ts) and the
 * serverless entrypoint (api/wallet.mjs on Vercel).
 *
 * build() constructs and returns the app WITHOUT listening, starting the
 * scheduler, or starting background workers — so it is safe to import from a
 * serverless function. server.ts wraps this with listen() + workers for the
 * container / local-dev process.
 *
 * Serverless mode (VERCEL / SERVERLESS env, or explicit flag) forces the
 * in-memory rate-limit store instead of Redis, since a serverless invocation
 * has no persistent Redis connection to rely on.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { env, isCorsOriginAllowed, isDev } from './config/env.js';
import authPlugin from './plugins/auth.js';
import auditTap from './plugins/audit-tap.js';
import errorHandler from './plugins/error-handler.js';
import routes from './routes/index.js';

export function isServerless(): boolean {
    return Boolean(process.env.VERCEL) || process.env.SERVERLESS === '1' || process.env.SERVERLESS === 'true';
}

export interface BuildOptions {
    /** Force in-memory rate limiting (default: auto — true under serverless). */
    inMemoryRateLimit?: boolean;
}

export async function build(options: BuildOptions = {}): Promise<FastifyInstance> {
    const serverless = isServerless();
    const useInMemoryRateLimit = options.inMemoryRateLimit ?? serverless;

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

    // Rate limit. In development — and in serverless invocations that have no
    // persistent Redis — use Fastify's in-memory store. A long-running
    // production server uses the shared Redis connection.
    const rateLimitOptions: Parameters<typeof rateLimit>[1] = {
        max: 200,
        timeWindow: '1 minute',
        keyGenerator: (req) => (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip,
    };
    if (!isDev && !useInMemoryRateLimit) {
        const { redisConnection } = await import('./queue/index.js');
        rateLimitOptions.redis = redisConnection;
    }
    await app.register(rateLimit, rateLimitOptions);

    await app.register(sensible);
    await app.register(errorHandler);
    await app.register(authPlugin);
    await app.register(auditTap);
    await app.register(routes);

    return app;
}
