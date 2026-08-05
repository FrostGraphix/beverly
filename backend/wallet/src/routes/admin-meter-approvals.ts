/**
 * Admin customer-meter approval & onboarding search routes — /api/v1/admin/*
 *
 * Includes:
 * - /customer-meters (onboarding link review)
 * - /meter-orders/customer-search (customer lookup for pre-meter orders)
 */
import type { FastifyPluginAsync } from 'fastify';
import { adminClient } from '../db/supabase.js';
import { logAction } from '../services/audit.js';

function cleanSearchTerm(value: unknown): string {
    return String(value ?? '').trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
}

const adminMeterApprovalsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/customer-meters', async (req) => {
        const { status, limit, cursor } = req.query as { status?: string; limit?: string; cursor?: string };
        const pageSize = Math.min(Number(limit ?? 50), 200);
        let query = adminClient
            .from('customer_meters')
            .select('*, customers(full_name, phone, email)')
            .order('created_at', { ascending: false })
            .limit(pageSize);
        query = query.eq('status', status ?? 'pending');
        if (cursor) query = query.lt('created_at', cursor);
        const { data, error } = await query;
        if (error) return { meters: [], error: error.message };
        const rows = data ?? [];
        const nextCursor = rows.length === pageSize ? (rows[rows.length - 1] as any).created_at : null;
        return { meters: rows, nextCursor };
    });

    fastify.post('/customer-meters/:id/approve', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { data: current } = await adminClient.from('customer_meters').select('id, status, customer_id, meter_id').eq('id', id).maybeSingle();
        if (!current) return reply.code(404).send({ error: 'not_found' });
        if ((current as any).status !== 'pending') {
            return reply.code(409).send({ error: 'not_pending', message: 'Only pending meter links can be approved.' });
        }
        const { data: updated, error } = await adminClient
            .from('customer_meters')
            .update({ status: 'approved', reviewed_by: req.actor!.userId, reviewed_at: new Date().toISOString(), rejection_reason: null })
            .eq('id', id)
            .select('*')
            .single();
        if (error) return reply.code(500).send({ error: 'db_error', message: error.message });
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'customer_meter.approve',
            targetType: 'customer_meter',
            targetId: id,
            after: { customerId: (current as any).customer_id, meterId: (current as any).meter_id },
        });
        return { meter: updated };
    });

    fastify.post('/customer-meters/:id/reject', async (req, reply) => {
        const id = (req.params as { id: string }).id;
        const { reason } = (req.body as { reason?: string } | null) ?? {};
        const { data: current } = await adminClient.from('customer_meters').select('id, status, customer_id, meter_id').eq('id', id).maybeSingle();
        if (!current) return reply.code(404).send({ error: 'not_found' });
        if ((current as any).status !== 'pending') {
            return reply.code(409).send({ error: 'not_pending', message: 'Only pending meter links can be rejected.' });
        }
        const { data: updated, error } = await adminClient
            .from('customer_meters')
            .update({ status: 'rejected', reviewed_by: req.actor!.userId, reviewed_at: new Date().toISOString(), rejection_reason: reason?.trim() || null })
            .eq('id', id)
            .select('*')
            .single();
        if (error) return reply.code(500).send({ error: 'db_error', message: error.message });
        await logAction({
            actorUserId: req.actor!.userId,
            actorType: 'staff',
            actorRole: req.actor!.role,
            action: 'customer_meter.reject',
            targetType: 'customer_meter',
            targetId: id,
            after: { customerId: (current as any).customer_id, meterId: (current as any).meter_id, reason: reason?.trim() || null },
        });
        return { meter: updated };
    });

    // Customer lookup for meter-order creation — NOT station-scoped (customer has no meter yet).
    fastify.get('/meter-orders/customer-search', async (req) => {
        const { q, limit } = req.query as { q?: string; limit?: string };
        const pageSize = Math.min(Number(limit ?? 12), 50);
        const safeQ = q ? cleanSearchTerm(q) : '';
        if (!safeQ) return { customers: [] };
        const { data, error } = await adminClient
            .from('customers')
            .select('id, full_name, phone, email, kyc_tier, status')
            .or(`full_name.ilike.%${safeQ}%,phone.ilike.%${safeQ}%,email.ilike.%${safeQ}%`)
            .order('created_at', { ascending: false })
            .limit(pageSize);
        if (error) return { customers: [], error: error.message };
        return { customers: data ?? [] };
    });
};

export default adminMeterApprovalsRoutes;
