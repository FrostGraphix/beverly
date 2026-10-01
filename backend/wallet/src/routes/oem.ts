import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminClient } from '../db/supabase.js';

// ponytail: fail closed above 200 grants; add cursor pagination when needed.
const grantedInstallations = z.array(z.object({
    oem_installations: z.object({
        id: z.string().min(1), tenant_id: z.string().min(1), display_name: z.string(),
        status: z.enum(['draft', 'active', 'suspended', 'retired']),
        environment: z.enum(['sandbox', 'production']),
        tenants: z.object({
            status: z.literal('active'),
            oem_tenant_memberships: z.array(z.object({
                auth_user_id: z.string().uuid(), status: z.literal('active'),
            })).length(1),
        }),
    }),
})).max(200);
const meterInventory = z.object({
    authorized: z.boolean(),
    meters: z.array(z.object({
        id: z.string().uuid(), external_id: z.string().min(1), serial: z.string().min(1),
        site_id: z.string().nullable(), meter_phase: z.string().nullable(), tariff_id: z.string().nullable(),
        status: z.enum(['active', 'stale']), last_seen_at: z.string().datetime({ offset: true }),
    })).max(101),
    next_cursor: z.string().uuid().nullable(),
});
const reconciliationSnapshot = z.object({
    authorized: z.boolean(),
    snapshot: z.object({
        customers: z.number().int().nonnegative(), meters: z.number().int().nonnegative(),
        checksum: z.string().min(1), completed_at: z.string().datetime({ offset: true }),
    }).nullable(),
});

/** Staff authentication and explicit server-managed grants both remain mandatory. */
const oemRoutes: FastifyPluginAsync = async (app) => {
    app.get('/installations/:installationId/reconciliation', { preHandler: app.requireStaff() }, async (req, reply) => {
        reply.header('Cache-Control', 'no-store');
        const actorId = req.actor?.type === 'staff' ? z.string().uuid().safeParse(req.actor.userId) : { success: false as const };
        const params = z.object({ installationId: z.string().uuid() }).safeParse(req.params);
        if (!actorId.success) return reply.code(403).send({ error: 'oem_access_denied' });
        if (!params.success) return reply.code(400).send({ error: 'invalid_oem_inventory_request' });
        const { data, error } = await adminClient.rpc('get_authorized_oem_inventory_reconciliation', {
            p_auth_user_id: actorId.data, p_installation_id: params.data.installationId,
        }).abortSignal(AbortSignal.timeout(10_000));
        const parsed = reconciliationSnapshot.safeParse(data);
        if (error || !parsed.success) return reply.code(503).send({ error: 'oem_inventory_unavailable' });
        if (!parsed.data.authorized) return reply.code(404).send({ error: 'oem_installation_not_found' });
        return { snapshot: parsed.data.snapshot && {
            customers: parsed.data.snapshot.customers, meters: parsed.data.snapshot.meters,
            checksum: parsed.data.snapshot.checksum, completedAt: parsed.data.snapshot.completed_at,
        } };
    });
    app.get('/installations/:installationId/meters', { preHandler: app.requireStaff() }, async (req, reply) => {
        reply.header('Cache-Control', 'no-store');
        const actorId = req.actor?.type === 'staff' ? z.string().uuid().safeParse(req.actor.userId) : { success: false as const };
        const params = z.object({ installationId: z.string().uuid() }).safeParse(req.params);
        const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), after: z.string().uuid().optional() }).safeParse(req.query);
        if (!actorId.success) return reply.code(403).send({ error: 'oem_access_denied' });
        if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_oem_inventory_request' });
        const { data, error } = await adminClient.rpc('list_authorized_oem_inventory_meters', {
            p_auth_user_id: actorId.data, p_installation_id: params.data.installationId,
            p_after: query.data.after ?? null, p_limit: query.data.limit,
        }).abortSignal(AbortSignal.timeout(10_000));
        const parsed = meterInventory.safeParse(data);
        if (error || !parsed.success) return reply.code(503).send({ error: 'oem_inventory_unavailable' });
        if (!parsed.data.authorized) return reply.code(404).send({ error: 'oem_installation_not_found' });
        return {
            meters: parsed.data.meters.map((row) => ({
                id: row.id, externalId: row.external_id, serial: row.serial, siteId: row.site_id,
                meterPhase: row.meter_phase, tariffId: row.tariff_id, status: row.status, lastSeenAt: row.last_seen_at,
            })),
            nextCursor: parsed.data.next_cursor,
        };
    });
    app.get('/installations', { preHandler: app.requireStaff() }, async (req, reply) => {
        reply.header('Cache-Control', 'no-store');
        if (!req.actor || req.actor.type !== 'staff' || !z.string().uuid().safeParse(req.actor.userId).success) {
            return reply.code(403).send({ error: 'oem_access_denied' });
        }
        const { data, error } = await adminClient.from('oem_actor_installation_access')
            .select('oem_installations!inner(id, tenant_id, display_name, status, environment, tenants!inner(status, oem_tenant_memberships!inner(auth_user_id, status)))')
            .eq('auth_user_id', req.actor.userId)
            .eq('status', 'active')
            .eq('oem_installations.tenants.status', 'active')
            .eq('oem_installations.tenants.oem_tenant_memberships.auth_user_id', req.actor.userId)
            .eq('oem_installations.tenants.oem_tenant_memberships.status', 'active')
            .order('oem_installation_id')
            .limit(201)
            .abortSignal(AbortSignal.timeout(10_000));
        const parsed = grantedInstallations.safeParse(data);
        if (error || !parsed.success) {
            return reply.code(503).send({ error: 'oem_inventory_unavailable' });
        }
        if (parsed.data.some(({ oem_installations: row }) => (
            row.tenants.oem_tenant_memberships[0]?.auth_user_id !== req.actor?.userId
        ))) return reply.code(503).send({ error: 'oem_inventory_unavailable' });
        return { installations: parsed.data.map(({ oem_installations: row }) => ({
            id: row.id, tenantId: row.tenant_id, displayName: row.display_name,
            status: row.status, environment: row.environment,
        })) };
    });
};

export default oemRoutes;
