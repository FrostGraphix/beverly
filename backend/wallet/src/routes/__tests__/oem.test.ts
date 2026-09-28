import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import oemRoutes from '../oem.js';

/** Authentication is a boundary fixture; storage remains the real HTTP client. */
async function inventoryApp(authenticated = true): Promise<FastifyInstance> {
    const app = Fastify();
    app.decorate('requireStaff', () => async (req) => {
        if (authenticated) req.actor = {
            userId: '11111111-1111-4111-8111-111111111111',
            actorId: '11111111-1111-4111-8111-111111111111',
            email: null, type: 'staff', role: 'operations-manager', mfaVerified: true,
        };
    });
    await app.register(oemRoutes);
    return app;
}

describe('OEM installation inventory HTTP boundary', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('returns no installations without explicit grants, ignoring caller scope', async () => {
        vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
            const url = new URL(input instanceof Request ? input.url : String(input));
            return url.searchParams.get('auth_user_id') === 'eq.11111111-1111-4111-8111-111111111111'
                ? Response.json([]) : Response.json([{ secret: 'foreign-installation' }]);
        });
        const app = await inventoryApp();
        try {
            const response = await app.inject('/installations?auth_user_id=another-user&tenant_id=another-tenant');
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({ installations: [] });
            expect(response.headers['cache-control']).toBe('no-store');
        } finally { await app.close(); }
    });
    it('denies missing staff authentication', async () => {
        vi.stubGlobal('fetch', async () => Response.json([]));
        const app = await inventoryApp(false);
        try {
            const response = await app.inject('/installations');
            expect(response.statusCode).toBe(403);
            expect(response.json()).toEqual({ error: 'oem_access_denied' });
        } finally { await app.close(); }
    });
    it.each([
        { label: 'storage failure', body: { message: 'sensitive-database-detail' }, status: 500 },
        { label: 'malformed joins', body: [{ oem_installations: null }], status: 200 },
        { label: 'inactive tenants', body: [{ oem_installations: {
            id: 'installation-b', tenant_id: 'tenant-b', display_name: 'Hidden',
            status: 'active', environment: 'production', tenants: { status: 'retired' },
        } }], status: 200 },
        { label: 'inventory overflow', body: Array.from({ length: 201 }, () => ({ oem_installations: {
            id: 'installation-a', tenant_id: 'tenant-a', display_name: 'Authorized',
            status: 'active', environment: 'production', tenants: { status: 'active' },
        } })), status: 200 },
    ])('fails closed for $label', async ({ body, status }) => {
        vi.stubGlobal('fetch', async () => Response.json(body, { status }));
        const app = await inventoryApp();
        try {
            const response = await app.inject('/installations');
            expect(response.statusCode).toBe(503);
            expect(response.json()).toEqual({ error: 'oem_inventory_unavailable' });
            expect(response.headers['cache-control']).toBe('no-store');
        } finally { await app.close(); }
    });
    it('rejects malformed actor identities before storage access', async () => {
        const app = Fastify();
        app.decorate('requireStaff', () => async (req) => {
            req.actor = { userId: '', actorId: 'staff', email: null, type: 'staff', role: 'operations-manager', mfaVerified: true };
        });
        vi.stubGlobal('fetch', async () => Response.json([]));
        await app.register(oemRoutes);
        try {
            const response = await app.inject('/installations');
            expect(response.statusCode).toBe(403);
            expect(response.json()).toEqual({ error: 'oem_access_denied' });
        } finally { await app.close(); }
    });
    it('returns only explicitly granted active tenant installations', async () => {
        const userId = '11111111-1111-4111-8111-111111111111';
        vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
            const url = new URL(input instanceof Request ? input.url : String(input));
            if (url.searchParams.get('auth_user_id') !== `eq.${userId}`
                || url.searchParams.get('status') !== 'eq.active'
                || url.searchParams.get('oem_installations.tenants.status') !== 'eq.active') {
                return new Response('{}', { status: 403 });
            }
            return Response.json([{ oem_installations: {
                id: 'installation-a', tenant_id: 'tenant-a', display_name: 'Authorized installation',
                status: 'draft', environment: 'sandbox', tenants: { status: 'active' },
            } }]);
        });
        const app = Fastify();
        app.decorate('requireStaff', () => async (req) => {
            req.actor = { userId, actorId: userId, email: null, type: 'staff', role: 'operations-manager', mfaVerified: true };
        });
        await app.register(oemRoutes);
        const response = await app.inject('/installations');
        await app.close();
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ installations: [{
            id: 'installation-a', tenantId: 'tenant-a', displayName: 'Authorized installation',
            status: 'draft', environment: 'sandbox',
        }] });
    });
});
