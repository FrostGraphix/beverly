/**
 * Admin (staff) routes — /api/v1/admin/*
 *
 * Staff actions: vendor onboarding, funding approval, monitoring.
 * All actions audit-logged.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminClient } from '../db/supabase.js';
import {
    createVendorOrganization, setVendorStatus,
} from '../services/vendor-onboarding.js';
import {
    approveFundingRequest, rejectFundingRequest, listPendingFunding,
} from '../services/funding.js';
import { logAction } from '../services/audit.js';
import { resolveAssessment } from '../services/fraud-engine.js';

const route: FastifyPluginAsync = async (fastify) => {
    fastify.addHook('preHandler', fastify.requireStaff());

    // ── vendor applications queue ──
    fastify.get('/vendor-applications', async (req) => {
        const status = (req.query as { status?: string }).status ?? 'submitted';
        const { data } = await adminClient
            .from('vendor_applications')
            .select('*')
            .eq('status', status)
            .order('created_at', { ascending: true })
            .limit(200);
        return { applications: data ?? [] };
    });

    // ── create vendor organization ──
    fastify.post('/vendors', async (req) => {
        const schema = z.object({
            legalName: z.string().min(2),
            tradingName: z.string().optional(),
            cacNumber: z.string().optional(),
            tin: z.string().optional(),
            businessType: z.string().optional(),
            contactEmail: z.string().email(),
            contactPhone: z.string().min(8),
            operatingAddress: z.string().optional(),
            operatingStations: z.array(z.string()).optional(),
            primaryUserEmail: z.string().email(),
            primaryUserFullName: z.string().min(2),
            primaryUserPhone: z.string().optional(),
            dailyLimitMinor: z.number().int().min(100000).optional(),
            sourceApplicationId: z.string().uuid().optional(),
        });
        const body = schema.parse(req.body);
        const result = await createVendorOrganization({
            ...body,
            createdByStaffId: req.actor!.userId,
        });
        // NOTE: temporaryPassword is in the response ONCE. Caller must hand it off
        // through the approved secure channel and never store it server-side.
        return result;
    });

    // ── vendor list ──
    fastify.get('/vendors', async (req) => {
        const { status, q } = req.query as { status?: string; q?: string };
        let query = adminClient.from('vendor_organizations').select('*').order('created_at', { ascending: false }).limit(200);
        if (status) query = query.eq('status', status);
        if (q) query = query.ilike('legal_name', `%${q}%`);
        const { data } = await query;
        return { vendors: data ?? [] };
    });

    // ── freeze / unfreeze ──
    fastify.patch('/vendors/:id/status', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({
            status: z.enum(['approved', 'suspended', 'frozen', 'closed']),
            reason: z.string().optional(),
        });
        const body = schema.parse(req.body);
        try {
            await setVendorStatus(id, body.status, req.actor!.userId, body.reason);
            return { ok: true };
        } catch (e: any) {
            return reply.code(400).send({ error: e.code ?? 'update_failed', message: e.message });
        }
    });

    // ── funding approval queue ──
    fastify.get('/funding/pending', async () => {
        const list = await listPendingFunding(200);
        return { funding: list };
    });

    fastify.post('/funding/:id/approve', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        try {
            const r = await approveFundingRequest({ fundingRequestId: id, approvedBy: req.actor!.userId });
            return r;
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

    // ── vending monitor ──
    fastify.get('/vending', async (req) => {
        const { status, station, q } = req.query as { status?: string; station?: string; q?: string };
        let query = adminClient.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(200);
        if (status) query = query.eq('status', status);
        if (station) query = query.eq('station_id', station);
        if (q) query = query.ilike('meter_id', `%${q}%`);
        const { data } = await query;
        return { purchases: data ?? [] };
    });

    // ── meter purchase orders ──
    fastify.get('/meter-orders', async (req) => {
        const { status, q } = req.query as { status?: string; q?: string };
        let query = adminClient
            .from('meter_purchase_orders')
            .select('*, customers(users(full_name, email, phone))')
            .order('created_at', { ascending: false })
            .limit(200);
        if (status) query = query.eq('status', status);
        if (q) query = query.or(`property_address.ilike.%${q}%,service_area.ilike.%${q}%`);
        const { data } = await query;
        return { orders: data ?? [] };
    });

    fastify.patch('/meter-orders/:id', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({
            status: z.enum(['paid', 'assigned', 'dispatched', 'installed', 'cancelled']),
            technician_name: z.string().optional(),
            notes: z.string().optional(),
        });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }

        const { data: order, error } = await adminClient
            .from('meter_purchase_orders')
            .update({ ...body, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) return reply.code(500).send({ error: 'db_error', message: error.message });
        if (!order) return reply.code(404).send({ error: 'not_found' });

        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            action: `meter_order.${body.status}`,
            targetId: id,
            metadata: { technician_name: body.technician_name, notes: body.notes },
        });
        return order;
    });

    // ── fraud review queue ──
    fastify.get('/fraud', async (req) => {
        const { resolved, min_score, limit } = req.query as { resolved?: string; min_score?: string; limit?: string };
        const minScore = Number(min_score ?? 50);
        let query = adminClient
            .from('fraud_assessments')
            .select('*, fraud_signals(*), customers(users(full_name, phone))')
            .gte('score', minScore)
            .order('created_at', { ascending: false })
            .limit(Math.min(Number(limit ?? 200), 500));
        if (resolved === 'true')  query = query.eq('resolved', true);
        if (resolved === 'false') query = query.eq('resolved', false);
        const { data } = await query;
        return { assessments: data ?? [] };
    });

    fastify.patch('/fraud/:id/resolve', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const schema = z.object({ note: z.string().optional() });
        const body = schema.parse(req.body);
        try {
            await resolveAssessment(id, req.actor!.userId, body.note);
            await logAction({
                actorUserId: req.actor!.userId,
                actorType:   'staff',
                action:      'fraud.assessment.resolved',
                targetId:    id,
                metadata:    { note: body.note },
            });
            return { ok: true };
        } catch (e: any) {
            return reply.code(500).send({ error: 'resolve_failed', message: e.message });
        }
    });

    // ── audit log viewer ──
    fastify.get('/audit', async (req) => {
        const { actor, action, target, since, limit } = req.query as Record<string, string | undefined>;
        let query = adminClient.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(Math.min(Number(limit ?? 200), 1000));
        if (actor) query = query.eq('actor_user_id', actor);
        if (action) query = query.ilike('action', `${action}%`);
        if (target) query = query.eq('target_id', target);
        if (since) query = query.gte('created_at', since);
        const { data } = await query;
        return { entries: data ?? [] };
    });
};

export default route;
