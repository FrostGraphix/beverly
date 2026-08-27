/**
 * Public routes — /api/v1/public/*
 * Unauthenticated endpoints (vendor application form only at Phase 2).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { submitPublicApplication } from '../services/vendor-onboarding.js';
import { listFaqCategories, listFaqs, voteFaq, incrementFaqView } from '../services/support.js';
import { listStationDirectory } from '../services/token-engine.js';
import { stationGeography } from '../config/station-geography.js';

const route: FastifyPluginAsync = async (fastify) => {
    fastify.get('/stations', async (_req, reply) => {
        try {
            const directory = await listStationDirectory();
            const stations = directory
                .filter((station) => station.status === 'active' && !/^(?:0001|STATION\s*0001)$/i.test(station.stationId.trim()))
                .map((station) => ({
                    stationId: station.stationId,
                    name: station.name,
                    status: station.status,
                    geography: stationGeography(station.stationId, station.name),
                }));
            return {
                stations,
                updatedAt: new Date().toISOString(),
                source: 'live_station_directory',
            };
        } catch (error) {
            fastify.log.warn({ err: error }, 'Public station directory unavailable');
            return reply.code(503).send({
                error: 'stations_unavailable',
                message: 'Live station coverage is temporarily unavailable.',
            });
        }
    });

    // ── Public FAQ knowledge base ──────────────────────────────────────────
    fastify.get('/faqs/categories', async (req) => {
        const { audience } = req.query as { audience?: 'all' | 'customer' | 'vendor' };
        return { categories: await listFaqCategories(audience ?? 'all') };
    });

    fastify.get('/faqs', async (req) => {
        const { audience, category, search } = req.query as {
            audience?: 'all' | 'customer' | 'vendor'; category?: string; search?: string;
        };
        return {
            faqs: await listFaqs({
                audience: audience ?? 'all',
                categoryId: category,
                search,
            }),
        };
    });

    fastify.post('/faqs/:id/view', async (req) => {
        const { id } = req.params as { id: string };
        await incrementFaqView(id).catch(() => undefined);
        return { ok: true };
    });

    fastify.post('/faqs/:id/vote', async (req, reply) => {
        const { id } = req.params as { id: string };
        const schema = z.object({ helpful: z.boolean() });
        let body: z.infer<typeof schema>;
        try { body = schema.parse(req.body); }
        catch (e: any) { return reply.code(400).send({ error: 'validation_error', message: e.message }); }
        try {
            await voteFaq(id, body.helpful);
            return { ok: true };
        } catch (e: any) {
            return reply.code(e.code === 'not_found' ? 404 : 400).send({ error: e.code ?? 'vote_error', message: e.message });
        }
    });

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
