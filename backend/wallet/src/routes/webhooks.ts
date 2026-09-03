/**
 * Inbound webhooks - /api/v1/webhook/*
 *
 * POST /paystack - charge.success / charge.failed.
 * 1. Verify HMAC signature.
 * 2. Persist raw to payment_webhooks.
 * 3. Verify the Paystack reference server-side.
 * 4. Fulfill the local payment transaction through the shared reconciler.
 */
import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';
import { verifyWebhookSignature } from '../adapters/paystack.js';
import { processPaystackChargeSuccess } from '../services/payment-webhooks.js';
import { encryptSecret } from '../services/totp.js';
import { logAction } from '../services/audit.js';
import { env } from '../config/env.js';

function verifyResendSignature(raw: string, headers: Record<string, string | string[] | undefined>): boolean {
    const secret = env.RESEND_WEBHOOK_SECRET?.trim();
    const id = String(headers['svix-id'] ?? '');
    const timestamp = String(headers['svix-timestamp'] ?? '');
    const signatureHeader = String(headers['svix-signature'] ?? '');
    if (!secret || !id || !timestamp || !signatureHeader) return false;
    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;
    try {
        const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
        const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest();
        return signatureHeader.split(' ').some((entry) => {
            const [version, encoded] = entry.split(',');
            if (version !== 'v1' || !encoded) return false;
            const supplied = Buffer.from(encoded, 'base64');
            return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
        });
    } catch {
        return false;
    }
}

