import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    vendorUpdate: vi.fn(),
    signOut: vi.fn(),
    verifyVendorMfaChallenge: vi.fn(),
    lookupMeter: vi.fn(),
    assertOemVendAvailable: vi.fn(),
    VendorMfaError: class VendorMfaError extends Error {
        constructor(message: string, public code: string) {
            super(message);
            this.name = 'VendorMfaError';
        }
    },
    OemQuotaCircuitError: class OemQuotaCircuitError extends Error {
        constructor(
            message: string,
            public code = 'oem_insufficient_quota',
            public retryAfterSeconds: number,
        ) {
            super(message);
            this.name = 'OemQuotaCircuitError';
        }
    },
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
    verifyVendorMfaChallenge: mocks.verifyVendorMfaChallenge,
    verifyVendorMfaEnrollment: vi.fn(),
    VendorMfaError: mocks.VendorMfaError,
}));
vi.mock('../../services/token-engine.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../services/token-engine.js')>()),
    lookupMeter: mocks.lookupMeter,
}));
vi.mock('../../services/oem-quota-circuit.js', () => ({
    assertOemVendAvailable: mocks.assertOemVendAvailable,
    OemQuotaCircuitError: mocks.OemQuotaCircuitError,
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

async function createAuthenticatedApp() {
    const app = await createApp();
    app.addHook('onRequest', async (request) => {
        (request as any).actor = {
            actorId: 'vendor-user-1',
            userId: 'auth-user-1',
            type: 'vendor_user',
            role: 'vendor',
            email: 'owner@example.test',
            stationId: 'station-1',
        };
    });
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

describe('vendor MFA challenge HTTP seam', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns recovery guidance when the authenticator secret is unreadable', async () => {
        mocks.verifyVendorMfaChallenge.mockRejectedValue(new mocks.VendorMfaError(
            'Use a recovery code. Contact Beverly support if none remain.',
            'mfa_secret_invalid',
        ));
        const app = await createAuthenticatedApp();

        const response = await app.inject({
            method: 'POST',
            url: '/mfa/challenge/verify',
            headers: { authorization: 'Bearer access-token' },
            payload: { code: '519980' },
        });
        await app.close();

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({
            error: 'mfa_secret_invalid',
            message: 'Use a recovery code. Contact Beverly support if none remain.',
        });
    });
});

describe('vendor quota circuit HTTP seam', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.lookupMeter.mockResolvedValue({
            meterId: '47005375572',
            customerId: 'customer-1',
            customerName: 'Aisha Atairu',
            stationId: 'station-1',
            tariffId: 'commercial',
            oemId: 'calinmeter',
            liveVerified: true,
        });
    });

    it('blocks preview before wallet activity', async () => {
        mocks.assertOemVendAvailable.mockRejectedValue(new mocks.OemQuotaCircuitError(
            'OEM vending is paused while quota is restored. No wallet debit occurred.',
            'oem_insufficient_quota',
            240,
        ));
        const app = await createAuthenticatedApp();

        const response = await app.inject({
            method: 'POST',
            url: '/vend/preview',
            payload: { meterId: '47005375572', amountMinor: 100000 },
        });
        await app.close();

        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual({
            error: 'oem_insufficient_quota',
            message: 'OEM vending is paused while quota is restored. No wallet debit occurred.',
            details: {
                retryAfterSeconds: 240,
                noVendAttempted: true,
                noWalletHoldCreated: true,
            },
        });
    });
});
