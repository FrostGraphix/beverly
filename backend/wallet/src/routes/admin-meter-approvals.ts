/**
 * Admin customer-meter approval & onboarding search routes — /api/v1/admin/*
 */
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { adminClient } from '../db/supabase.js';
import { auditFromRequest, logAction } from '../services/audit.js';
import { notifyMeterLinkUpdate } from '../services/notifications.js';
import { staffStations } from '../services/staff-station-scope.js';

const meterStatusSchema = z.enum(['pending', 'approved', 'rejected']);
const listStatusSchema = z.enum(['all', 'pending', 'approved', 'rejected']);
const listQuerySchema = z.object({
    status: listStatusSchema.default('pending'),
    q: z.string().trim().max(80).optional().default(''),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
});
const idSchema = z.object({ id: z.string().uuid() });
const approveSchema = z.object({ note: z.string().trim().min(3).max(500) });
const rejectSchema = z.object({ reason: z.string().trim().min(10).max(500) });
const unlinkSchema = z.object({ reason: z.string().trim().min(10).max(500) });

function cleanSearchTerm(value: unknown): string {
    return String(value ?? '').trim().replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
}

function requireStationAssignment(reply: FastifyReply, stationIds: string[] | null): boolean {
    if (stationIds && !stationIds.length) {
        reply.code(403).send({ error: 'station_required', message: 'Your staff account needs a station assignment.' });
        return false;
    }
    return true;
}

function scopeStations<T>(query: T, stationIds: string[] | null): T {
    return (stationIds ? (query as any).in('station_id', stationIds) : query) as T;
}

function isApprovalSchemaMissing(error: { message?: string } | null): boolean {
    const message = String(error?.message ?? '').toLowerCase();
    return ['customer_meters.status', 'customer_meters.reviewed_by', 'customer_meters.reviewed_at', 'customer_meters.review_note']
        .some((column) => message.includes(column))
        && (message.includes('does not exist') || message.includes('schema cache'));
}

function sendDatabaseError(reply: FastifyReply, error: { message?: string } | null) {
    if (isApprovalSchemaMissing(error)) {
        return reply.code(503).send({
            error: 'meter_approval_schema_missing',
            message: 'Meter approvals are being configured. Apply the pending database migration, then try again.',
        });
    }
    return reply.code(500).send({ error: 'db_error', message: 'Meter approvals could not be loaded.' });
}

const adminMeterApprovalsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/customer-meters', async (req, reply) => {
        const parsed = listQuerySchema.safeParse(req.query);
        if (!parsed.success) return reply.code(400).send({ error: 'validation_error', message: parsed.error.message });

        const { status, limit, offset } = parsed.data;
        const q = cleanSearchTerm(parsed.data.q);
        const stationIds = staffStations(req);
        if (!requireStationAssignment(reply, stationIds)) return;

        let rowsQuery = adminClient
            .from('customer_meters')
            .select('id, customer_id, meter_id, meter_type, station_id, tariff_id, nickname, meter_name, status, reviewed_by, reviewed_at, rejection_reason, created_at, customers(full_name, phone, email)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(offset, offset + limit - 1);
        if (status !== 'all') rowsQuery = rowsQuery.eq('status', status);
        rowsQuery = scopeStations(rowsQuery, stationIds);
        if (q) rowsQuery = rowsQuery.or(`meter_id.ilike.%${q}%,nickname.ilike.%${q}%,meter_name.ilike.%${q}%`);

        const countFor = (value: z.infer<typeof meterStatusSchema>) => {
            let query = adminClient.from('customer_meters').select('id', { count: 'exact', head: true }).eq('status', value);
            query = scopeStations(query, stationIds);
            return query;
        };

        let rejectedHistoryQuery = adminClient
            .from('customer_meter_link_history')
            .select('id', { count: 'exact', head: true })
            .eq('event_type', 'rejected');
        rejectedHistoryQuery = scopeStations(rejectedHistoryQuery, stationIds);

        const [rowsResult, pendingResult, approvedResult, rejectedResult, rejectedHistoryResult] = await Promise.all([
            rowsQuery,
            countFor('pending'),
            countFor('approved'),
            countFor('rejected'),
            rejectedHistoryQuery,
        ]);
        const firstError = rowsResult.error ?? pendingResult.error ?? approvedResult.error ?? rejectedResult.error ?? rejectedHistoryResult.error;
        if (firstError) return sendDatabaseError(reply, firstError);

        return {
            meters: rowsResult.data ?? [],
            total: rowsResult.count ?? 0,
            counts: {
                pending: pendingResult.count ?? 0,
                approved: approvedResult.count ?? 0,
                rejected: rejectedResult.count ?? 0,
                rejectedHistory: rejectedHistoryResult.count ?? 0,
            },
            limit,
            offset,
        };
    });

    fastify.post('/customer-meters/:id/approve', async (req, reply) => {
        const params = idSchema.safeParse(req.params);
        const body = approveSchema.safeParse(req.body ?? {});
        if (!params.success || !body.success) {
            return reply.code(400).send({ error: 'validation_error', message: (params.error ?? body.error)?.message });
        }
        const { id } = params.data;
        const { note } = body.data;
        const stationIds = staffStations(req);
        if (!requireStationAssignment(reply, stationIds)) return;

        let currentQuery = adminClient
            .from('customer_meters')
            .select('id, status, customer_id, meter_id, station_id, meter_name')
            .eq('id', id);
        currentQuery = scopeStations(currentQuery, stationIds);
        const { data: current, error: currentError } = await currentQuery.maybeSingle();
        if (currentError) return sendDatabaseError(reply, currentError);
        if (!current) return reply.code(404).send({ error: 'not_found', message: 'Meter link was not found.' });
        if (current.status !== 'pending') {
            return reply.code(409).send({ error: 'not_pending', message: 'Only pending meter links can be approved.' });
        }

        const { data: conflict, error: conflictError } = await adminClient
            .from('customer_meters')
            .select('id, customer_id')
            .eq('meter_id', current.meter_id)
            .eq('status', 'approved')
            .neq('id', id)
            .limit(1)
            .maybeSingle();
        if (conflictError) return sendDatabaseError(reply, conflictError);
        if (conflict) {
            return reply.code(409).send({
                error: 'meter_already_approved',
                message: 'This meter is already approved for another customer. Reject this request and investigate the ownership conflict.',
            });
        }

        const reviewedAt = new Date().toISOString();
        const { data: updated, error } = await adminClient
            .from('customer_meters')
            .update({
                status: 'approved',
                reviewed_by: req.actor!.userId,
                reviewed_at: reviewedAt,
                review_note: note,
                rejection_reason: null,
            })
            .eq('id', id)
            .eq('status', 'pending')
            .select('*')
            .maybeSingle();
        if (error) {
            if (error.code === '23505') {
                return reply.code(409).send({ error: 'meter_already_approved', message: 'This meter was just approved for another customer.' });
            }
            return sendDatabaseError(reply, error);
        }
        if (!updated) return reply.code(409).send({ error: 'not_pending', message: 'This meter link was already reviewed.' });

        await logAction({
            ...auditFromRequest(req),
            action: 'customer_meter.approve',
            targetType: 'customer_meter',
            targetId: id,
            before: { status: current.status },
            after: { status: 'approved', customerId: current.customer_id, meterId: current.meter_id, note },
        });
        await notifyMeterLinkUpdate(current.customer_id, {
            meterId: current.meter_id,
            status: 'approved',
        }).catch(() => undefined);
        return { meter: updated };
    });

    fastify.post('/customer-meters/:id/reject', async (req, reply) => {
        const params = idSchema.safeParse(req.params);
        const body = rejectSchema.safeParse(req.body ?? {});
        if (!params.success || !body.success) {
            return reply.code(400).send({ error: 'validation_error', message: (params.error ?? body.error)?.message });
        }
        const { id } = params.data;
        const { reason } = body.data;
        const stationIds = staffStations(req);
        if (!requireStationAssignment(reply, stationIds)) return;

        let currentQuery = adminClient
            .from('customer_meters')
            .select('id, status, customer_id, meter_id, station_id')
            .eq('id', id);
        currentQuery = scopeStations(currentQuery, stationIds);
        const { data: current, error: currentError } = await currentQuery.maybeSingle();
        if (currentError) return sendDatabaseError(reply, currentError);
        if (!current) return reply.code(404).send({ error: 'not_found', message: 'Meter link was not found.' });
        if (current.status !== 'pending') {
            return reply.code(409).send({ error: 'not_pending', message: 'Only pending meter links can be rejected.' });
        }

        const reviewedAt = new Date().toISOString();
        const { data: updated, error } = await adminClient
            .from('customer_meters')
            .update({
                status: 'rejected',
                reviewed_by: req.actor!.userId,
                reviewed_at: reviewedAt,
                review_note: null,
                rejection_reason: reason,
            })
            .eq('id', id)
            .eq('status', 'pending')
            .select('*')
            .maybeSingle();
        if (error) return sendDatabaseError(reply, error);
        if (!updated) return reply.code(409).send({ error: 'not_pending', message: 'This meter link was already reviewed.' });

        await logAction({
            ...auditFromRequest(req),
            action: 'customer_meter.reject',
            targetType: 'customer_meter',
            targetId: id,
            before: { status: current.status },
            after: { status: 'rejected', customerId: current.customer_id, meterId: current.meter_id, reason },
        });
        await notifyMeterLinkUpdate(current.customer_id, {
            meterId: current.meter_id,
            status: 'rejected',
            reason,
        }).catch(() => undefined);
        return { meter: updated };
    });

    fastify.post('/customer-meters/:id/unlink', async (req, reply) => {
        const params = idSchema.safeParse(req.params);
        const body = unlinkSchema.safeParse(req.body ?? {});
        if (!params.success || !body.success) {
            return reply.code(400).send({ error: 'validation_error', message: (params.error ?? body.error)?.message });
        }
        const { id } = params.data;
        const { reason } = body.data;
        const stationIds = staffStations(req);
        if (!requireStationAssignment(reply, stationIds)) return;

        let currentQuery = adminClient
            .from('customer_meters')
            .select('id, status, customer_id, meter_id, station_id, meter_name')
            .eq('id', id);
        currentQuery = scopeStations(currentQuery, stationIds);
        const { data: current, error: currentError } = await currentQuery.maybeSingle();
        if (currentError) return sendDatabaseError(reply, currentError);
        if (!current) return reply.code(404).send({ error: 'not_found', message: 'Meter link was not found.' });

        const { data: deleted, error } = await adminClient
            .from('customer_meters')
            .delete()
            .eq('id', id)
            .select('id')
            .maybeSingle();
        if (error) return sendDatabaseError(reply, error);
        if (!deleted) return reply.code(409).send({ error: 'already_unlinked', message: 'This meter link was already removed.' });

        await logAction({
            ...auditFromRequest(req),
            action: 'customer_meter.unlink',
            targetType: 'customer_meter',
            targetId: id,
            before: {
                status: current.status,
                customerId: current.customer_id,
                meterId: current.meter_id,
                stationId: current.station_id,
                meterName: current.meter_name,
            },
            after: { status: 'unlinked', reason },
        });
        await notifyMeterLinkUpdate(current.customer_id, {
            meterId: current.meter_id,
            status: 'unlinked',
            reason,
        }).catch(() => undefined);
        return { ok: true, unlinkedMeterId: id };
    });

    fastify.get('/meter-orders/customer-search', async (req) => {
        const { q, limit } = req.query as { q?: string; limit?: string };
        const pageSize = Math.min(Math.max(Number(limit ?? 12) || 12, 1), 50);
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