const route: FastifyPluginAsync = async (fastify) => {
    // Need raw body for signature verification.
    fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
        try {
            const json = JSON.parse((body as Buffer).toString('utf8'));
            (json as any).__raw = (body as Buffer).toString('utf8');
            done(null, json);
        } catch (e) {
            done(e as Error, undefined);
        }
    });

    fastify.post('/paystack', async (req, reply) => {
        const raw = (req.body as { __raw?: string }).__raw ?? '';
        const sig = req.headers['x-paystack-signature'] as string | undefined;
        const valid = verifyWebhookSignature(raw, sig);
        if (!valid) {
            return reply.code(401).send({ error: 'bad_signature' });
        }

        const payload = req.body as { event?: string; data?: any };
        const eventType = payload.event ?? 'unknown';
        const reference = payload.data?.reference ?? null;
        const eventId = typeof payload.data?.id === 'string' || typeof payload.data?.id === 'number'
            ? String(payload.data.id)
            : null;
        const payloadDigest = crypto.createHash('sha256').update(raw).digest('hex');
        const storedPayload = {
            event: eventType,
            reference,
            event_id: eventId,
            amount: payload.data?.amount ?? null,
            status: payload.data?.status ?? null,
        };

        const { data: webhookRow, error: webhookErr } = await adminClient.from('payment_webhooks').insert({
            gateway: 'paystack',
            event_type: eventType,
            gateway_reference: reference,
            gateway_event_id: eventId,
            payload_digest: payloadDigest,
            signature: 'verified',
            signature_valid: true,
            verified_at: new Date().toISOString(),
            raw_payload: storedPayload,
            payload_encrypted: encryptSecret(raw),
        }).select('id').single();
        if (webhookErr?.code === '23505') {
            return reply.code(200).send({ ok: true, duplicate: true });
        }
        if (webhookErr || !webhookRow) throw webhookErr ?? new Error('webhook_persist_failed');
        const webhookId = (webhookRow as any).id as string;

        if (eventType !== 'charge.success') {
            await markWebhookProcessed(webhookId, `ignored_event=${eventType}`);
            return reply.code(200).send({ ok: true, ignored: eventType });
        }
        if (!reference) {
            await markWebhookProcessed(webhookId, 'no_reference');
            return reply.code(200).send({ ok: true, ignored: 'no_reference' });
        }

        try {
            const result = await processPaystackChargeSuccess(reference, 'webhook');
            await markWebhookProcessed(webhookId, result.status === 'ignored' || result.status === 'blocked' ? result.reason : undefined);
            if (result.status === 'ignored') {
                return reply.code(200).send({ ok: true, ignored: result.reason });
            }
            if (result.status === 'blocked') {
                return reply.code(200).send({ ok: true, blocked: result.reason });
            }
            return { ok: true, already: result.status === 'already_fulfilled' };
        } catch (error: any) {
            await setWebhookRetryError(webhookId, error?.message ?? 'webhook_processing_failed');
            throw error;
        }
    });

    fastify.post('/resend', async (req, reply) => {
        const payload = req.body as { type?: string; data?: any; __raw?: string };
        const raw = payload.__raw ?? '';
        if (!verifyResendSignature(raw, req.headers)) {
            return reply.code(401).send({ error: 'bad_signature' });
        }
        const eventType = payload.type ?? 'unknown';
        const emailData = payload.data ?? {};
        const messageId = String(emailData.email_id ?? emailData.id ?? '');
        const recipient = Array.isArray(emailData.to) ? emailData.to.join(',') : (emailData.to ?? 'unknown');
        const subject = emailData.subject ?? 'N/A';

        const statusByEvent: Record<string, string> = {
            'email.sent': 'sent',
            'email.delivered': 'delivered',
            'email.delivery_delayed': 'delayed',
            'email.bounced': 'failed',
            'email.complained': 'failed',
            'email.suppressed': 'failed',
        };
        const deliveryStatus = statusByEvent[eventType];
        if (messageId && deliveryStatus) {
            const now = new Date().toISOString();
            const update: Record<string, unknown> = { email_status: deliveryStatus };
            if (deliveryStatus === 'delivered') update.email_delivered_at = now;
            if (deliveryStatus === 'failed') update.email_failed_at = now;
            const { data: updated, error: updateError } = await adminClient
                .from('admin_announcement_deliveries')
                .update(update)
                .eq('email_message_id', messageId)
                .select('announcement_id');
            if (updateError) throw updateError;
            const announcementId = updated?.[0]?.announcement_id;
            if (announcementId) {
                const { data: deliveryRows, error: deliveryError } = await adminClient
                    .from('admin_announcement_deliveries')
                    .select('email_message_id,email_status')
                    .eq('announcement_id', announcementId)
                    .not('email_message_id', 'is', null)
                    .limit(10_000);
                if (deliveryError) throw deliveryError;
                const states = new Map<string, string>();
                for (const row of deliveryRows ?? []) states.set(row.email_message_id, row.email_status);
                const failed = Array.from(states.values()).filter((status) => status === 'failed').length;
                const sent = states.size - failed;
                const { data: announcement } = await adminClient
                    .from('admin_announcements')
                    .select('channel')
                    .eq('id', announcementId)
                    .maybeSingle();
                const includesInApp = String(announcement?.channel ?? '').split(',').includes('in_app');
                const status = failed === 0 ? 'sent' : (sent === 0 && !includesInApp) ? 'failed' : 'partial';
                const { error: summaryError } = await adminClient.from('admin_announcements').update({
                    email_sent_count: sent,
                    email_failed_count: failed,
                    delivery_status: status,
                }).eq('id', announcementId);
                if (summaryError) throw summaryError;
            }
        }

        if (eventType === 'email.bounced' || eventType === 'email.complained' || eventType === 'email.suppressed' || eventType === 'email.delivery_delayed') {
            await logAction({
                actorUserId: 'system',
                actorType: 'system',
                action: 'resend.email_bounced',
                targetType: 'email',
                targetId: recipient,
                after: { eventType, recipient, subject, bounceData: emailData.bounce ?? emailData },
            }).catch(() => undefined);
        }

        return { ok: true, received: eventType };
    });

    async function markWebhookProcessed(webhookId: string, error?: string) {
        await adminClient.from('payment_webhooks').update({
            processed: true,
            processed_at: new Date().toISOString(),
            error: error ?? null,
        }).eq('id', webhookId).eq('processed', false);
    }

    async function setWebhookRetryError(webhookId: string, error: string) {
        await adminClient.from('payment_webhooks').update({
            error: `retry_pending:${error}`.slice(0, 500),
        }).eq('id', webhookId).eq('processed', false);
    }
};

export default route;
