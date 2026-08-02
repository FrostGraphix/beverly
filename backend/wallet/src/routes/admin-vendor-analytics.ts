import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getVendorAnalytics } from '../services/vendor-analytics.js';

const route: FastifyPluginAsync = async (fastify) => {
    fastify.get('/vendors/analytics', async (req, reply) => {
        const parsed = z.enum(['7d', '30d', '90d', 'all'])
            .safeParse((req.query as { period?: string }).period ?? '30d');
        if (!parsed.success) {
            return reply.code(400).send({
                error: 'bad_period',
                message: 'period must be 7d, 30d, 90d, or all.',
            });
        }
        const stationIds = req.actor?.role === 'super-admin'
            ? null
            : [...new Set((req.actor?.stationIds ?? [req.actor?.stationId])
                .map((value) => String(value ?? '').trim().toUpperCase())
                .filter(Boolean))];
        return getVendorAnalytics(parsed.data, stationIds);
    });
};

export default route;
