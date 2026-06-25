/**
 * Public routes — /api/v1/public/*
 * Unauthenticated endpoints (vendor application form only at Phase 2).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { submitPublicApplication } from '../services/vendor-onboarding.js';

const route: FastifyPluginAsync = async (fastify) => {
    fastify.post('/vendor-application', async (req) => {
        const schema = z.object({
            legalName: z.string().min(2),
            contactName: z.string().min(2),
            contactEmail: z.string().email(),
            contactPhone: z.string().min(8),
            businessType: z.string().optional(),
            operatingStations: z.array(z.string()).optional(),
            notes: z.string().max(1000).optional(),
        });
        const body = schema.parse(req.body);
        return submitPublicApplication({
            ...body,
            sourceIp: req.ip,
            userAgent: req.headers['user-agent'],
        });
    });
};

export default route;
