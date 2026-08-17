import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    transferVendorBalance: vi.fn(),
    listTransferVendors: vi.fn(),
    previewVendorTransfer: vi.fn(),
    listVendorTransfers: vi.fn(),
    getVendorTransfer: vi.fn(),
    observeVendorTransferRateLimit: vi.fn(),
    logAction: vi.fn(async () => true),
    logSecurityEvent: vi.fn(async () => true),
    rateLimitMode: 'observe' as 'off' | 'observe' | 'enforce',
}));

vi.mock('../../services/vendor-transfers.js', () => ({
    transferVendorBalance: mocks.transferVendorBalance,
    listTransferVendors: mocks.listTransferVendors,
    previewVendorTransfer: mocks.previewVendorTransfer,
    listVendorTransfers: mocks.listVendorTransfers,
    getVendorTransfer: mocks.getVendorTransfer,
    observeVendorTransferRateLimit: mocks.observeVendorTransferRateLimit,
    VendorTransferError: class VendorTransferError extends Error {
        constructor(message: string, public code: string, public status: number) {
            super(message);
        }
    },
}));

vi.mock('../../services/audit.js', () => ({
    logAction: mocks.logAction,
    logSecurityEvent: mocks.logSecurityEvent,
    auditFromRequest: () => ({ ip: '127.0.0.1', userAgent: 'test', correlationId: 'test-correlation' }),
}));

vi.mock('../../services/idempotency.js', () => ({
    assertClientIdempotencyKey: (value: unknown) => {
        const key = typeof value === 'string' ? value.trim() : '';
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/.test(key)) throw new Error('invalid key');
        return key;
    },
}));

vi.mock('../../config/env.js', () => ({
    env: {
        FEATURE_VENDOR_BALANCE_TRANSFERS: true,
        get VENDOR_TRANSFER_RATE_LIMIT_MODE() { return mocks.rateLimitMode; },
        VENDOR_TRANSFER_RATE_LIMIT_MAX: 10,
        VENDOR_TRANSFER_RATE_LIMIT_WINDOW_SECONDS: 60,
    },
}));

import adminVendorTransferRoutes from '../admin-vendor-transfers.js';

const completed = {
    id: '44444444-4444-4444-8444-444444444444',
    status: 'completed',
    source_vendor_id: '11111111-1111-4111-8111-111111111111',
    destination_vendor_id: '22222222-2222-4222-8222-222222222222',
    source_wallet_id: '55555555-5555-4555-8555-555555555555',
    destination_wallet_id: '66666666-6666-4666-8666-666666666666',
    amount_minor: 250_000,
    currency: 'NGN',
    reason: 'Move operating float to the replacement vendor account.',
    idempotency_key: 'transfer-request-20260812-0001',
    debit_entry_id: '77777777-7777-4777-8777-777777777777',
    credit_entry_id: '88888888-8888-4888-8888-888888888888',
    source_balance_after_minor: 750_000,
    destination_balance_after_minor: 500_000,
    created_by: '33333333-3333-4333-8333-333333333333',
    created_at: '2026-08-12T10:00:00.000Z',
};

async function appFor(role: string, mfaVerified = true) {
    const app = Fastify();
    app.addHook('preHandler', async (req) => {
        req.actor = {
            userId: completed.created_by,
            email: 'operator@example.com',
            type: 'staff',
            role,
            actorId: completed.created_by,
            mfaVerified,
            mfaEnrolled: true,
        };
    });
    await app.register(adminVendorTransferRoutes);
    return app;
}

const request = {
    method: 'POST' as const,
    url: '/vendor-transfers',
    headers: { 'idempotency-key': completed.idempotency_key },
    payload: {
        source_vendor_id: completed.source_vendor_id,
        destination_vendor_id: completed.destination_vendor_id,
        amount_minor: completed.amount_minor,
        reason: completed.reason,
        confirmed: true,
    },
};

