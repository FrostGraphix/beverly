/**
 * Notifications BullMQ worker — Phase 4.
 *
 * Processes jobs from the 'notifications' queue.
 * Each job carries pre-fetched customer data so the worker is stateless.
 *
 * Per-channel idempotency:
 *   Before sending a channel, we check notification_delivery_receipts for an
 *   existing 'delivered' row. If found, we skip that channel (safe on retry).
 *
 * Concurrency: 5 workers in parallel (configurable via NOTIFICATION_WORKER_CONCURRENCY).
 *
 * Retry: 3 attempts with exponential back-off (configured on notificationsQueue).
 * If all 3 fail, the job lands in BullMQ's failed set for manual inspection.
 */
import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import { redisConnection } from '../queue/index.js';
import { adminClient } from '../db/supabase.js';
import { sendSms } from '../adapters/twilio.js';
import { sendEmail } from '../adapters/postmark.js';
import { sendPush, FcmError } from '../adapters/fcm.js';
import { isSmsEnabled, isEmailEnabled, type NotificationJobData } from '../services/notifications.js';
import { env } from '../config/env.js';

const CONCURRENCY = Number(process.env.NOTIFICATION_WORKER_CONCURRENCY ?? 5);

// ── Receipt helpers ───────────────────────────────────────────────────────────

async function isDelivered(notificationId: string, channel: string, pushToken?: string): Promise<boolean> {
    let q = adminClient
        .from('notification_delivery_receipts')
        .select('id')
        .eq('notification_id', notificationId)
        .eq('channel', channel)
        .eq('status', 'delivered');
    if (pushToken) {
        q = q.eq('push_token', pushToken);
    } else {
        q = q.is('push_token', null);
    }
    const { data } = await q.maybeSingle();
    return !!data;
}

async function storeReceipt(opts: {
    notificationId: string;
    channel: 'sms' | 'email' | 'push';
    status: 'delivered' | 'failed';
    providerRef?: string;
    errorMessage?: string;
    attempt: number;
    pushToken?: string;
}): Promise<void> {
    try {
        await adminClient
            .from('notification_delivery_receipts')
            .upsert(
                {
                    notification_id: opts.notificationId,
                    channel:         opts.channel,
                    push_token:      opts.pushToken ?? null,
                    status:          opts.status,
                    provider_ref:    opts.providerRef ?? null,
                    error_message:   opts.errorMessage ?? null,
                    attempt:         opts.attempt,
                    delivered_at:    opts.status === 'delivered' ? new Date().toISOString() : null,
                },
                {
                    onConflict: 'notification_id,channel,coalesce(push_token, \'\')',
                    ignoreDuplicates: false,
                },
            );
    } catch (err) {
        console.error('[notifications-worker] receipt store failed:', err);
    }
}

// ── Channel processors ────────────────────────────────────────────────────────

async function processSms(data: NotificationJobData, attempt: number): Promise<boolean> {
    if (!data.channels.sms || !data.phone) return true;
    if (await isDelivered(data.notificationId, 'sms')) return true;

    const smsOn = await isSmsEnabled();
    if (!smsOn) return true; // flag off — skip silently

    try {
        const result = await sendSms({
            to:   data.phone,
            body: `Beverly: ${data.body}`,
            messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
        });
        await storeReceipt({
            notificationId: data.notificationId,
            channel:        'sms',
            status:         'delivered',
            providerRef:    result.sid,
            attempt,
        });
        return true;
    } catch (err: any) {
        await storeReceipt({
            notificationId: data.notificationId,
            channel:        'sms',
            status:         'failed',
            errorMessage:   err?.message ?? String(err),
            attempt,
        });
        return false;
    }
}

async function processEmail(data: NotificationJobData, attempt: number): Promise<boolean> {
    if (!data.channels.email || !data.email) return true;
    if (await isDelivered(data.notificationId, 'email')) return true;

    const emailOn = await isEmailEnabled();
    if (!emailOn) return true;

    try {
        const firstName = data.firstName ?? 'there';
        const result = await sendEmail({
            to:      data.email,
            subject: data.subject ?? data.title,
            text:    `Hi ${firstName},\n\n${data.body}\n\n— The Beverly Team`,
            html:    buildEmailHtml(firstName, data.title, data.body),
            tag:     data.type,
        });
        await storeReceipt({
            notificationId: data.notificationId,
            channel:        'email',
            status:         'delivered',
            providerRef:    result.messageId,
            attempt,
        });
        return true;
    } catch (err: any) {
        await storeReceipt({
            notificationId: data.notificationId,
            channel:        'email',
            status:         'failed',
            errorMessage:   err?.message ?? String(err),
            attempt,
        });
        return false;
    }
}

