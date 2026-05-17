/**
 * Inbound webhooks — /api/v1/webhook/*
 *
 *   POST /paystack — charge.success / charge.failed.
 *     1. Verify HMAC signature.
 *     2. Persist raw to payment_webhooks (idempotent by gateway_reference).
 *     3. Look up payment_transaction by reference.
 *     4. Verify with Paystack server-side (never trust webhook alone).
 *     5. On success: write funding_credit ledger entry (idempotent).
 *     6. Update payment_transaction + funding_request status.
 */
import type { FastifyPluginAsync } from 'fastify';
import { adminClient } from '../db/supabase.js';
import { verifyTransaction, verifyWebhookSignature } from '../adapters/paystack.js';
import { postEntry } from '../services/ledger.js';
import { logAction } from '../services/audit.js';

const route: FastifyPluginAsync = async (fastify) => {
    // Need raw body for signature verification
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

        // persist raw immediately
        await adminClient.from('payment_webhooks').insert({
            gateway: 'paystack',
            event_type: eventType,
            gateway_reference: reference,
            signature: sig ?? null,
            signature_valid: valid,
            raw_payload: payload as any,
        });

        if (!valid) {
            return reply.code(401).send({ error: 'bad_signature' });
        }

        // We only act on charge.success — other events recorded but not processed in MVP
        if (eventType !== 'charge.success') {
            return reply.code(200).send({ ok: true, ignored: eventType });
        }

        if (!reference) {
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
                const { data: fr } = await adminClient.from('funding_requests').select('*').eq('id', fundingId).single();
                if (fr) {
                    await postEntry({
                        walletId: (fr as any).wallet_id,
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
        }

        // Customer wallet top-up
        if ((tx as any).purpose === 'wallet_funding' && (tx as any).actor_type === 'customer') {
            const walletId = (tx as any).metadata?.wallet_id as string | undefined;
            if (walletId) {
                await postEntry({
                    walletId,
                    direction: 'credit',
                    amountMinor: verified.amount,
                    entryType: 'payment_credit',
                    referenceType: 'payment_transaction',
                    referenceId: (tx as any).id,
                    idempotencyKey: `customer_fund.${(tx as any).id}.paystack.credit`,
                    memo: `Wallet top-up · Paystack ${reference}`,
                    createdBy: (tx as any).actor_id,
                    audit: { actorType: 'webhook' },
                });
            }
        }

        // Customer direct-pay token purchase: generate token after payment
        if ((tx as any).purpose === 'token_purchase' && (tx as any).actor_type === 'customer') {
            const purchaseOrderId = (tx as any).metadata?.purchase_order_id as string | undefined;
            if (purchaseOrderId) {
                const { data: po } = await adminClient
                    .from('purchase_orders')
                    .select('*')
                    .eq('id', purchaseOrderId)
                    .maybeSingle();
                if (po && (po as any).status !== 'delivered' && (po as any).status !== 'failed') {
                    try {
                        const { generateCreditToken, previewPurchase, lookupMeter } = await import('../services/token-engine.js');
                        const { createReceipt } = await import('../services/vending.js');
                        const meter = await lookupMeter((po as any).meter_id);
                        const preview = previewPurchase((po as any).amount_minor, meter.tariffId);
                        const tokenRes = await generateCreditToken({
                            meterId: meter.meterId,
                            customerId: meter.customerId,
                            amountMinor: (po as any).amount_minor,
                            units: preview.units,
                            tariffId: meter.tariffId,
                            reference: purchaseOrderId,
                        });
                        const receipt = await createReceipt({
                            purchaseOrderId,
                            payload: {
                                receiptNumber: `BV-${purchaseOrderId.replace(/-/g,'').slice(0,12).toUpperCase()}`,
                                customerId: (po as any).customer_id,
                                meterId: meter.meterId,
                                amountMinor: (po as any).amount_minor,
                                units: preview.units,
                                token: tokenRes.token,
                                generatedAt: tokenRes.generatedAt,
                                purchaseMode: 'direct_pay',
                            },
                        });
                        await adminClient.from('purchase_orders').update({
                            token: tokenRes.token,
                            receipt_id: receipt.id,
                            status: 'delivered',
                            delivery_state: 'token_generated',
                        }).eq('id', purchaseOrderId);
                    } catch (e: any) {
                        await adminClient.from('purchase_orders').update({
                            status: 'delivery_pending_review',
                            failure_reason: `direct_pay_token_failed: ${e.message}`.slice(0, 500),
                        }).eq('id', purchaseOrderId);
                    }
                }
            }
        }

        // mark transaction success
        await adminClient.from('payment_transactions').update({
            status: 'succeeded',
            completed_at: new Date().toISOString(),
            channel: verified.channel,
            metadata: { ...((tx as any).metadata ?? {}), authorization: verified.authorization, paystack: verified },
        }).eq('id', (tx as any).id);

        await markWebhookProcessed(payload);

        await logAction({
            actorUserId: null,
            actorType: 'webhook',
            action: 'paystack.charge.success',
            targetType: 'payment_transaction',
            targetId: (tx as any).id,
            after: { reference, channel: verified.channel },
        });

        return { ok: true };
    });

    async function markWebhookProcessed(payload: any, error?: string) {
        await adminClient.from('payment_webhooks').update({
            processed: true,
            processed_at: new Date().toISOString(),
            error: error ?? null,
        }).eq('gateway_reference', payload.data?.reference ?? '').eq('processed', false);
    }
};

export default route;