describe('Wallet Admin vendor transfer HTTP seam', () => {
    beforeEach(() => {
        mocks.transferVendorBalance.mockReset();
        mocks.listTransferVendors.mockReset();
        mocks.previewVendorTransfer.mockReset();
        mocks.listVendorTransfers.mockReset();
        mocks.getVendorTransfer.mockReset();
        mocks.observeVendorTransferRateLimit.mockReset();
        mocks.logAction.mockClear();
        mocks.logSecurityEvent.mockClear();
        mocks.rateLimitMode = 'observe';
        mocks.transferVendorBalance.mockResolvedValue(completed);
        mocks.listTransferVendors.mockResolvedValue([{ vendorId: completed.source_vendor_id, walletId: completed.source_wallet_id, name: 'Source Vendor', currency: 'NGN', availableMinor: 1_000_000 }]);
        mocks.previewVendorTransfer.mockResolvedValue({ amountMinor: completed.amount_minor, currency: 'NGN', sourceBalanceAfterMinor: 750_000, destinationBalanceAfterMinor: 500_000 });
        mocks.listVendorTransfers.mockResolvedValue({ transfers: [completed], nextCursor: null });
        mocks.getVendorTransfer.mockResolvedValue(completed);
        mocks.observeVendorTransferRateLimit.mockResolvedValue({ count: 1, limit: 10, exceeded: false, retryAfterSeconds: 60 });
    });

    it.each(['super-admin', 'developer'])('allows confirmed MFA transfer for %s', async (role) => {
        const app = await appFor(role);
        const response = await app.inject(request);
        await app.close();

        expect(response.statusCode).toBe(201);
        expect(response.json()).toEqual({ transfer: completed });
        expect(mocks.transferVendorBalance).toHaveBeenCalledWith(expect.objectContaining({
            requestedBy: completed.created_by,
            idempotencyKey: completed.idempotency_key,
        }));
        expect(mocks.observeVendorTransferRateLimit).toHaveBeenCalledOnce();
    });

    it.each(['finance-checker', 'operations-manager', 'account', 'custom-transfer-role'])('denies %s even when routed here', async (role) => {
        const app = await appFor(role);
        const response = await app.inject(request);
        await app.close();

        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({ error: 'vendor_transfer_role_required' });
        expect(mocks.transferVendorBalance).not.toHaveBeenCalled();
    });

    it('requires verified MFA', async () => {
        const app = await appFor('super-admin', false);
        const response = await app.inject(request);
        await app.close();

        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({ error: 'mfa_required' });
    });

    it('allows page reads before MFA verification', async () => {
        const app = await appFor('super-admin', false);
        const vendors = await app.inject({ method: 'GET', url: '/vendor-transfers/vendors' });
        const history = await app.inject({ method: 'GET', url: '/vendor-transfers?limit=20' });
        await app.close();

        expect(vendors.statusCode).toBe(200);
        expect(history.statusCode).toBe(200);
        expect(mocks.listTransferVendors).toHaveBeenCalledOnce();
        expect(mocks.listVendorTransfers).toHaveBeenCalledOnce();
    });

    it('observes first, then enforces safely', async () => {
        mocks.observeVendorTransferRateLimit.mockResolvedValue({ count: 11, limit: 10, exceeded: true, retryAfterSeconds: 27 });
        const observingApp = await appFor('super-admin');
        const observed = await observingApp.inject(request);
        await observingApp.close();

        expect(observed.statusCode).toBe(201);
        expect(mocks.logSecurityEvent).toHaveBeenCalledWith('rate_limit_hit', expect.objectContaining({ severity: 'high' }));

        mocks.rateLimitMode = 'enforce';
        mocks.transferVendorBalance.mockClear();
        const enforcingApp = await appFor('super-admin');
        const enforced = await enforcingApp.inject(request);
        await enforcingApp.close();

        expect(enforced.statusCode).toBe(429);
        expect(enforced.headers['retry-after']).toBe('27');
        expect(mocks.transferVendorBalance).not.toHaveBeenCalled();
    });

    it('requires explicit confirmation and an idempotency key', async () => {
        const app = await appFor('super-admin');
        const unconfirmed = await app.inject({ ...request, payload: { ...request.payload, confirmed: false } });
        const noKey = await app.inject({ ...request, headers: {} });
        await app.close();

        expect(unconfirmed.statusCode).toBe(400);
        expect(noKey.statusCode).toBe(400);
        expect(mocks.transferVendorBalance).not.toHaveBeenCalled();
    });

    it('serves eligible vendor lookup, preview, history, and receipt detail', async () => {
        const app = await appFor('developer');
        const vendors = await app.inject({ method: 'GET', url: '/vendor-transfers/vendors?q=source' });
        const preview = await app.inject({
            method: 'POST',
            url: '/vendor-transfers/preview',
            payload: {
                source_vendor_id: completed.source_vendor_id,
                destination_vendor_id: completed.destination_vendor_id,
                amount_minor: completed.amount_minor,
            },
        });
        const history = await app.inject({ method: 'GET', url: '/vendor-transfers?limit=20' });
        const detail = await app.inject({ method: 'GET', url: `/vendor-transfers/${completed.id}` });
        await app.close();

        expect(vendors.statusCode).toBe(200);
        expect(preview.statusCode).toBe(200);
        expect(history.statusCode).toBe(200);
        expect(detail.statusCode).toBe(200);
        expect(detail.json()).toEqual({ transfer: completed });
    });
});
