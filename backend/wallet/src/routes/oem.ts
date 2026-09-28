import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminClient } from '../db/supabase.js';

// ponytail: fail closed above 200 grants; add cursor pagination when needed.
const grantedInstallations = z.array(z.object({
    oem_installations: z.object({
        id: z.string().min(1), tenant_id: z.string().min(1), display_name: z.string(),
        status: z.enum(['draft', 'active', 'suspended', 'retired']),
        environment: z.enum(['sandbox', 'production']),
        tenants: z.object({ status: z.literal('active') }),
    }),
})).max(200);

/** Staff authentication and explicit server-managed grants both remain mandatory. */
const oemRoutes: FastifyPluginAsync = async (app) => {
    app.get('/installations', { preHandler: app.requireStaff() }, async (req, reply) => {
        reply.header('Cache-Control', 'no-store');
        if (!req.actor || req.actor.type !== 'staff' || !z.string().uuid().safeParse(req.actor.userId).success) {
            return reply.code(403).send({ error: 'oem_access_denied' });
        }
        const { data, error } = await adminClient.from('oem_actor_installation_access')
            .select('oem_installations!inner(id, tenant_id, display_name, status, environment, tenants!inner(status))')
            .eq('auth_user_id', req.actor.userId)
            .eq('status', 'active')
            .eq('oem_installations.tenants.status', 'active')
            .order('oem_installation_id')
            .limit(201)
            .abortSignal(AbortSignal.timeout(10_000));
        const parsed = grantedInstallations.safeParse(data);
        if (error || !parsed.success) {
            return reply.code(503).send({ error: 'oem_inventory_unavailable' });
        }
        return { installations: parsed.data.map(({ oem_installations: row }) => ({
            id: row.id, tenantId: row.tenant_id, displayName: row.display_name,
            status: row.status, environment: row.environment,
        })) };
    });
};

export default oemRoutes;
