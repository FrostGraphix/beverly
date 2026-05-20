/**
 * Vendor routes — /api/v1/vendor/*
 *
 * Backend trusts session for actor identity; never trusts payload `vendorOrganizationId`.
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { adminClient } from '../db/supabase.js';
import { findWalletByOwner, getOrCreateWallet } from '../services/wallets.js';
import { getBalance, getEntries } from '../services/ledger.js';
import {
    initiatePaystackFunding, initiateBankProofFunding, listVendorFunding, uploadBankFundingProof,
} from '../services/funding.js';
import { vendorPurchase, listVendorPurchases, getReceiptByOrder } from '../services/vending.js';
import {
    previewPurchase,
    lookupMeter,
    TokenEngineError,
    buildCreditTokenPreviewPlan,
    buildRemoteTokenTaskPayload,
} from '../services/token-engine.js';
import { logSecurityEvent } from '../services/audit.js';
import { raiseDispute, listDisputes, getDispute, addMessage } from '../services/disputes.js';
import { listSettlementBatches } from '../services/settlement.js';
import {
    beginVendorMfaEnrollment,
    beginVendorMfaReplacement,
    disableVendorMfa,
    VendorMfaError,
    vendorMfaStatus,
    verifyVendorMfaChallenge,
    verifyVendorMfaEnrollment,
} from '../services/vendor-mfa.js';
import {
    setVendorVendCredential,
    vendorVendCredentialStatus,
    VendorVendCredentialError,
    verifyVendorVendCredential,
} from '../services/vendor-vend-credential.js';

function bearerToken(req: FastifyRequest): string {
    const auth = req.headers.authorization ?? '';
    return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function vendorActorOrReply(req: FastifyRequest, reply: FastifyReply) {
    const actor = req.actor;
    if (!actor || actor.type !== 'vendor_user') {
        reply.code(403).send({ error: 'forbidden', message: 'Vendor user required.' });
        return null;
    }
    return actor;
}

function mfaMeta(req: FastifyRequest) {
    return {
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
    };
}

function sendMfaError(reply: FastifyReply, error: unknown) {
    if (error instanceof VendorMfaError) {
        const status = ['invalid_otp', 'mfa_setup_not_started'].includes(error.code) ? 400 : 409;
        return reply.code(status).send({ error: error.code, message: error.message });
    }
    throw error;
}

function sendVendCredentialError(reply: FastifyReply, error: unknown) {
    if (error instanceof VendorVendCredentialError) {
        const status = error.code === 'vend_credential_required' ? 428 : 400;
        return reply.code(status).send({ error: error.code, message: error.message });
    }
    throw error;
}

function sendTokenEngineError(reply: FastifyReply, error: TokenEngineError) {
    const status = error.code === 'meter_not_found' ? 404 : error.retryable ? 503 : 400;
    const messages: Record<string, string> = {
        meter_lookup_unavailable:
            'Meter lookup is temporarily unavailable. No wallet was touched and no vend was attempted; retry shortly or bind this meter in the account catalog.',
        energy_query_failed:
            'The energy backend could not complete the meter query. No wallet was touched and no vend was attempted.',
        energy_report_query_failed:
            'The energy report lookup could not confirm this meter. No wallet was touched and no vend was attempted.',
        meter_not_found:
            'Meter not found in the live account records or the local binding catalog.',
    };
    return reply.code(status).send({
        error: error.code,
        message: messages[error.code] ?? error.message,
        retryable: error.retryable,
        details: {
            noVendAttempted: true,
            recommendedAction: error.retryable ? 'retry_or_bind_meter' : 'check_meter_number_or_bind_meter',
        },
    });
}

const route: FastifyPluginAsync = async (fastify) => {
    // ── me ──
    fastify.get('/me', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        if (req.actor?.type !== 'vendor_user') {
            return reply.code(403).send({ error: 'forbidden', message: 'Vendor user required.' });
        }
        const actor = req.actor!;
        const { data: vu } = await adminClient
            .from('vendor_users')
            .select('id, vendor_organization_id, role, full_name, phone, email, mfa_enrolled, password_reset_required, vend_credential_type, vend_credential_set_at, vendor_organizations(legal_name, trading_name, status)')
            .eq('id', actor.actorId).single();
        const org = (vu as any)?.vendor_organizations;
        return {
            id: (vu as any)?.id,
            vendor_organization_id: (vu as any)?.vendor_organization_id,
            role: (vu as any)?.role,
            full_name: (vu as any)?.full_name,
            phone: (vu as any)?.phone,
            email: (vu as any)?.email,
            mfa_enrolled: (vu as any)?.mfa_enrolled,
            mfa_verified: actor.mfaVerified,
            password_reset_required: (vu as any)?.password_reset_required,
            vend_credential_configured: Boolean((vu as any)?.vend_credential_set_at),
            vend_credential_type: (vu as any)?.vend_credential_type ?? null,
            organization_name: org?.trading_name ?? org?.legal_name,
            organization_status: org?.status,
        };
    });

    fastify.get('/vend-credential/status', { preHandler: fastify.requireVendor() }, async (req) => {
        return vendorVendCredentialStatus(req.actor!.actorId);
    });

    fastify.post('/vend-credential', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const actor = req.actor!;
        const schema = z.object({
            type: z.enum(['pin', 'password']),
            credential: z.string().min(4).max(80),
        });
        const body = schema.parse(req.body);
        try {
            const result = await setVendorVendCredential({
                vendorUserId: actor.actorId,
                authUserId: actor.userId,
                type: body.type,
                credential: body.credential,
                ip: req.ip,
                userAgent: req.headers['user-agent'] as string | undefined,
            });
            return result;
        } catch (error) {
            return sendVendCredentialError(reply, error);
        }
    });

    // ── MFA / 2FA ──
    fastify.get('/mfa/status', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = vendorActorOrReply(req, reply);
        if (!actor) return undefined;
        return vendorMfaStatus(actor.actorId, actor.userId, bearerToken(req));
    });

    fastify.post('/mfa/setup/start', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = vendorActorOrReply(req, reply);
        if (!actor) return undefined;
        try {
            return await beginVendorMfaEnrollment(actor);
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    fastify.post('/mfa/setup/verify', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = vendorActorOrReply(req, reply);
        if (!actor) return undefined;
        const schema = z.object({ code: z.string().min(6).max(24) });
        const { code } = schema.parse(req.body);
        try {
            return await verifyVendorMfaEnrollment(actor, bearerToken(req), code, mfaMeta(req));
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    fastify.post('/mfa/setup/reset', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = vendorActorOrReply(req, reply);
        if (!actor) return undefined;
        const schema = z.object({ code: z.string().min(6).max(24) });
        const { code } = schema.parse(req.body);
        try {
            return await beginVendorMfaReplacement(actor, code, mfaMeta(req));
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    fastify.post('/mfa/challenge/verify', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = vendorActorOrReply(req, reply);
        if (!actor) return undefined;
        const schema = z.object({ code: z.string().min(6).max(24) });
        const { code } = schema.parse(req.body);
        try {
            return await verifyVendorMfaChallenge(actor, bearerToken(req), code, mfaMeta(req));
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    fastify.post('/mfa/disable', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = vendorActorOrReply(req, reply);
        if (!actor) return undefined;
        const schema = z.object({ code: z.string().min(6).max(24) });
        const { code } = schema.parse(req.body);
        try {
            return await disableVendorMfa(actor, code, mfaMeta(req));
        } catch (error) {
            return sendMfaError(reply, error);
        }
    });

    // ── password change ──
    fastify.post('/password-change', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = req.actor!;
        if (actor.type !== 'vendor_user') {
            return reply.code(403).send({ error: 'forbidden', message: 'Vendor user only.' });
        }
        const schema = z.object({
            current: z.string().min(1, 'Current password required.'),
            next:    z.string().min(12, 'New password must be at least 12 characters.'),
        });
        const { current, next } = schema.parse(req.body);

        if (current === next) {
            return reply.code(400).send({
                error: 'same_password',
                message: 'New password must be different from the current one.',
            });
        }

        const wasTempPassword = actor.passwordResetRequired === true;

        // Verify current password by re-authenticating
        if (!actor.email) {
            return reply.code(400).send({ error: 'no_email', message: 'Account has no email.' });
        }
        const verifyRes = await fetch(
            `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': process.env.SUPABASE_ANON_KEY ?? '',
                },
                body: JSON.stringify({ email: actor.email, password: current }),
            },
        );
        if (!verifyRes.ok) {
            await logSecurityEvent('mfa_failure', {
                actorUserId: actor.userId,
                severity: 'medium',
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                metadata: { reason: 'current_password_invalid_on_change' },
            });
            return reply.code(400).send({
                error: 'invalid_current_password',
                message: 'Current password is incorrect.',
            });
        }

        // Update via service role
        const { error: authErr } = await adminClient.auth.admin.updateUserById(actor.userId, {
            password: next,
        });
        if (authErr) return reply.code(400).send({ error: 'password_update_failed', message: authErr.message });

        await adminClient.from('vendor_users')
            .update({ password_reset_required: false })
            .eq('id', actor.actorId);

        await logSecurityEvent('password_change', {
            actorUserId: actor.userId,
            severity: 'info',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { was_temp_password: wasTempPassword },
        });
        if (wasTempPassword) {
            await logSecurityEvent('temp_password_used', {
                actorUserId: actor.userId,
                severity: 'info',
                ip: req.ip,
                userAgent: req.headers['user-agent'],
            });
        }

        return { ok: true, was_temp_password: wasTempPassword };
    });

    // ── wallet summary ──
    fastify.get('/wallet', { preHandler: fastify.requireVendor() }, async (req) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const wallet = await getOrCreateWallet('vendor', orgId, { dailyCapMinor: 500_000_000 });
        const balance = await getBalance(wallet.id);
        return {
            wallet_id: wallet.id,
            currency: wallet.currency,
            status: wallet.status,
            balance_minor: balance.ledgerBalanceMinor,
            holds_minor: balance.activeHoldsMinor,
            available_minor: balance.availableMinor,
            daily_cap_minor: wallet.daily_debit_cap_minor,
        };
    });

    // ── ledger entries ──
    fastify.get('/wallet/ledger', { preHandler: fastify.requireVendor() }, async (req) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const wallet = await findWalletByOwner('vendor', orgId);
        if (!wallet) return { entries: [] };
        const q = (req.query as { limit?: string; cursor?: string });
        const entries = await getEntries(wallet.id, {
            limit: Math.min(Number(q.limit ?? 50), 200),
            cursorAt: q.cursor,
        });
        return { entries };
    });

    // ── funding: initiate Paystack ──
    fastify.post('/funding/paystack', { preHandler: fastify.requireVendor() }, async (req) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const schema = z.object({
            amountMinor: z.number().int().min(50000),
            callbackUrl: z.string().url().optional(),
        });
        const body = schema.parse(req.body);
        return initiatePaystackFunding({
            vendorOrganizationId: orgId,
            amountMinor: body.amountMinor,
            submittedBy: req.actor!.userId,
            email: req.actor!.email ?? 'no-email@example.com',
            callbackUrl: body.callbackUrl,
        });
    });

    // ── funding: bank transfer proof ──
    fastify.post('/funding/bank-transfer', {
        preHandler: fastify.requireVendor(),
        bodyLimit: 12 * 1024 * 1024,
    }, async (req) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const schema = z.object({
            amountMinor: z.number().int().min(100000),
            proofFileName: z.string().min(1).max(180),
            proofMimeType: z.string().min(1).max(120),
            proofBase64: z.string().min(1),
        });
        const body = schema.parse(req.body);
        const proof = await uploadBankFundingProof({
            vendorOrganizationId: orgId,
            submittedBy: req.actor!.userId,
            fileName: body.proofFileName,
            mimeType: body.proofMimeType,
            base64: body.proofBase64,
        });
        return initiateBankProofFunding({
            vendorOrganizationId: orgId,
            amountMinor: body.amountMinor,
            submittedBy: req.actor!.userId,
            proofFilePath: proof.proofFilePath,
            proofHash: proof.proofHash,
        });
    });

    fastify.get('/funding', { preHandler: fastify.requireVendor() }, async (req) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const list = await listVendorFunding(orgId, Math.min(Number((req.query as any).limit ?? 50), 200));
        return { funding: list };
    });

    // ── vending: preview ──
    fastify.post('/vend/preview', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const schema = z.object({
            meterId: z.string().min(1),
            amountMinor: z.number().int().min(10000),
        });
        const body = schema.parse(req.body);
        try {
            const meter = await lookupMeter(body.meterId, {
                allowArchivedFallback: true,
                allowHistoricalFallback: true,
            });
            const preview = previewPurchase(body.amountMinor, meter.tariffId);
            return { meter, preview };
        } catch (e: any) {
            if (e instanceof TokenEngineError) {
                return sendTokenEngineError(reply, e);
            }
            throw e;
        }
    });

    // Safe live integration planner. It resolves the meter and returns the exact
    // upstream payloads without creating wallet holds, purchase orders, tokens, or tasks.
    fastify.post('/vend/live-plan', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const schema = z.object({
            meterId: z.string().min(1),
            amountMinor: z.number().int().min(10000),
            mode: z.enum(['wallet', 'remote_send']).default('wallet'),
        });
        const body = schema.parse(req.body);
        try {
            const meter = await lookupMeter(body.meterId, {
                allowArchivedFallback: true,
                allowHistoricalFallback: true,
            });
            const preview = previewPurchase(body.amountMinor, meter.tariffId);
            const reference = `DRY-RUN-${Date.now()}`;
            const tokenInput = {
                meterId: meter.meterId,
                customerId: meter.customerId,
                customerName: meter.customerName,
                stationId: meter.stationId,
                amountMinor: body.amountMinor,
                units: preview.units,
                tariffId: meter.tariffId,
                reference,
            };
            const tokenPlan = buildCreditTokenPreviewPlan(tokenInput);
            return {
                liveWrite: false,
                meter,
                preview,
                tokenGeneration: {
                    ...tokenPlan,
                    payload: {
                        ...tokenPlan.payload,
                        authorizationPassword: '[REDACTED]',
                    },
                },
                remoteSend: body.mode === 'remote_send'
                    ? {
                        endpoint: '/API/RemoteMeterTask/CreateTokenTask',
                        method: 'POST',
                        liveWrite: false,
                        payload: buildRemoteTokenTaskPayload({
                            customerId: meter.customerId,
                            customerName: meter.customerName,
                            meterId: meter.meterId,
                            stationId: meter.stationId,
                            protocolVersion: meter.protocolVersion,
                            token: '0000 0000 0000 0000 0000',
                            reference,
                        }),
                    }
                    : null,
            };
        } catch (e: any) {
            if (e instanceof TokenEngineError) {
                return sendTokenEngineError(reply, e);
            }
            throw e;
        }
    });

    // ── vending: token ──
    fastify.post('/vend', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const schema = z.object({
            meterId: z.string().min(1),
            amountMinor: z.number().int().min(10000),
            mode: z.enum(['wallet', 'remote_send']).default('wallet'),
            authorization: z.string().min(4).max(80),
        });
        const body = schema.parse(req.body);
        try {
            await verifyVendorVendCredential({
                vendorUserId: req.actor!.actorId,
                authUserId: req.actor!.userId,
                credential: body.authorization,
                ip: req.ip,
                userAgent: req.headers['user-agent'] as string | undefined,
            });
        } catch (error) {
            return sendVendCredentialError(reply, error);
        }
        const clientKey = (req.headers['idempotency-key'] as string | undefined) ?? `${Date.now()}-${Math.random()}`;
        return vendorPurchase({
            vendorOrganizationId: req.actor!.vendorOrganizationId!,
            vendorUserId: req.actor!.userId,
            meterId: body.meterId,
            amountMinor: body.amountMinor,
            mode: body.mode,
            clientIdempotencyKey: clientKey,
        });
    });

    // ── purchases history ──
    fastify.get('/transactions', { preHandler: fastify.requireVendor() }, async (req) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const limit = Math.min(Number((req.query as any).limit ?? 100), 500);
        const purchases = await listVendorPurchases(orgId, limit);
        return { purchases };
    });

    // ── single receipt ──
    fastify.get('/receipts/:orderId', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const orderId = (req.params as { orderId: string }).orderId;
        const orgId = req.actor!.vendorOrganizationId!;
        const { data: po } = await adminClient
            .from('purchase_orders')
            .select('id, actor_type, actor_id')
            .eq('id', orderId).maybeSingle();
        if (!po || (po as any).actor_type !== 'vendor' || (po as any).actor_id !== orgId) {
            return reply.code(404).send({ error: 'not_found', message: 'Receipt not found.' });
        }
        const receipt = await getReceiptByOrder(orderId);
        if (!receipt) return reply.code(404).send({ error: 'not_found', message: 'Receipt not generated yet.' });
        return receipt;
    });

    // ── logout ──
    fastify.post('/logout', { preHandler: fastify.requireAuth() }, async (req) => {
        await logSecurityEvent('logout', {
            actorUserId: req.actor!.userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        });
        return { ok: true };
    });

    // ── disputes ──
    fastify.post('/disputes', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const schema = z.object({
            purchase_order_id: z.string().uuid().optional(),
            subject:           z.string().min(5),
            description:       z.string().min(10),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const actor = req.actor!;
        const { data: vu } = await adminClient
            .from('vendor_users')
            .select('vendor_organization_id')
            .eq('id', actor.actorId)
            .single();
        if (!vu) return reply.code(403).send({ error: 'vendor_not_found' });

        try {
            const id = await raiseDispute({
                raisedByActorType:   'vendor',
                raisedByActorId:     actor.actorId,
                vendorOrganizationId: (vu as any).vendor_organization_id,
                purchaseOrderId:     body.purchase_order_id,
                subject:             body.subject,
                description:         body.description,
            });
            return { id };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'dispute_error', message: e.message });
        }
    });

    fastify.get('/disputes', { preHandler: fastify.requireVendor() }, async (req) => {
        const actor = req.actor!;
        const { status } = req.query as { status?: string };
        const { data: vu2 } = await adminClient
            .from('vendor_users')
            .select('vendor_organization_id')
            .eq('id', actor.actorId)
            .single();
        const orgId = (vu2 as any)?.vendor_organization_id;
        return { disputes: await listDisputes({ vendorOrganizationId: orgId, status, limit: 100 }) };
    });

    fastify.get('/disputes/:id', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const d = await getDispute(id);
        if (!d) return reply.code(404).send({ error: 'not_found' });
        return d;
    });

    fastify.post('/disputes/:id/messages', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({ body: z.string().min(1) });
        let parsed: z.infer<typeof schema>;
        try { parsed = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const actor = req.actor!;
        try {
            await addMessage({ disputeId: id, senderActorType: 'vendor', senderActorId: actor.actorId, body: parsed.body });
            return { ok: true };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'message_error', message: e.message });
        }
    });

    // ── settlement ──
    fastify.get('/settlement', { preHandler: fastify.requireVendor() }, async (req) => {
        const actor = req.actor!;
        const { data: vu } = await adminClient
            .from('vendor_users')
            .select('vendor_organization_id')
            .eq('id', actor.actorId)
            .single();
        if (!vu) return { batches: [] };
        return { batches: await listSettlementBatches({ vendorOrganizationId: (vu as any).vendor_organization_id, limit: 100 }) };
    });
};

export default route;
