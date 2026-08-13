import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { assertClientIdempotencyKey } from '../services/idempotency.js';
import { auditFromRequest, logAction, logSecurityEvent } from '../services/audit.js';
import {
    getVendorTransfer, listTransferVendors, listVendorTransfers, previewVendorTransfer,
    observeVendorTransferRateLimit, transferVendorBalance, VendorTransferError,
} from '../services/vendor-transfers.js';

const TRANSFER_ROLES = new Set(['super-admin', 'developer']);

async function authorizeTransfer(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    if (!TRANSFER_ROLES.has(req.actor?.role ?? '')) {
        const audit = auditFromRequest(req);
        await logSecurityEvent('permission_denied', {
            actorUserId: req.actor?.userId ?? null, severity: 'high', ip: audit.ip, userAgent: audit.userAgent,
            metadata: { permission: 'wallet.vendor_transfers.manage', requiredRoles: [...TRANSFER_ROLES] },
        });
        reply.code(403).send({
            error: 'vendor_transfer_role_required',
            message: 'Only a Super Admin or Developer can transfer vendor balances.',
        });
        return false;
    }
    if (!req.actor?.mfaVerified) {
        const audit = auditFromRequest(req);
        await logSecurityEvent('mfa_failure', {
            actorUserId: req.actor?.userId ?? null, severity: 'high', ip: audit.ip, userAgent: audit.userAgent,
            metadata: { action: 'wallet.vendor_transfer' },
        });
        reply.code(403).send({
            error: 'mfa_required',
            message: 'Verify two-factor authentication before transferring a vendor balance.',
        });
        return false;
    }
    return true;
}

const transferBody = z.object({
    source_vendor_id: z.string().uuid(),
    destination_vendor_id: z.string().uuid(),
    amount_minor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    reason: z.string().trim().min(8).max(500),
    confirmed: z.literal(true),
}).strict();

const previewBody = transferBody.omit({ reason: true, confirmed: true });

function sendTransferError(reply: FastifyReply, error: unknown) {
    if (error instanceof VendorTransferError) {
        return reply.code(error.status).send({ error: error.code, message: error.message });
    }
    throw error;
}

