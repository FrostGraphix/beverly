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
import { env } from './config/env.js';
import { build } from './app.js';
import { closeQueues } from './queue/index.js';
import { startScheduler } from './jobs/scheduler.js';
import { startNotificationsWorker, closeNotificationsWorker } from './workers/notifications-worker.js';

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

void main();
