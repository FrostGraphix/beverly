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

        // verify server-side
        const verified = await verifyTransaction(reference);
        if (verified.status !== 'success') {
            await markWebhookProcessed(payload, `verify_status=${verified.status}`);
            return reply.code(200).send({ ok: true, ignored: `verify_${verified.status}` });
        }

        // find payment_transaction
        const { data: tx } = await adminClient
            .from('payment_transactions')
            .select('*')
            .eq('gateway_reference', reference)
            .maybeSingle();
        if (!tx) {
            await markWebhookProcessed(payload, 'no_local_tx');
            return reply.code(200).send({ ok: true, ignored: 'no_local_tx' });
        }

        // already done? idempotent
        if ((tx as any).status === 'succeeded') {
            await markWebhookProcessed(payload);
            return { ok: true, already: true };
        }

        // Vendor wallet funding (via funding_request)
        if ((tx as any).purpose === 'wallet_funding' && (tx as any).actor_type === 'vendor') {
            const fundingId = (tx as any).metadata?.funding_request_id as string | undefined;
            if (fundingId) {
                const { data: fr } = await adminClient.from('funding_requests').select('*').eq('id', fundingId).maybeSingle();
                if (fr) {
                    const wallet = await findWalletByOwner('vendor', (fr as any).vendor_organization_id);
                    try {
                        assertWalletCanTransact(wallet, 'receive funding');
                    } catch (error: any) {
                        await blockWebhookFulfillment(tx, payload, error);
                        return reply.code(200).send({ ok: true, blocked: error.code ?? 'wallet_inactive' });
                    }
                    if (wallet.id !== (fr as any).wallet_id) {
                        await adminClient
                            .from('funding_requests')
                            .update({ wallet_id: wallet.id })
                            .eq('id', (fr as any).id);
                    }
                    await postEntry({
                        walletId: wallet.id,
                        direction: 'credit',
                        amountMinor: (fr as any).amount_minor,
                        entryType: 'payment_credit',
                        referenceType: 'funding_request',
                        referenceId: (fr as any).id,
                        idempotencyKey: `funding.${(fr as any).id}.paystack.credit`,
                        memo: `Paystack ${reference}`,
                        createdBy: (fr as any).submitted_by,
                        audit: { actorType: 'webhook' },
                    });
                    await adminClient.from('funding_requests').update({
                        status: 'approved',
                        approved_at: new Date().toISOString(),
                    }).eq('id', (fr as any).id);
                }
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
        }).eq('gateway_reference', payload.data?.reference ?? '').not('processed', 'is', true);
    }

    async function setWebhookRetryError(webhookId: string, error: string) {
        await adminClient.from('payment_webhooks').update({
            error: `retry_pending:${error}`.slice(0, 500),
        }).eq('id', webhookId).eq('processed', false);
    }
};

export default route;