const route: FastifyPluginAsync = async (fastify) => {
    fastify.get('/vendor-transfers/vendors', async (req, reply) => {
        if (!env.FEATURE_VENDOR_BALANCE_TRANSFERS) return reply.code(404).send({ error: 'not_found' });
        if (!(await authorizeTransfer(req, reply))) return undefined;
        const query = z.object({ q: z.string().max(80).optional() }).parse(req.query);
        try { return { vendors: await listTransferVendors(query.q) }; }
        catch (error) { return sendTransferError(reply, error); }
    });

    fastify.post('/vendor-transfers/preview', async (req, reply) => {
        if (!env.FEATURE_VENDOR_BALANCE_TRANSFERS) return reply.code(404).send({ error: 'not_found' });
        if (!(await authorizeTransfer(req, reply))) return undefined;
        const parsed = previewBody.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: 'validation_failed', message: 'Check the transfer details and try again.' });
        try {
            return { preview: await previewVendorTransfer({
                sourceVendorId: parsed.data.source_vendor_id,
                destinationVendorId: parsed.data.destination_vendor_id,
                amountMinor: parsed.data.amount_minor,
            }) };
        } catch (error) { return sendTransferError(reply, error); }
    });

    fastify.get('/vendor-transfers', async (req, reply) => {
        if (!(await authorizeTransfer(req, reply))) return undefined;
        const query = z.object({ limit: z.coerce.number().int().min(1).max(100).optional(), cursor: z.string().datetime().optional() }).parse(req.query);
        try { return listVendorTransfers(query); }
        catch (error) { return sendTransferError(reply, error); }
    });

    fastify.get('/vendor-transfers/:id', async (req, reply) => {
        if (!(await authorizeTransfer(req, reply))) return undefined;
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        try {
            const transfer = await getVendorTransfer(id);
            if (!transfer) return reply.code(404).send({ error: 'not_found', message: 'Transfer receipt not found.' });
            return { transfer };
        } catch (error) { return sendTransferError(reply, error); }
    });

    fastify.post('/vendor-transfers', async (req, reply) => {
        if (!env.FEATURE_VENDOR_BALANCE_TRANSFERS) {
            return reply.code(404).send({ error: 'not_found', message: 'Route not found.' });
        }
        if (!(await authorizeTransfer(req, reply))) return undefined;

        if (env.VENDOR_TRANSFER_RATE_LIMIT_MODE !== 'off') {
            const audit = auditFromRequest(req);
            try {
                const limit = await observeVendorTransferRateLimit({
                    actorUserId: req.actor!.userId,
                    ip: audit.ip,
                    maxRequests: env.VENDOR_TRANSFER_RATE_LIMIT_MAX,
                    windowSeconds: env.VENDOR_TRANSFER_RATE_LIMIT_WINDOW_SECONDS,
                });
                if (limit.exceeded) {
                    await logSecurityEvent('rate_limit_hit', {
                        actorUserId: req.actor!.userId,
                        severity: 'high',
                        ip: audit.ip,
                        userAgent: audit.userAgent,
                        metadata: {
                            action: 'wallet.vendor_transfer',
                            mode: env.VENDOR_TRANSFER_RATE_LIMIT_MODE,
                            count: limit.count,
                            limit: limit.limit,
                            correlationId: audit.correlationId,
                        },
                    });
                    if (env.VENDOR_TRANSFER_RATE_LIMIT_MODE === 'enforce') {
                        return reply
                            .header('retry-after', String(limit.retryAfterSeconds))
                            .code(429)
                            .send({
                                error: 'rate_limit_exceeded',
                                message: 'Too many transfer attempts. Wait, then retry safely.',
                            });
                    }
                }
            } catch (error) {
                req.log.error({ err: error, correlationId: audit.correlationId }, 'vendor transfer rate limit failed');
                if (env.VENDOR_TRANSFER_RATE_LIMIT_MODE === 'enforce') {
                    return sendTransferError(reply, error);
                }
            }
        }

        const parsed = transferBody.safeParse(req.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: 'validation_failed',
                message: parsed.error.issues.some((issue) => issue.path[0] === 'confirmed')
                    ? 'Review and confirm the transfer before continuing.'
                    : 'Check the transfer details and try again.',
                details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
            });
        }

        let idempotencyKey: string;
        try {
            idempotencyKey = assertClientIdempotencyKey(req.headers['idempotency-key']);
        } catch {
            return reply.code(400).send({
                error: 'missing_idempotency_key',
                message: 'A valid Idempotency-Key header is required.',
            });
        }

        try {
            const transfer = await transferVendorBalance({
                sourceVendorId: parsed.data.source_vendor_id,
                destinationVendorId: parsed.data.destination_vendor_id,
                amountMinor: parsed.data.amount_minor,
                reason: parsed.data.reason,
                idempotencyKey,
                requestedBy: req.actor!.userId,
            });
            const audit = auditFromRequest(req);
            await logAction({
                actorUserId: req.actor!.userId,
                actorType: 'staff',
                actorRole: req.actor!.role,
                action: 'wallet.vendor_transfer.completed',
                targetType: 'vendor_wallet_transfer',
                targetId: transfer.id,
                after: {
                    sourceVendorId: transfer.source_vendor_id,
                    destinationVendorId: transfer.destination_vendor_id,
                    amountMinor: transfer.amount_minor,
                    currency: transfer.currency,
                    sourceBalanceAfterMinor: transfer.source_balance_after_minor,
                    destinationBalanceAfterMinor: transfer.destination_balance_after_minor,
                },
                metadata: { idempotencyKey, reason: transfer.reason },
                ip: audit.ip,
                userAgent: audit.userAgent,
                correlationId: audit.correlationId,
            });
            return reply.code(201).send({ transfer });
        } catch (error) {
            const transferError = error instanceof VendorTransferError ? error : null;
            const audit = auditFromRequest(req);
            await logAction({
                actorUserId: req.actor!.userId, actorType: 'staff', actorRole: req.actor!.role,
                action: 'wallet.vendor_transfer.failed', targetType: 'vendor_wallet_transfer', targetId: null,
                metadata: {
                    sourceVendorId: parsed.data.source_vendor_id,
                    destinationVendorId: parsed.data.destination_vendor_id,
                    amountMinor: parsed.data.amount_minor,
                    code: transferError?.code ?? 'internal_error',
                    idempotencyKey,
                },
                ip: audit.ip, userAgent: audit.userAgent, correlationId: audit.correlationId,
            });
            return sendTransferError(reply, error);
        }
    });
};

export default route;
