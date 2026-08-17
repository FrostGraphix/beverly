import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    rpc: vi.fn(),
}));

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        rpc: mocks.rpc,
    },
}));

import { observeVendorTransferRateLimit, transferVendorBalance, VendorTransferError } from '../vendor-transfers.js';

const input = {
    sourceVendorId: '11111111-1111-4111-8111-111111111111',
    destinationVendorId: '22222222-2222-4222-8222-222222222222',
    amountMinor: 250_000,
    reason: 'Move operating float to the replacement vendor account.',
    idempotencyKey: 'transfer-request-20260812-0001',
    requestedBy: '33333333-3333-4333-8333-333333333333',
};

const completed = {
    id: '44444444-4444-4444-8444-444444444444',
    status: 'completed',
    source_vendor_id: input.sourceVendorId,
    destination_vendor_id: input.destinationVendorId,
    source_wallet_id: '55555555-5555-4555-8555-555555555555',
    destination_wallet_id: '66666666-6666-4666-8666-666666666666',
    amount_minor: input.amountMinor,
    currency: 'NGN',
    reason: input.reason,
    idempotency_key: input.idempotencyKey,
    debit_entry_id: '77777777-7777-4777-8777-777777777777',
    credit_entry_id: '88888888-8888-4888-8888-888888888888',
    source_balance_after_minor: 750_000,
    destination_balance_after_minor: 500_000,
    created_by: input.requestedBy,
    created_at: '2026-08-12T10:00:00.000Z',
};

describe('vendor balance transfer service', () => {
    beforeEach(() => mocks.rpc.mockReset());

    it('returns the completed atomic transfer from the database seam', async () => {
        mocks.rpc.mockResolvedValue({ data: completed, error: null });

        await expect(transferVendorBalance(input)).resolves.toEqual(completed);
        expect(mocks.rpc).toHaveBeenCalledWith('fn_admin_transfer_vendor_balance', {
            p_source_vendor_id: input.sourceVendorId,
            p_destination_vendor_id: input.destinationVendorId,
            p_amount_minor: input.amountMinor,
            p_reason: input.reason,
            p_idempotency_key: input.idempotencyKey,
            p_created_by: input.requestedBy,
        });
    });

    it('fails safely when the database returns no transfer receipt', async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: null });

        await expect(transferVendorBalance(input)).rejects.toMatchObject({
            code: 'transfer_result_missing',
            status: 503,
        });
    });

    it('uses a shared hashed rate-limit key', async () => {
        mocks.rpc.mockResolvedValue({
            data: { count: 3, limit: 10, exceeded: false, retry_after_seconds: 41 },
            error: null,
        });

        await expect(observeVendorTransferRateLimit({
            actorUserId: input.requestedBy,
            ip: '203.0.113.10',
            maxRequests: 10,
            windowSeconds: 60,
        })).resolves.toEqual({ count: 3, limit: 10, exceeded: false, retryAfterSeconds: 41 });

        expect(mocks.rpc).toHaveBeenCalledWith('fn_observe_wallet_rate_limit', expect.objectContaining({
            p_scope: 'admin.vendor_transfer.create',
            p_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
            p_window_seconds: 60,
            p_max_requests: 10,
        }));
        expect(JSON.stringify(mocks.rpc.mock.calls[0])).not.toContain('203.0.113.10');
    });

    it.each([
        ['insufficient available balance', 'insufficient_balance', 409],
        ['source wallet is not active', 'source_wallet_inactive', 409],
        ['destination wallet is not active', 'destination_wallet_inactive', 409],
        ['source and destination vendors must differ', 'same_vendor', 400],
        ['idempotency key payload mismatch', 'idempotency_conflict', 409],
        ['daily debit cap exceeded', 'daily_debit_cap_exceeded', 409],
        ['monthly debit cap exceeded', 'monthly_debit_cap_exceeded', 409],
        ['wallet currencies must match', 'currency_mismatch', 409],
        ['vendor transfers are disabled', 'vendor_transfers_disabled', 503],
    ])('maps %s to a stable public failure', async (message, code, status) => {
        mocks.rpc.mockResolvedValue({ data: null, error: { message } });

        const promise = transferVendorBalance(input);
        await expect(promise).rejects.toBeInstanceOf(VendorTransferError);
        await expect(promise).rejects.toMatchObject({ code, status });
    });
});
