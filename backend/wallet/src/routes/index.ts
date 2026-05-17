/**
 * Route registration.
 * All v1 routes registered here. Phase 1 ships health + scaffolds.
 */
import type { FastifyPluginAsync } from 'fastify';
import healthRoutes from './health.js';
import publicRoutes from './public.js';
import vendorRoutes from './vendor.js';
import adminRoutes from './admin.js';
import webhookRoutes from './webhooks.js';
import customerRoutes from './customer.js';

const routes: FastifyPluginAsync = async (fastify) => {
    await fastify.register(healthRoutes);

    await fastify.register(publicRoutes,   { prefix: '/api/v1/public'   });
    await fastify.register(vendorRoutes,   { prefix: '/api/v1/vendor'   });
    await fastify.register(adminRoutes,    { prefix: '/api/v1/admin'    });
    await fastify.register(webhookRoutes,  { prefix: '/api/v1/webhook'  });
    await fastify.register(customerRoutes, { prefix: '/api/v1/customer' });
};

export default routes;
