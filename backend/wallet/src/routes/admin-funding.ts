/**
 * Admin funding and payment routes — /api/v1/admin/*
 *
 * Split out of admin.ts to keep that file within its module-boundary budget.
 * Registered without a prefix inside the admin plugin, so these inherit the
 * admin auth, permission, and station-scope preHandler chain unchanged.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminClient } from '../db/supabase.js';
import {
    approveFundingRequest,
    attachProofUrls,
    listPendingFunding,
    reconcileApprovedFundingCredits,
    rejectFundingRequest,
} from '../services/funding.js';
import { retryBlockedPaystackPayment } from '../services/payment-webhooks.js';
import { getBalance } from '../services/ledger.js';
import { staffStations, stationOwnerIds } from './admin-station-scope.js';

const route: FastifyPluginAsync = async (fastify) => {
    // ── vendor funding history ──
    fastify.get('/vendors/:id/funding', async (req) => {
        const id = (req.params as { id: string }).id;
        const { limit, cursor } = req.query as { limit?: string; cursor?: string };
        const pageSize = Math.min(Number(limit ?? 50), 200);
        let query = adminClient.from('payment_transactions').select('*')
            .eq('actor_type', 'vendor').eq('actor_id', id).eq('purpose', 'wallet_funding')
            .order('created_at', { ascending: false })
            .limit(pageSize);
        if (cursor) query = query.lt('created_at', cursor);
        const { data } = await query;
        const rows = data ?? [];
        const nextCursor = rows.length === pageSize ? rows[rows.length - 1].created_at : null;
        return { funding: rows, nextCursor };
    });

    // ── funding approval queue ──
    fastify.get('/funding/pending', async (req) => {
        const list = await listPendingFunding(200);
        const assignedStations = staffStations(req);
        if (!assignedStations) return { funding: list };
        const { vendors } = await stationOwnerIds(assignedStations);
        return { funding: list.filter((row) => vendors.has(row.vendor_organization_id)) };
    });

    // ── funding history (all statuses, filterable) ──
    fastify.get('/funding/history', async (req) => {
        const { status, channel, from, to, limit, cursor } = req.query as {
            status?: string; channel?: string; from?: string; to?: string;
            limit?: string; cursor?: string;
        };
        const assignedStations = staffStations(req);
        const scopedVendors = assignedStations ? (await stationOwnerIds(assignedStations)).vendors : null;
        if (scopedVendors && !scopedVendors.size) return { funding: [], nextCursor: null, summary: null };
        const pageSize = Math.min(Number(limit ?? 50), 200);
        let query = adminClient
            .from('funding_requests')
            .select('*, vendor_organizations(legal_name, trading_name, contact_email, contact_phone)')
            .order('created_at', { ascending: false })
            .limit(pageSize);
        if (scopedVendors) query = query.in('vendor_organization_id', [...scopedVendors]);
        if (status === 'pending') query = query.in('status', ['initiated', 'proof_uploaded', 'under_review']);
        else if (status && status !== 'all') query = query.eq('status', status);
        if (channel && channel !== 'all') query = query.eq('channel', channel);
        if (from)   query = query.gte('created_at', new Date(from).toISOString());
        if (to)     query = query.lte('created_at', new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString());
        if (cursor) query = query.lt('created_at', cursor);
        const { data } = await query;
        const rows = (data ?? []) as any[];
        const nextCursor = rows.length === pageSize ? rows[rows.length - 1].created_at : null;
        const withUrls = await attachProofUrls(rows);
        // KPI aggregates (only on first page / no cursor)
        let summary: Record<string, number> | null = null;
        if (!cursor) {
            let aggQ = adminClient.from('funding_requests').select('status, amount_minor');
            if (scopedVendors) aggQ = aggQ.in('vendor_organization_id', [...scopedVendors]);
            if (from)    aggQ = aggQ.gte('created_at', new Date(from).toISOString());
            if (to)      aggQ = aggQ.lte('created_at', new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString());
            if (channel && channel !== 'all') aggQ = aggQ.eq('channel', channel);
            const { data: agg } = await aggQ.limit(10_000);
            const rows2 = (agg ?? []) as any[];
            const sumMinor = (s: string) => rows2.filter((r) => r.status === s).reduce((acc, r) => acc + Number(r.amount_minor ?? 0), 0);
            summary = {
                totalCount:    rows2.length,
                approvedCount: rows2.filter((r) => r.status === 'approved').length,
                pendingCount:  rows2.filter((r) => ['initiated', 'proof_uploaded', 'under_review'].includes(r.status)).length,
                rejectedCount: rows2.filter((r) => r.status === 'rejected').length,
                approvedMinor: sumMinor('approved'),
            };
        }
        return { funding: withUrls, nextCursor, summary };
    });

    fastify.post('/funding/reconcile-approved', async (req, reply) => {
        try {
            const result = await reconcileApprovedFundingCredits({
                repairedBy: req.actor!.userId,
                limit: 250,
            });
            return { ok: true, ...result };
        } catch (e: any) {
            return reply.code(400).send({
                error: e.code ?? 'funding_reconcile_failed',
                message: e.message,
            });
        }
    });

    // Payments the reconciler confirmed at the gateway but could not apply.
    // These hold real money, so they need to be visible, not just logged.
    fastify.get('/payments/requires-review', async (req) => {
        const limit = Math.min(Number((req.query as any).limit ?? 50), 200);
        const { data } = await adminClient
            .from('payment_transactions')
            .select('id, gateway_reference, actor_type, actor_id, purpose, amount_minor, status, fulfillment_last_error, fulfillment_attempts, completed_at, metadata, created_at')
            .eq('gateway', 'paystack')
            .eq('status', 'requires_review')
            .order('created_at', { ascending: false })
            .limit(limit);
        return {
            payments: (data ?? []).map((row: any) => ({
                id: row.id,
                reference: row.gateway_reference,
                actorType: row.actor_type,
                actorId: row.actor_id,
                purpose: row.purpose,
                amountMinor: row.amount_minor,
                blockedReason: row.fulfillment_last_error ?? row.metadata?.fulfillment_blocked_reason ?? null,
                blockedAt: row.metadata?.fulfillment_blocked_at ?? null,
                verifiedAmountMinor: row.metadata?.paystack?.amount ?? null,
                attempts: row.fulfillment_attempts ?? 0,
                createdAt: row.created_at,
            })),
        };
    });

    // Re-drive a payment held at requires_review once the block reason is
    // resolved. Without this a blocked payment is stranded permanently.
    fastify.post('/payments/:id/retry-fulfillment', async (req, reply) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        try {
            return await retryBlockedPaystackPayment({
                paymentTransactionId: id,
                retriedBy: req.actor!.userId,
            });
        } catch (e: any) {
            const code = e?.code ?? 'payment_retry_failed';
            return reply.code(code === 'not_found' ? 404 : 400).send({ error: code, message: e.message });
        }
    });

    fastify.post('/funding/:id/approve', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        try {
            const r = await approveFundingRequest({ fundingRequestId: id, approvedBy: req.actor!.userId });
            const balance = await getBalance(r.funding.wallet_id);
            return {
                ...r,
                balance,
                receipt: {
                    fundingRequestId: r.funding.id,
                    walletId: r.funding.wallet_id,
                    ledgerEntryId: r.ledgerEntry.id,
                    creditedAmountMinor: r.ledgerEntry.amount_minor,
                    availableBalanceMinor: balance.availableMinor,
                    approvedAt: r.funding.approved_at,
                },
            };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'approve_failed', message: e.message });
        }
    });

    fastify.post('/funding/:id/reject', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({ reason: z.string().min(2) });
        const body = schema.parse(req.body);
        try {
            const r = await rejectFundingRequest({ fundingRequestId: id, rejectedBy: req.actor!.userId, reason: body.reason });
            return r;
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'reject_failed', message: e.message });
        }
    });

};

export default route;
