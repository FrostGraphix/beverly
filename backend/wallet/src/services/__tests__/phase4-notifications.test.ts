/**
 * Phase 4 regression — notifications pipeline.
 *
 * Covers:
 *   • DB migration: delivery receipts + push tokens tables
 *   • FCM adapter: exports, error class, stale-token handling
 *   • Notifications service: enqueue-first architecture, job data shape
 *   • Worker: per-channel idempotency, stale-token deactivation, HTML email
 *   • Server: worker started + closed on shutdown
 *   • Customer routes: push token register/unregister, push pref channel
 *   • Env: FCM_SERVER_KEY added
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd(), '../..');

// ── DB migration ──────────────────────────────────────────────────────────────
describe('DB migration: notifications pipeline', () => {
    const sql = readFileSync(
        resolve(ROOT, 'supabase/migrations/20260529170000_notifications_pipeline.sql'),
        'utf-8',
    );

    it('creates notification_delivery_receipts table', () => {
        expect(sql).toContain('notification_delivery_receipts');
        expect(sql).toContain('create table');
    });

    it('receipt has channel check (sms, email, push)', () => {
        expect(sql).toContain("'sms'");
        expect(sql).toContain("'email'");
        expect(sql).toContain("'push'");
    });

    it('receipt has status check (queued, delivered, failed)', () => {
        expect(sql).toContain("'queued'");
        expect(sql).toContain("'delivered'");
        expect(sql).toContain("'failed'");
    });

    it('receipt has provider_ref for Twilio SID / Postmark ID / FCM ID', () => {
        expect(sql).toContain('provider_ref');
    });

    it('receipt has push_token column for per-device tracking', () => {
        expect(sql).toContain('push_token');
    });

    it('receipt has unique index for idempotency on retry', () => {
        expect(sql).toContain('idx_notif_receipt_unique');
    });

    it('receipt references notifications(id) ON DELETE CASCADE', () => {
        expect(sql).toContain('references notifications(id)');
        expect(sql).toContain('on delete cascade');
    });

    it('creates customer_push_tokens table', () => {
        expect(sql).toContain('customer_push_tokens');
    });

    it('push tokens have platform check (ios, android, web)', () => {
        expect(sql).toContain("'ios'");
        expect(sql).toContain("'android'");
        expect(sql).toContain("'web'");
    });

    it('push tokens have active flag for soft-delete on stale tokens', () => {
        expect(sql).toContain('active');
    });

    it('enables RLS on both tables', () => {
        const count = (sql.match(/enable row level security/g) ?? []).length;
        expect(count).toBeGreaterThanOrEqual(2);
    });
});

// ── FCM adapter ───────────────────────────────────────────────────────────────
describe('FCM adapter', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/adapters/fcm.ts'), 'utf-8');

    it('exports sendPush function', () => {
        expect(src).toContain('export async function sendPush');
    });

    it('exports FcmError with code field', () => {
        expect(src).toContain('export class FcmError');
        expect(src).toContain('public code: string');
    });

    it('throws not_configured when FCM_SERVER_KEY missing', () => {
        expect(src).toContain("'not_configured'");
        expect(src).toContain('FCM_SERVER_KEY');
    });

    it('throws invalid_token for stale/revoked device tokens', () => {
        expect(src).toContain("'invalid_token'");
        expect(src).toContain('STALE_TOKEN_ERRORS');
    });

    it('uses FCM Legacy HTTP endpoint', () => {
        expect(src).toContain('fcm.googleapis.com/fcm/send');
    });

    it('sets priority=high for timely delivery', () => {
        expect(src).toContain("'high'");
    });

    it('has timeout to avoid hanging on FCM', () => {
        expect(src).toContain('FCM_TIMEOUT_MS');
        expect(src).toContain('AbortController');
    });
});

// ── Notifications service ─────────────────────────────────────────────────────
describe('notifications service — queue-backed', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/services/notifications.ts'), 'utf-8');

    it('exports NotificationJobData interface', () => {
        expect(src).toContain('export interface NotificationJobData');
    });

    it('job data includes notificationId for receipt linking', () => {
        expect(src).toContain('notificationId:');
    });

    it('job data includes pre-fetched phone, email, pushTokens', () => {
        expect(src).toContain('phone?:');
        expect(src).toContain('email?:');
        expect(src).toContain('pushTokens?:');
    });

    it('job data channels object has sms, email, push', () => {
        const start = src.indexOf('export interface NotificationJobData');
        const block = src.slice(start, start + 400);
        expect(block).toContain('sms:');
        expect(block).toContain('email:');
        expect(block).toContain('push:');
    });

    it('imports notificationsQueue', () => {
        expect(src).toContain("from '../queue/index.js'");
        expect(src).toContain('notificationsQueue');
    });

    it('enqueues to BullMQ via notificationsQueue.add', () => {
        expect(src).toContain('notificationsQueue.add');
    });

    it('uses jobId based on notificationId for deduplication', () => {
        expect(src).toContain('jobId:');
        expect(src).toContain('notif:');
    });

    it('writes in-app row before enqueuing (synchronous)', () => {
        const src2 = src;
        const inAppIdx  = src2.indexOf('writeInApp');
        const enqueueIdx = src2.indexOf('notificationsQueue.add');
        expect(inAppIdx).toBeLessThan(enqueueIdx);
    });

    it('fetches customer push tokens alongside customer row', () => {
        expect(src).toContain('customer_push_tokens');
        expect(src).toContain('active');
    });

    it('exports isSmsEnabled and isEmailEnabled for worker', () => {
        expect(src).toContain('export async function isSmsEnabled');
        expect(src).toContain('export async function isEmailEnabled');
    });

    it('includes push channel in PREF_DEFAULTS', () => {
        expect(src).toContain('push:   {');
    });

    it('never throws — enqueue failure is caught and logged', () => {
        const start = src.indexOf('notificationsQueue.add');
        const block = src.slice(start - 20, start + 200);
        expect(block).toContain('catch');
        expect(block).toContain('console.error');
    });
});

// ── Notifications worker ──────────────────────────────────────────────────────
describe('notifications worker', () => {
    const src = readFileSync(
        resolve(ROOT, 'backend/wallet/src/workers/notifications-worker.ts'),
        'utf-8',
    );

    it('exports startNotificationsWorker', () => {
        expect(src).toContain('export function startNotificationsWorker');
    });

    it('exports closeNotificationsWorker', () => {
        expect(src).toContain('export async function closeNotificationsWorker');
    });

    it('uses BullMQ Worker class', () => {
        expect(src).toContain("from 'bullmq'");
        expect(src).toContain("new Worker");
    });

    it('processes notifications queue', () => {
        expect(src).toContain("'notifications'");
    });

    it('has configurable concurrency', () => {
        expect(src).toContain('CONCURRENCY');
        expect(src).toContain('concurrency');
    });

    it('checks isDelivered before each channel — per-channel idempotency', () => {
        expect(src).toContain('isDelivered');
        expect(src).toContain('await isDelivered');
    });

    it('stores delivery receipt after each channel attempt', () => {
        expect(src).toContain('storeReceipt');
        expect(src).toContain("'delivered'");
        expect(src).toContain("'failed'");
    });

    it('upserts receipt using onConflict for idempotency', () => {
        expect(src).toContain('.upsert(');
        expect(src).toContain('onConflict');
    });

    it('stores Twilio SID as providerRef for SMS', () => {
        const start = src.indexOf('processSms');
        const block = src.slice(start, start + 1200);
        expect(block).toContain('result.sid');
        expect(block).toContain('providerRef');
    });

    it('stores Postmark messageId as providerRef for email', () => {
        const start = src.indexOf('processEmail');
        const block = src.slice(start, start + 1200);
        expect(block).toContain('result.messageId');
        expect(block).toContain('providerRef');
    });

    it('deactivates stale push tokens on invalid_token error', () => {
        expect(src).toContain("err.code === 'invalid_token'");
        expect(src).toContain("active: false");
    });

    it('throws on failure so BullMQ triggers retry', () => {
        expect(src).toContain('throw new Error');
        expect(src).toContain('BullMQ will retry');
    });

    it('sends HTML email via postmark', () => {
        expect(src).toContain('buildEmailHtml');
        expect(src).toContain('html:');
    });

    it('respects SMS feature flag', () => {
        expect(src).toContain('isSmsEnabled');
    });

    it('respects email feature flag', () => {
        expect(src).toContain('isEmailEnabled');
    });

    it('logs completed and failed events', () => {
        expect(src).toContain("'completed'");
        expect(src).toContain("'failed'");
    });
});

// ── Server wiring ─────────────────────────────────────────────────────────────
describe('server — worker lifecycle', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/server.ts'), 'utf-8');

    it('imports startNotificationsWorker', () => {
        expect(src).toContain('startNotificationsWorker');
    });

    it('imports closeNotificationsWorker', () => {
        expect(src).toContain('closeNotificationsWorker');
    });

    it('starts worker after server listens', () => {
        // The call startNotificationsWorker() must come after app.listen(...)
        const listenIdx = src.indexOf('app.listen(');
        const callIdx   = src.indexOf('startNotificationsWorker()');
        expect(listenIdx).toBeGreaterThan(0);
        expect(callIdx).toBeGreaterThan(listenIdx);
    });

    it('closes worker before queue on shutdown', () => {
        // closeNotificationsWorker() call must appear before closeQueues() call
        const workerCallIdx = src.indexOf('await closeNotificationsWorker()');
        const queuesCallIdx = src.indexOf('await closeQueues()');
        expect(workerCallIdx).toBeGreaterThan(0);
        expect(workerCallIdx).toBeLessThan(queuesCallIdx);
    });
});

// ── Customer routes ───────────────────────────────────────────────────────────
describe('customer routes — push token + preferences', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/routes/customer.ts'), 'utf-8');

    it('has POST /notifications/push-token route', () => {
        expect(src).toContain("'/notifications/push-token'");
    });

    it('has DELETE /notifications/push-token route', () => {
        expect(src).toContain('fastify.delete');
        expect(src).toContain("'/notifications/push-token'");
    });

    it('push token register requires customer auth', () => {
        // POST /notifications/push-token must have requireCustomer guard
        expect(src).toContain("fastify.post('/notifications/push-token'");
        const postIdx = src.indexOf("fastify.post('/notifications/push-token'");
        const block   = src.slice(postIdx, postIdx + 100);
        expect(block).toContain('requireCustomer');
    });

    it('validates platform enum (ios, android, web)', () => {
        const start = src.indexOf("fastify.post('/notifications/push-token'");
        const block = src.slice(start, start + 500);
        expect(block).toContain("'ios'");
        expect(block).toContain("'android'");
        expect(block).toContain("'web'");
    });

    it('upserts push token on conflict (re-registration)', () => {
        const start = src.indexOf("fastify.post('/notifications/push-token'");
        const block = src.slice(start, start + 900);
        expect(block).toContain('upsert');
        expect(block).toContain('onConflict');
    });

    it('delete deactivates token (soft delete)', () => {
        const start = src.indexOf("fastify.delete('/notifications/push-token'");
        const block = src.slice(start, start + 500);
        expect(block).toContain('active: false');
    });

    it('preferences PUT accepts push channel', () => {
        // The PUT /notifications/preferences schema must include push channel
        const start = src.indexOf("fastify.put('/notifications/preferences'");
        const block = src.slice(start, start + 600);
        expect(block).toContain('push:');
    });
});

// ── Env config ────────────────────────────────────────────────────────────────
describe('env config — FCM', () => {
    const src = readFileSync(resolve(ROOT, 'backend/wallet/src/config/env.ts'), 'utf-8');

    it('FCM_SERVER_KEY is defined as optional string', () => {
        expect(src).toContain('FCM_SERVER_KEY');
    });
});
