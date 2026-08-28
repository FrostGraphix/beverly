import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    rpc: vi.fn(),
    from: vi.fn(),
}));

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        rpc: mocks.rpc,
        from: mocks.from,
    },
}));

import {
    MeterOrderError,
    assertMeterOrderTransition,
    deterministicMeterOrderReference,
    runIdempotentMeterOrder,
    getMeterPrices,
    updateMeterPrices,
    meterOrderAmountMinor,
    vendorMeterOrderCancellationEligibility,
    meterOrderRejectionEligibility,
} from '../meter-orders.js';

describe('meter order safeguards', () => {
    beforeEach(() => {
        mocks.rpc.mockReset();
    });

    it('allows vendor cancellation before six hours', () => {
        const result = vendorMeterOrderCancellationEligibility({
            status: 'paid',
            sponsor_mode: 'vendor_wallet',
            created_at: '2026-08-25T00:00:00.000Z',
        }, new Date('2026-08-25T05:59:59.000Z'));
        expect(result.eligible).toBe(true);
        expect(result.deadline).toBe('2026-08-25T06:00:00.000Z');
    });

    it('rejects cancellation after six hours', () => {
        const result = vendorMeterOrderCancellationEligibility({
            status: 'paid',
            sponsor_mode: 'vendor_wallet',
            created_at: '2026-08-25T00:00:00.000Z',
        }, new Date('2026-08-25T06:00:00.001Z'));
        expect(result).toMatchObject({ eligible: false, reason: 'cancellation_window_expired' });
    });

    it('rejects cancellation after approval', () => {
        const result = vendorMeterOrderCancellationEligibility({
            status: 'assigned',
            sponsor_mode: 'vendor_wallet',
            created_at: '2026-08-25T00:00:00.000Z',
        }, new Date('2026-08-25T01:00:00.000Z'));
        expect(result).toMatchObject({ eligible: false, reason: 'order_approved' });
    });

    it('allows rejection before fulfillment approval', () => {
        expect(meterOrderRejectionEligibility('pending_payment')).toEqual({ eligible: true, refundRequired: false });
        expect(meterOrderRejectionEligibility('paid')).toEqual({ eligible: true, refundRequired: true });
    });

    it('blocks rejection after fulfillment approval', () => {
        expect(meterOrderRejectionEligibility('assigned')).toEqual({ eligible: false, refundRequired: false });
        expect(meterOrderRejectionEligibility('installed')).toEqual({ eligible: false, refundRequired: false });
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

    it('calculates meter order amount by property category', async () => {
        mocks.from.mockReturnValue({
            select: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                    data: [
                        { key: 'meter_price_residential_minor', value: 3000000 },
                        { key: 'meter_price_commercial_minor', value: 15000000 },
                    ],
                }),
            }),
        });

        const resPrice = await meterOrderAmountMinor('residential');
        const commPrice = await meterOrderAmountMinor('commercial');
        expect(resPrice).toBe(3_000_000);
        expect(commPrice).toBe(15_000_000);
    });
});
