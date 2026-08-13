/**
 * Admin payment recovery routes — /api/v1/admin/*
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { adminClient } from '../db/supabase.js';
import { logAction } from '../services/audit.js';
import { assertClientIdempotencyKey } from '../services/idempotency.js';
import { processPaystackChargeSuccess } from '../services/payment-webhooks.js';

function requireIdempotencyKey(req: FastifyRequest, reply: FastifyReply): string | null {
    try {
        return assertClientIdempotencyKey(req.headers['idempotency-key']);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'A valid Idempotency-Key header is required.';
        reply.code(400).send({ error: 'invalid_idempotency_key', message });
        return null;
    }
}

const adminPaymentRecoveryRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/payments/requires-review', async (req) => {
        const parsed = z.object({
            limit: z.coerce.number().int().min(1).max(200).default(50),
            purpose: z.enum(['wallet_funding', 'token_purchase']).optional(),
        }).parse(req.query ?? {});
        let query = adminClient
            .from('payment_transactions')
            .select('id, gateway_reference, actor_type, purpose, amount_minor, metadata, fulfillment_attempts, created_at')
            .eq('status', 'requires_review')
            .order('created_at', { ascending: false })
            .limit(parsed.limit);
        if (parsed.purpose) query = query.eq('purpose', parsed.purpose);
        const { data, error } = await query;
        if (error) throw error;
        return {
            payments: (data ?? []).map((payment: any) => ({
                id: payment.id,
                reference: payment.gateway_reference,
                actorType: payment.actor_type,
                purpose: payment.purpose,
                amountMinor: Number(payment.amount_minor ?? 0),
                blockedReason: payment.metadata?.fulfillment_blocked_reason ?? null,
                blockedDetail: payment.metadata?.fulfillment_blocked_detail ?? null,
                verifiedAmountMinor: Number.isFinite(Number(payment.metadata?.paystack?.amount))
                    ? Number(payment.metadata.paystack.amount)
                    : null,
                requestedAmountMinor: Number.isFinite(Number(payment.metadata?.paystack?.requestedAmount))
                    ? Number(payment.metadata.paystack.requestedAmount)
                    : null,
                gatewayFeeMinor: Number.isFinite(Number(payment.metadata?.paystack?.fees))
                    ? Number(payment.metadata.paystack.fees)
                    : null,
                attempts: Number(payment.fulfillment_attempts ?? 0),
                createdAt: payment.created_at,
            })),
        };
    });

    fastify.get('/vending/payment-recovery', async () => {
        const { data, error } = await adminClient
            .from('payment_transactions')
            .select('id, gateway_reference, amount_minor, metadata, fulfillment_attempts, created_at')
            .eq('status', 'requires_review')
            .eq('purpose', 'token_purchase')
            .eq('actor_type', 'customer')
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) throw error;
        const payments = data ?? [];
        const orderIds = payments
            .map((payment: any) => String(payment.metadata?.purchase_order_id ?? ''))
            .filter(Boolean);
        const { data: orders, error: ordersError } = orderIds.length
            ? await adminClient
                .from('purchase_orders')
                .select('id, meter_id, customer_name, status, delivery_state, token')
                .in('id', orderIds)
            : { data: [], error: null };
        if (ordersError) throw ordersError;
        const ordersById = new Map((orders ?? []).map((order: any) => [String(order.id), order]));
        return {
            payments: payments.map((payment: any) => {
                const order = ordersById.get(String(payment.metadata?.purchase_order_id ?? '')) as any;
                return {
                    id: payment.id,
                    reference: payment.gateway_reference,
                    amountMinor: Number(payment.amount_minor ?? 0),
                    gatewayChargedMinor: Number(payment.metadata?.paystack?.amount ?? 0),
                    gatewayFeeMinor: Number(payment.metadata?.paystack?.fees ?? 0),
                    blockedReason: payment.metadata?.fulfillment_blocked_reason ?? null,
                    blockedDetail: payment.metadata?.fulfillment_blocked_detail ?? null,
                    attempts: Number(payment.fulfillment_attempts ?? 0),
                    createdAt: payment.created_at,
                    meterId: order?.meter_id ?? null,
                    customerName: order?.customer_name ?? null,
                    orderStatus: order?.status ?? null,
                    tokenGenerated: Boolean(order?.token),
                };
            }),
        };
    });

    fastify.post('/payments/:id/retry-fulfillment', async (req, reply) => {
        const idempotencyKey = requireIdempotencyKey(req, reply);
        if (!idempotencyKey) return reply;
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        const { data: payment, error } = await adminClient
            .from('payment_transactions')
            .select('id, gateway_reference, status, metadata')
            .eq('id', id)
            .eq('status', 'requires_review')
            .maybeSingle();
        if (error) throw error;
        if (!payment) {
            return reply.code(404).send({ error: 'payment_not_reviewable', message: 'Payment is not awaiting fulfillment review.' });
        }
        const result = await processPaystackChargeSuccess((payment as any).gateway_reference, 'scheduler');
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            action: 'payment.fulfillment.retry',
            targetType: 'payment_transaction',
            targetId: id,
            before: { status: (payment as any).status },
            after: { ...result, idempotencyKey },
            ip: req.ip,
            userAgent: req.headers['user-agent'] as string | undefined,
        }).catch(() => undefined);
        return { status: 'ok', fulfillmentStatus: result.status, reason: result.reason };
    });
};

export default adminPaymentRecoveryRoutes;
