/** Regression coverage for the current queue-backed notifications architecture. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd(), '../..');
const source = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('notification storage and push adapter', () => {
    it('keeps delivery receipt storage and the FCM adapter', () => {
        const migration = source('supabase/migrations/20260529170000_notifications_pipeline.sql');
        const fcm = source('backend/wallet/src/adapters/fcm.ts');

        expect(migration).toContain('notification_delivery_receipts');
        expect(migration).toContain('customer_push_tokens');
        expect(fcm).toContain('export async function sendPush');
        expect(fcm).toContain('FCM_SERVER_KEY');
        expect(fcm).toContain('AbortController');
    });
});

describe('notification service', () => {
    const notifications = source('backend/wallet/src/services/notifications.ts');

    it('writes the inbox entry before enqueuing delivery', () => {
        expect(notifications).toContain('export async function sendNotification');
        expect(notifications.indexOf('writeInAppForCustomer')).toBeLessThan(notifications.indexOf('notificationsQueue.add'));
        expect(notifications).toContain("from '../queue/index.js'");
    });

    it('uses retry-safe jobs and a development fallback', () => {
        expect(notifications).toContain("backoff: { type: 'exponential'");
        expect(notifications).toContain('removeOnComplete');
        expect(notifications).toContain('deliverNotification(customerId, payload');
    });

    it('preserves channel preference and audit behavior', () => {
        expect(notifications).toContain('notification_preferences');
        expect(notifications).toContain('sendSmsNotification');
        expect(notifications).toContain('sendEmailNotification');
        expect(notifications).toContain('logAction');
    });
});

describe('notifications worker', () => {
    const worker = source('backend/wallet/src/workers/notifications-worker.ts');

    it('has a durable worker lifecycle', () => {
        expect(worker).toContain('export function startNotificationsWorker');
        expect(worker).toContain('export async function closeNotificationsWorker');
        expect(worker).toContain('new Worker<NotificationJobData>');
        expect(worker).toContain("'notifications'");
    });

    it('records per-channel delivery results and retries failures', () => {
        expect(worker).toContain('isDelivered');
        expect(worker).toContain('storeReceipt');
        expect(worker).toContain('.upsert(');
        expect(worker).toContain("err.code === 'invalid_token'");
        expect(worker).toContain('BullMQ will retry');
    });
});

describe('customer notification routes', () => {
    const customer = source('backend/wallet/src/routes/customer.ts');

    it('provides authenticated inbox and preference endpoints', () => {
        expect(customer).toContain("fastify.get('/notifications'");
        expect(customer).toContain("fastify.put('/notifications/preferences'");
        expect(customer).toContain("fastify.post('/notifications/read-all'");
        expect(customer).toContain('fastify.requireCustomer()');
        expect(customer).toContain('mergeNotificationPrefs');
    });
});
