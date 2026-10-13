import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    captureHold: vi.fn(),
    deliveredUpdates: [] as Record<string, unknown>[],
    exceptions: [] as Record<string, unknown>[],
    hold: { status: 'active', wallet_id: 'wallet-1', amount_minor: 1000 } as Record<string, unknown>,
    debits: [] as Record<string, unknown>[],
    orders: [] as Record<string, unknown>[],
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
                                or: () => ({ limit: async () => ({ data: state.orders.filter(
                                    (order) => order.delivery_state == null || order.delivery_state === 'token_generated',
                                ) }) }),
                            }),
                        }),
                    }),
                    update: (payload: Record<string, unknown>) => ({
                        eq: () => ({ eq: async () => {
                            state.deliveredUpdates.push(payload);
                            return { error: null };
                        } }),
                    }),
                };
            }
            if (table === 'wallet_holds') {
                return { select: () => ({ eq: () => ({
                    lt: async () => ({ data: [] }),
                    single: async () => ({ data: state.hold, error: null }),
                }) }) };
            }
            if (table === 'wallet_ledger_entries') {
                return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({
                    eq: async () => ({ data: state.debits, error: null }),
                }) }) }) }) };
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
        state.hold = { status: 'active', wallet_id: 'wallet-1', amount_minor: 1000 };
        state.debits = [];
        state.orders = [{ id: 'order-1', hold_id: 'hold-1', meter_id: '1234',
            created_by: 'customer-1', delivery_state: null, token: 'TOKEN' }];
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

    it('does not recapture an already captured hold with a matching debit', async () => {
        state.hold.status = 'captured';
        state.debits = [{ id: 'debit-1', wallet_id: 'wallet-1', amount_minor: 1000 }];
        await sweepExpiredHolds();
        expect(state.captureHold).not.toHaveBeenCalled();
        expect(state.deliveredUpdates).toHaveLength(1);
    });

    it('does not mark delivery when a captured hold has no matching debit', async () => {
        state.hold.status = 'captured';
        await sweepExpiredHolds();
        expect(state.deliveredUpdates).toHaveLength(0);
        expect(state.exceptions).toHaveLength(1);
    });

    it('leaves remote-send purchases in their own delivery workflow', async () => {
        state.orders[0].delivery_state = 'remote_send_pending_review';
        state.hold.status = 'captured';
        await sweepExpiredHolds();
        expect(state.captureHold).not.toHaveBeenCalled();
        expect(state.deliveredUpdates).toHaveLength(0);
        expect(state.exceptions).toHaveLength(0);
    });
});