async function processPush(data: NotificationJobData, attempt: number): Promise<boolean> {
    if (!data.channels.push || !data.pushTokens?.length) return true;

    let allOk = true;
    for (const token of data.pushTokens) {
        if (await isDelivered(data.notificationId, 'push', token)) continue;

        try {
            const result = await sendPush({
                token,
                title: data.title,
                body:  data.body,
                data:  stringifyMetadata(data.metadata),
            });
            await storeReceipt({
                notificationId: data.notificationId,
                channel:        'push',
                status:         'delivered',
                providerRef:    result.messageId,
                attempt,
                pushToken:      token,
            });
        } catch (err: any) {
            const isStale = err instanceof FcmError && err.code === 'invalid_token';

            await storeReceipt({
                notificationId: data.notificationId,
                channel:        'push',
                status:         'failed',
                errorMessage:   err?.message ?? String(err),
                attempt,
                pushToken:      token,
            });

            if (isStale) {
                // Deactivate stale token — no retry needed
                await adminClient
                    .from('customer_push_tokens')
                    .update({ active: false })
                    .eq('token', token)
                    .eq('customer_id', data.customerId);
            } else {
                allOk = false;
            }
        }
    }
    return allOk;
}

// ── Job processor ─────────────────────────────────────────────────────────────

async function processJob(job: Job<NotificationJobData>): Promise<void> {
    const data    = job.data;
    const attempt = (job.attemptsMade ?? 0) + 1;

    console.info(`[notifications-worker] job=${job.id} notif=${data.notificationId} attempt=${attempt}`);

    const [smsOk, emailOk, pushOk] = await Promise.all([
        processSms(data, attempt),
        processEmail(data, attempt),
        processPush(data, attempt),
    ]);

    if (!smsOk || !emailOk || !pushOk) {
        const failed = [!smsOk && 'sms', !emailOk && 'email', !pushOk && 'push'].filter(Boolean);
        throw new Error(`Channels failed: ${failed.join(', ')} — BullMQ will retry`);
    }

    console.info(`[notifications-worker] job=${job.id} completed`);
}

// ── Worker factory ────────────────────────────────────────────────────────────

let worker: Worker | null = null;

export function startNotificationsWorker(): Worker {
    if (worker) return worker;

    worker = new Worker<NotificationJobData>(
        'notifications',
        processJob,
        {
            // BullMQ bundles its own ioredis types; cast at this boundary.
            connection:  redisConnection as unknown as ConnectionOptions,
            concurrency: CONCURRENCY,
        },
    );

    worker.on('completed', (job) => {
        console.info(`[notifications-worker] completed job=${job.id}`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[notifications-worker] failed job=${job?.id} attempt=${job?.attemptsMade}:`, err.message);
    });

    worker.on('error', (err) => {
        console.error('[notifications-worker] worker error:', err);
    });

    console.info(`[notifications-worker] started (concurrency=${CONCURRENCY})`);
    return worker;
}

export async function closeNotificationsWorker(): Promise<void> {
    if (worker) {
        await worker.close();
        worker = null;
        console.info('[notifications-worker] closed');
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function stringifyMetadata(metadata?: Record<string, unknown>): Record<string, string> {
    if (!metadata) return {};
    return Object.fromEntries(
        Object.entries(metadata).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
    );
}

function buildEmailHtml(firstName: string, title: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:40px">
        <tr><td>
          <p style="margin:0 0 8px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.06em">Beverly</p>
          <h1 style="margin:0 0 16px;font-size:22px;color:#111">${escHtml(title)}</h1>
          <p style="margin:0 0 32px;font-size:15px;color:#333;line-height:1.6">Hi ${escHtml(firstName)},</p>
          <p style="margin:0 0 32px;font-size:15px;color:#333;line-height:1.6">${escHtml(body)}</p>
          <p style="margin:0;font-size:13px;color:#999">— The Beverly Team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
