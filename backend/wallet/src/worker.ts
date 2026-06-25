import { Worker } from 'bullmq';
import { closeQueues, maintenanceQueue, queuesEnabled, redisConnection } from './queue/index.js';
import {
    processRefundExpiry,
    reconcileRemoteSends,
    recomputeFraudBaselines,
    scanStuckPurchases,
    sweepExpiredHolds,
    sweepPendingPayments,
} from './jobs/scheduler.js';
import { runDailyReconciliation } from './services/reconciliation.js';
import { runDailySettlement } from './services/settlement.js';
import { buildDataExport } from './services/data-privacy.js';
import { deliverNotification, type NotificationPayload } from './services/notifications.js';
import { purgeExpiredWebhookPayloads } from './services/webhook-retention.js';

const schedules = [
    { name: 'holds', pattern: '*/5 * * * *' },
    { name: 'payments', pattern: '2-57/5 * * * *' },
    { name: 'stuck-purchases', pattern: '*/10 * * * *' },
    { name: 'remote-send', pattern: '*/3 * * * *' },
    { name: 'reconciliation', pattern: '0 2 * * *' },
    { name: 'settlement', pattern: '0 3 * * *' },
    { name: 'fraud-baseline', pattern: '0 5 * * *' },
    { name: 'refund-expiry', pattern: '0 * * * *' },
    { name: 'webhook-retention', pattern: '20 4 * * *' },
] as const;

async function processMaintenance(name: string): Promise<void> {
    switch (name) {
        case 'holds': return sweepExpiredHolds();
        case 'payments': return sweepPendingPayments();
        case 'stuck-purchases': return scanStuckPurchases();
        case 'remote-send': return reconcileRemoteSends();
        case 'reconciliation': return runDailyReconciliation();
        case 'settlement': return runDailySettlement();
        case 'fraud-baseline': return recomputeFraudBaselines();
        case 'refund-expiry': return processRefundExpiry();
        case 'webhook-retention': await purgeExpiredWebhookPayloads(); return;
        default: throw new Error(`Unknown maintenance job: ${name}`);
    }
}

if (!queuesEnabled) {
    throw new Error('Redis queues must be enabled for the wallet worker.');
}

const worker = new Worker('maintenance', async (job) => processMaintenance(job.name), {
    connection: redisConnection,
    concurrency: 1,
});

const exportWorker = new Worker('privacy-exports', async (job) => {
    const payload = job.data as { customerId: string; requestId: string };
    await buildDataExport(payload.customerId, payload.requestId);
}, {
    connection: redisConnection,
    concurrency: 2,
});

const notificationWorker = new Worker('notifications', async (job) => {
    const payload = job.data as { customerId: string; payload: NotificationPayload };
    await deliverNotification(payload.customerId, payload.payload);
}, {
    connection: redisConnection,
    concurrency: 5,
});

await Promise.all(schedules.map((schedule) => maintenanceQueue.add(schedule.name, {}, {
    jobId: `schedule:${schedule.name}`,
    repeat: { pattern: schedule.pattern },
    attempts: 5,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 100,
    removeOnFail: 500,
})));

function shutdown(signal: string): void {
    console.info({ signal }, 'wallet worker shutdown started');
    void worker.close()
        .then(() => exportWorker.close())
        .then(() => notificationWorker.close())
        .then(() => closeQueues())
        .then(() => {
            console.info({ signal }, 'wallet worker shutdown complete');
            process.exit(0);
        })
        .catch((error) => {
            console.error({ error, signal }, 'wallet worker shutdown failed');
            process.exit(1);
        });
}

console.info('wallet maintenance worker started');
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
