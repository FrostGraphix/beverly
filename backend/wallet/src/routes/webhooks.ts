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
            signature: valid ? 'verified' : null,
            signature_valid: valid,
            verified_at: valid ? new Date().toISOString() : null,
            raw_payload: storedPayload,
            payload_encrypted: encryptSecret(raw),
        }).select('id').single();
        if (webhookErr?.code === '23505') {
            return reply.code(200).send({ ok: true, duplicate: true });
        }
        if (webhookErr || !webhookRow) throw webhookErr ?? new Error('webhook_persist_failed');
        const webhookId = (webhookRow as any).id as string;

        if (!valid) {
            await markWebhookProcessed(webhookId, 'bad_signature');
            return reply.code(401).send({ error: 'bad_signature' });
        }
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
