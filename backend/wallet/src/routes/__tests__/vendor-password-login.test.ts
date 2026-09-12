import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    vendorUpdate: vi.fn(),
    signOut: vi.fn(),
}));

const vendor = {
    id: 'vendor-user-1',
    vendor_organization_id: 'vendor-org-1',
    role: 'vendor',
    full_name: 'Ada Vendor',
    phone: '+2348000000000',
    email: 'owner@example.test',
    email_verified_at: '2026-09-01T00:00:00.000Z',
    profile_picture_url: null,
    mfa_enrolled: false,
    password_reset_required: true,
    password_changed_at: '2026-09-12T12:00:00.000Z',
    password_session_id: 'password-reset:transition',
    vend_credential_type: null,
    vend_credential_set_at: null,
    status: 'active',
    vendor_organizations: { legal_name: 'Example Energy', trading_name: null, status: 'approved' },
};

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: (table: string) => ({
            select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: table === 'vendor_users' ? { ...vendor } : null, error: null }) }),
            }),
            update: (payload: Record<string, unknown>) => ({
                eq: async () => {
                    if (table === 'vendor_users') return mocks.vendorUpdate(payload);
                    return { error: null };
                },
            }),
        }),
        auth: { admin: { signOut: mocks.signOut, getUserById: vi.fn() } },
    },
}));
vi.mock('../../services/audit.js', () => ({
    logAction: vi.fn(async () => true),
    logSecurityEvent: vi.fn(async () => true),
}));
vi.mock('../../services/vendor-mfa.js', () => ({
    vendorMfaSessionVerified: vi.fn(async () => true),
    beginVendorMfaEnrollment: vi.fn(),
    beginVendorMfaReplacement: vi.fn(),
    disableVendorMfa: vi.fn(),
    regenerateVendorRecoveryCodes: vi.fn(),
    vendorMfaStatus: vi.fn(),
    verifyVendorMfaChallenge: vi.fn(),
    verifyVendorMfaEnrollment: vi.fn(),
    VendorMfaError: class VendorMfaError extends Error {},
}));

import vendorRoutes from '../vendor.js';

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = `${encode({ alg: 'none' })}.${encode({ iat: 1_757_678_400, session_id: 'new-session' })}.signature`;

async function createApp() {
    const app = Fastify();
    app.decorate('requireAuth', () => async () => undefined);
    app.decorate('requireVendor', () => async () => undefined);
    await app.register(vendorRoutes);
    return app;
}

describe('vendor password login HTTP seam', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.vendorUpdate.mockResolvedValue({ error: null });
        mocks.signOut.mockResolvedValue({ error: null });
        vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
        vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
        vi.stubGlobal('fetch', vi.fn(async (_url, init) => new Response(JSON.stringify({
            access_token: accessToken,
            refresh_token: 'refresh-token',
            user: {
                id: 'auth-user-1',
                email_confirmed_at: '2026-09-01T00:00:00.000Z',
                phone_confirmed_at: '2026-09-01T00:00:00.000Z',
            },
            request_body: init?.body,
        }), { status: 200, headers: { 'content-type': 'application/json' } })));
    });

    it('completes interrupted recovery and binds the new session', async () => {
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/auth/email/login',
            payload: { email: 'owner@example.test', password: 'River!Quartz92' },
        });
        await app.close();

        expect(response.statusCode).toBe(200);
        expect(response.json().vendor.password_reset_required).toBe(false);
        expect(mocks.vendorUpdate).toHaveBeenCalledWith({
            password_session_id: 'new-session',
            password_reset_required: false,
        });
    });

    it('mediates phone grants through the same boundary', async () => {
        const fetchMock = vi.mocked(fetch);
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/auth/email/login',
            payload: { phone: '+2348000000000', password: 'River!Quartz92' },
        });
        await app.close();

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
            phone: '+2348000000000',
            password: 'River!Quartz92',
        });
    });

    it('returns no session when binding fails', async () => {
        mocks.vendorUpdate.mockResolvedValue({ error: { message: 'database unavailable' } });
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/auth/email/login',
            payload: { email: 'owner@example.test', password: 'River!Quartz92' },
        });
        await app.close();

        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({ error: 'session_binding_failed' });
        expect(mocks.signOut).toHaveBeenCalledWith('auth-user-1', 'global');
    });
});
