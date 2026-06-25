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

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const notificationsQueue = new Queue('notifications', { connection });
export const paymentsQueue      = new Queue('payments', { connection });
export const holdsQueue         = new Queue('holds', { connection });
export const auditQueue         = new Queue('audit', { connection });

export const notificationsEvents = new QueueEvents('notifications', { connection });

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
