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
import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';

const queuesEnabled = env.NODE_ENV !== 'development' || process.env.ENABLE_REDIS_QUEUES === 'true';

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

export const notificationsQueue = queuesEnabled ? new Queue('notifications', { connection }) : disabledQueue('notifications');
export const paymentsQueue      = queuesEnabled ? new Queue('payments', { connection }) : disabledQueue('payments');
export const holdsQueue         = queuesEnabled ? new Queue('holds', { connection }) : disabledQueue('holds');
export const auditQueue         = queuesEnabled ? new Queue('audit', { connection }) : disabledQueue('audit');

export const notificationsEvents = queuesEnabled
    ? new QueueEvents('notifications', { connection })
    : ({ async close() {} } as unknown as QueueEvents);

export async function closeQueues() {
    await Promise.all([
        notificationsQueue.close(),
        paymentsQueue.close(),
        holdsQueue.close(),
        auditQueue.close(),
        notificationsEvents.close(),
    ]);
    await connection.quit();
}

export { connection as redisConnection };
