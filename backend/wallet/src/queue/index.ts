/**
 * BullMQ queue scaffold.
 *
 * Queues:
 *   • notifications  — outbound SMS/email/push
 *   • payments       — gateway status sweepers, refund retries
 *   • holds          — hold-expiry sweeper trigger
 *   • audit          — non-blocking audit writes (rare; most are sync)
 *
 * Workers are wired in src/workers/* — kept separate so they can run as
 * dedicated processes in production.
 */
import { Queue, QueueEvents, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';

export const queuesEnabled = process.env.WALLET_SERVERLESS !== 'true'
    && (env.NODE_ENV !== 'development' || process.env.ENABLE_REDIS_QUEUES === 'true');

function disabledQueue(name: string): Queue {
    return {
        async add() {
            throw new Error(`Redis queue "${name}" is disabled in development. Set ENABLE_REDIS_QUEUES=true to enable it.`);
        },
        async close() {},
    } as unknown as Queue;
}

const connection = queuesEnabled
    ? new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })
    : ({
        async ping() {
            throw new Error('Redis queues are disabled in development.');
        },
        async quit() {},
    } as unknown as IORedis);

if (queuesEnabled) {
    connection.on('error', (err) => {
        console.error('[redis] queue connection error:', err);
    });
}

// BullMQ bundles its own ioredis copy, so its ConnectionOptions type does not
// structurally match our top-level ioredis instance. The runtime object is
// identical; this cast reconciles the duplicated type at the BullMQ boundary.
const bullConnection = connection as unknown as ConnectionOptions;

export const notificationsQueue = queuesEnabled
    ? new Queue('notifications', { connection: bullConnection, defaultJobOptions: retryOpts(3) })
    : disabledQueue('notifications');

export const paymentsQueue = queuesEnabled
    ? new Queue('payments', { connection: bullConnection, defaultJobOptions: retryOpts(5) })
    : disabledQueue('payments');

export const holdsQueue = queuesEnabled
    ? new Queue('holds', { connection: bullConnection, defaultJobOptions: retryOpts(3) })
    : disabledQueue('holds');

export const auditQueue = queuesEnabled
    ? new Queue('audit', { connection: bullConnection, defaultJobOptions: retryOpts(0) })
    : disabledQueue('audit');

export const complianceQueue = queuesEnabled
    ? new Queue('compliance', { connection: bullConnection, defaultJobOptions: retryOpts(5) })
    : disabledQueue('compliance');

export const notificationsEvents = queuesEnabled
    ? new QueueEvents('notifications', { connection: bullConnection })
    : ({ async close() {} } as unknown as QueueEvents);

export async function closeQueues() {
    await Promise.all([
        notificationsQueue.close(),
        paymentsQueue.close(),
        holdsQueue.close(),
        auditQueue.close(),
        maintenanceQueue.close(),
        exportsQueue.close(),
        notificationsEvents.close(),
    ]);
    await connection.quit();
}

export { connection as redisConnection };
