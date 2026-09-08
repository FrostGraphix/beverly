import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

class Query {
    private table: string;
    constructor(table: string) { this.table = table; }
    select() { return this; }
    eq() { return this; }
    or() { return this; }
    maybeSingle() {
        if (this.table === 'customers') {
            return Promise.resolve({
                data: {
                    id: 'customer-1',
                    kyc_tier: 0,
                    status: 'active',
                    email: 'ada@example.com',
                    auth_provider: 'email_password',
                    email_verified_at: null,
                },
                error: null,
            });
        }
        return Promise.resolve({ data: null, error: null });
    }
}

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'auth-1', email: 'ada@example.com', user_metadata: {} } }, error: null })) },
        from: (table: string) => new Query(table),
    },
}));
vi.mock('../vendor-mfa.js', () => ({ vendorMfaSessionVerified: vi.fn() }));
vi.mock('../vendor-password-change.js', () => ({ tokenAllowedAfterPasswordChange: () => true }));
vi.mock('../staff-mfa.js', () => ({ staffMfaEnrolled: vi.fn(), staffMfaSessionVerified: vi.fn() }));
vi.mock('../portal-session.js', () => ({
    enforcePortalSession: vi.fn(async () => 'session-1'),
    PortalSessionError: class extends Error {},
}));

describe('customer email verification gate', () => {
    it('blocks normal APIs but permits verification APIs', async () => {
        const { default: authPlugin } = await import('../../plugins/auth.js');
        const app = Fastify();
        await app.register(authPlugin);
        app.get('/standard', { preHandler: app.requireCustomer() }, async () => ({ ok: true }));
        app.get('/verification', { preHandler: app.requireCustomer({ allowUnverified: true }) }, async () => ({ ok: true }));

        const headers = { authorization: 'Bearer token' };
        const blocked = await app.inject({ method: 'GET', url: '/standard', headers });
        const allowed = await app.inject({ method: 'GET', url: '/verification', headers });

        expect(blocked.statusCode).toBe(403);
        expect(blocked.json()).toMatchObject({ error: 'email_verification_required' });
        expect(allowed.statusCode).toBe(200);
        await app.close();
    });
});
