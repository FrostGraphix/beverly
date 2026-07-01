import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    rpc: vi.fn(),
}));

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        rpc: mocks.rpc,
    },
}));

import {
    MeterOrderError,
    assertMeterOrderTransition,
    deterministicMeterOrderReference,
    runIdempotentMeterOrder,
} from '../meter-orders.js';

describe('meter order safeguards', () => {
    beforeEach(() => {
        mocks.rpc.mockReset();
    });

    it('builds deterministic channel references', () => {
        const first = deterministicMeterOrderReference('mord', ['customer', 'request-123']);
        const second = deterministicMeterOrderReference('mord', ['customer', 'request-123']);
        const different = deterministicMeterOrderReference('mord', ['customer', 'request-456']);
        expect(first).toBe(second);
        expect(first).not.toBe(different);
        expect(first).toMatch(/^mord_[a-f0-9]{32}$/);
    });

    it('rejects invalid lifecycle transitions', () => {
        expect(() => assertMeterOrderTransition('pending_payment', 'installed'))
            .toThrow(MeterOrderError);
        expect(() => assertMeterOrderTransition('paid', 'assigned')).not.toThrow();
    });

    it('returns completed replay payloads', async () => {
        mocks.rpc.mockResolvedValueOnce({
            data: { state: 'replay', response_payload: { order: { id: 'order-1' }, authorizationUrl: 'https://pay.test/1' } },
            error: null,
        });
        const operation = vi.fn();
        const result = await runIdempotentMeterOrder(
            'meter_order.customer.customer-1',
            'request-123',
            ['customer-1', 'single_phase'],
            operation,
        );
        expect(result).toEqual({ order: { id: 'order-1' }, authorizationUrl: 'https://pay.test/1' });
        expect(operation).not.toHaveBeenCalled();
    });

    it('completes newly claimed requests', async () => {
        mocks.rpc
            .mockResolvedValueOnce({ data: { state: 'claimed' }, error: null })
            .mockResolvedValueOnce({ data: null, error: null });
        const result = await runIdempotentMeterOrder(
            'meter_order.admin.staff-1',
            'request-123',
            ['customer-1', 'single_phase'],
            async () => ({ id: 'order-1' }),
        );
        expect(result).toEqual({ id: 'order-1' });
        expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'fn_complete_wallet_idempotency', {
            p_scope: 'meter_order.admin.staff-1',
            p_idempotency_key: 'request-123',
            p_response_payload: { id: 'order-1' },
        });
    });

    it('abandons failed claimed requests', async () => {
        mocks.rpc
            .mockResolvedValueOnce({ data: { state: 'claimed' }, error: null })
            .mockResolvedValueOnce({ data: null, error: null });
        await expect(runIdempotentMeterOrder(
            'meter_order.vendor.vendor-1',
            'request-123',
            ['customer-1', 'single_phase'],
            async () => { throw new Error('payment failed'); },
        )).rejects.toThrow('payment failed');
        expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'fn_abandon_wallet_idempotency', expect.objectContaining({
            p_scope: 'meter_order.vendor.vendor-1',
            p_idempotency_key: 'request-123',
        }));
    });

    it('blocks concurrent pending requests', async () => {
        mocks.rpc.mockResolvedValueOnce({ data: { state: 'pending' }, error: null });
        await expect(runIdempotentMeterOrder(
            'meter_order.customer.customer-1',
            'request-123',
            ['customer-1', 'single_phase'],
            async () => ({ id: 'order-1' }),
        )).rejects.toMatchObject({
            code: 'idempotency_in_progress',
            status: 409,
        });
    });
});
