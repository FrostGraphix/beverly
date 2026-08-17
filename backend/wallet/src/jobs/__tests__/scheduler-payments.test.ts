import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    transaction: {
        id: 'payment-1',
        gateway: 'paystack',
        gateway_reference: 'pay-ref-1',
        status: 'requires_review',
        actor_type: 'customer',
        actor_id: 'customer-1',
        amount_minor: 50_000,
        fulfillment_attempts: 4,
        metadata: { fulfillment_blocked_reason: 'token_delivery_failed' },
    } as Record<string, any>,
    updates: [] as Record<string, any>[],
    verifyTransaction: vi.fn(),
    fulfillSuccessful: vi.fn(),
    markUnsuccessful: vi.fn(),
    notifyPaymentFailed: vi.fn(),
}));

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: (table: string) => {
            const state: { update?: Record<string, any> } = {};
            const builder: any = {
                select: () => builder,
                update: (value: Record<string, any>) => { state.update = value; return builder; },
                eq: () => builder,
                in: () => builder,
                lt: () => builder,
                or: () => builder,
                limit: () => builder,
                then: (resolve: (value: any) => void) => {
                    if (state.update) {
                        mocks.updates.push(state.update);
                        return resolve({ data: null, error: null });
                    }
                    return resolve({ data: table === 'payment_transactions' ? [mocks.transaction] : [], error: null });
                },
            };
            return builder;
        },
    },
}));

vi.mock('../../adapters/paystack.js', () => ({
    verifyTransaction: mocks.verifyTransaction,
}));

vi.mock('../../services/payment-transactions.js', () => ({
    fulfillSuccessfulPaystackTransaction: mocks.fulfillSuccessful,
    markUnsuccessfulPaystackTransaction: mocks.markUnsuccessful,
}));

vi.mock('../../services/notifications.js', () => ({
    notifyPaymentFailed: mocks.notifyPaymentFailed,
}));

vi.mock('../../services/fraud-engine.js', () => ({ refreshCustomerBaseline: vi.fn() }));
vi.mock('../../services/vending.js', () => ({ reconcileRemoteSendOrders: vi.fn() }));

import { sweepPendingPayments } from '../scheduler.js';

describe('payment recovery scheduler', () => {
    beforeEach(() => {
        mocks.updates.length = 0;
        mocks.verifyTransaction.mockReset();
        mocks.fulfillSuccessful.mockReset();
        mocks.markUnsuccessful.mockReset();
        mocks.notifyPaymentFailed.mockReset();
        mocks.notifyPaymentFailed.mockResolvedValue(undefined);
    });

    it('never marks a gateway-paid transaction failed when local fulfillment exhausts retries', async () => {
        mocks.verifyTransaction.mockResolvedValue({
            status: 'success',
            reference: 'pay-ref-1',
            amount: 50_000,
            currency: 'NGN',
            paid_at: '2026-08-16T10:00:00.000Z',
            channel: 'card',
            customer: { email: 'customer@example.test', customer_code: 'CUS_1' },
        });
        mocks.fulfillSuccessful.mockRejectedValue(new Error('receipt database unavailable'));

        await sweepPendingPayments();

        expect(mocks.updates).toHaveLength(1);
        expect(mocks.updates[0]).toMatchObject({
            fulfillment_attempts: 5,
            fulfillment_next_retry_at: null,
            status: 'requires_review',
        });
        expect(mocks.notifyPaymentFailed).not.toHaveBeenCalled();
    });
});
