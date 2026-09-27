import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    captureHold: vi.fn(),
    deliveredUpdates: [] as Record<string, unknown>[],
    exceptions: [] as Record<string, unknown>[],
}));

vi.mock('../../services/ledger.js', () => ({ captureHold: state.captureHold }));
vi.mock('../../services/idempotency.js', () => ({
    ledgerKey: (...parts: string[]) => parts.join('.'),
}));
vi.mock('../../services/fraud-engine.js', () => ({ refreshCustomerBaseline: vi.fn() }));
vi.mock('../../services/vending.js', () => ({ reconcileRemoteSendOrders: vi.fn() }));
vi.mock('../../adapters/paystack.js', () => ({ verifyTransaction: vi.fn() }));
vi.mock('../../services/payment-transactions.js', () => ({
    fulfillSuccessfulPaystackTransaction: vi.fn(),
    markUnsuccessfulPaystackTransaction: vi.fn(),
}));
vi.mock('../../services/notifications.js', () => ({ notifyPaymentFailed: vi.fn() }));

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from(table: string) {
            if (table === 'purchase_orders') {
                return {
                    select: () => ({
                        eq: () => ({
                            not: () => ({
                                limit: async () => ({
                                    data: [{
                                        id: 'order-1', hold_id: 'hold-1', meter_id: '1234',
                                        created_by: 'customer-1', delivery_state: null, token: 'TOKEN',
                                    }],
                                }),
                            }),
                        }),
                    }),
                    update: (payload: Record<string, unknown>) => ({
                        eq: async () => {
                            state.deliveredUpdates.push(payload);
                            return { error: null };
                        },
                    }),
                };
            }
            if (table === 'wallet_holds') {
                return { select: () => ({ eq: () => ({ lt: async () => ({ data: [] }) }) }) };
            }
            if (table === 'operations_exceptions') {
                return {
                    upsert: async (payload: Record<string, unknown>[]) => {
                        state.exceptions.push(...payload);
                        return { error: null };
                    },
                };
            }
            throw new Error(`unexpected table ${table}`);
        },
    },
}));

import { sweepExpiredHolds } from '../scheduler.js';

describe('purchase recovery scheduler', () => {
    beforeEach(() => {
        state.captureHold.mockReset();
        state.deliveredUpdates.length = 0;
        state.exceptions.length = 0;
    });

    it('captures generated-token holds before marking delivery complete', async () => {
        state.captureHold.mockResolvedValue({ id: 'ledger-1' });
        await sweepExpiredHolds();
        expect(state.captureHold).toHaveBeenCalledOnce();
        expect(state.deliveredUpdates).toContainEqual({
            status: 'delivered',
            delivery_state: 'token_generated',
        });
    });

    it('keeps delivery incomplete when hold capture fails', async () => {
        state.captureHold.mockRejectedValue(new Error('ledger unavailable'));
        await sweepExpiredHolds();
        expect(state.deliveredUpdates).toHaveLength(0);
        expect(state.exceptions).toContainEqual(expect.objectContaining({
            category: 'purchase_recovery_failed',
            target_id: 'order-1',
            status: 'open',
        }));
    });
});
