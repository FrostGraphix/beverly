/**
 * Audit-tap plugin.
 *
 * For every successful (2xx) mutating request (POST/PUT/PATCH/DELETE),
 * write a coarse-grained audit row capturing route, status, actor, latency.
 *
 * Routes that need detailed before/after audit still call `logAction()`
 * explicitly with structured payloads. This tap catches the rest so we
 * never have a silent-mutation hole.
 *
 * Skipped paths:
 *   • /api/v1/webhooks/*      — webhooks have their own dedicated audit
 *   • /api/v1/customer/auth/* — OTP flows audit themselves with PII redaction
 *   • /healthz, /readyz       — health probes
 */
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { logAction, auditFromRequest } from '../services/audit.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const SKIP_PREFIXES = [
    '/api/v1/webhooks/',
    '/api/v1/customer/auth/',
    '/healthz',
    '/readyz',
];

function deriveAction(method: string, url: string): string {
    const path = url.split('?')[0]
        .replace(/^\/api\/v1\//, '')
        .replace(/\/[0-9a-f-]{8,}/gi, '/_id')  // mask UUIDs
        .replace(/\//g, '.')
        .replace(/[^a-z0-9._-]/gi, '_')
        .toLowerCase();
    return `${path}.${method.toLowerCase()}`;
}

const plugin: FastifyPluginAsync = async (fastify) => {
    fastify.addHook('onResponse', async (req, reply) => {
        const method = req.method.toUpperCase();
        if (!MUTATING.has(method)) return;
        const url = req.url ?? '';
        if (SKIP_PREFIXES.some((p) => url.startsWith(p))) return;
        if (reply.statusCode >= 400) return; // failure audited separately

        const ctx = auditFromRequest(req);
        const latencyMs = Math.round(reply.elapsedTime ?? 0);
        await logAction({
            actorUserId: ctx.actorUserId,
            actorType:   ctx.actorType,
            actorRole:   ctx.actorRole,
            action:      deriveAction(method, url),
            targetType:  null,
            targetId:    null,
            metadata: {
                method,
                path:        url.split('?')[0],
                statusCode:  reply.statusCode,
                latencyMs,
                requestSize: Number(req.headers['content-length'] ?? 0) || null,
            },
            ip:            ctx.ip,
            userAgent:     ctx.userAgent,
            correlationId: ctx.correlationId,
        });
    });
};

export default fp(plugin, { name: 'audit-tap' });
