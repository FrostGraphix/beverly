/**
 * Vendor routes — /api/v1/vendor/*
 *
 * Backend trusts session for actor identity; never trusts payload `vendorOrganizationId`.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminClient } from '../db/supabase.js';
import { findWalletByOwner } from '../services/wallets.js';
import { getBalance, getEntries } from '../services/ledger.js';
import {
    initiatePaystackFunding, initiateBankProofFunding, listVendorFunding,
} from '../services/funding.js';
import { vendorPurchase, listVendorPurchases, getReceiptByOrder } from '../services/vending.js';
import { previewPurchase, lookupMeter } from '../services/token-engine.js';
import { logSecurityEvent } from '../services/audit.js';
import { raiseDispute, listDisputes, getDispute, addMessage } from '../services/disputes.js';
import { listSettlementBatches } from '../services/settlement.js';

const route: FastifyPluginAsync = async (fastify) => {
    // ── me ──
    fastify.get('/me', { preHandler: fastify.requireVendor() }, async (req) => {
        const actor = req.actor!;
        const { data: vu } = await adminClient
            .from('vendor_users')
            .select('id, vendor_organization_id, role, full_name, phone, email, mfa_enrolled, password_reset_required, vendor_organizations(legal_name, trading_name, status)')
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
            password_reset_required: (vu as any)?.password_reset_required,
            organization_name: org?.trading_name ?? org?.legal_name,
            organization_status: org?.status,
        };
    });

    // ── password change ──
    fastify.post('/password-change', { preHandler: fastify.requireAuth() }, async (req, reply) => {
        const actor = req.actor!;
        if (actor.type !== 'vendor_user') {
            return reply.code(403).send({ error: 'forbidden', message: 'Vendor user only.' });
        }
        const schema = z.object({ current: z.string().min(1), next: z.string().min(12) });
        const { next } = schema.parse(req.body);

        const { error: authErr } = await adminClient.auth.admin.updateUserById(actor.userId, {
            password: next,
        });
        if (authErr) return reply.code(400).send({ error: 'password_update_failed', message: authErr.message });

        await adminClient.from('vendor_users')
            .update({ password_reset_required: false })
            .eq('id', actor.actorId);

        await logSecurityEvent('password_change', {
            actorUserId: actor.userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        });

        return { ok: true };
    });

    // ── wallet summary ──
    fastify.get('/wallet', { preHandler: fastify.requireVendor() }, async (req, reply) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const wallet = await findWalletByOwner('vendor', orgId);
        if (!wallet) return reply.code(404).send({ error: 'wallet_not_found', message: 'Wallet not provisioned.' });
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
    fastify.post('/funding/bank-transfer', { preHandler: fastify.requireVendor() }, async (req) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const schema = z.object({
            amountMinor: z.number().int().min(100000),
            proofFilePath: z.string().min(1),
            proofHash: z.string().length(64),
        });
        const body = schema.parse(req.body);
        return initiateBankProofFunding({
            vendorOrganizationId: orgId,
            amountMinor: body.amountMinor,
            submittedBy: req.actor!.userId,
            proofFilePath: body.proofFilePath,
            proofHash: body.proofHash,
        });
    });

    fastify.get('/funding', { preHandler: fastify.requireVendor() }, async (req) => {
        const orgId = req.actor!.vendorOrganizationId!;
        const list = await listVendorFunding(orgId, Math.min(Number((req.query as any).limit ?? 50), 200));
        return { funding: list };
    });

    // ── vending: preview ──
    fastify.post('/vend/preview', { preHandler: fastify.requireVendor() }, async (req) => {
        const schema = z.object({
            meterId: z.string().min(1),
            amountMinor: z.number().int().min(10000),
        });
        const body = schema.parse(req.body);
        const meter = await lookupMeter(body.meterId);
        const preview = previewPurchase(body.amountMinor, meter.tariffId);
        return { meter, preview };
    });

    // ── vending: token ──
    fastify.post('/vend', { preHandler: fastify.requireVendor() }, async (req) => {
        const schema = z.object({
            meterId: z.string().min(1),
            amountMinor: z.number().int().min(10000),
            mode: z.enum(['wallet', 'remote_send']).default('wallet'),
        });
        const body = schema.parse(req.body);
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
