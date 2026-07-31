import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: {
    txs: Record<string, any>;
    orders: Record<string, any>;
} = { txs: {}, orders: {} };

function rowsFor(table: string): any[] {
    if (table === 'payment_transactions') return Object.values(store.txs);
    if (table === 'meter_purchase_orders') return Object.values(store.orders);
    return [];
}

function makeBuilder(table: string) {
    const state: any = { filters: {}, updateData: null };
    const resolve = () => rowsFor(table).filter((row) =>
        Object.entries(state.filters).every(([column, value]) => row[column] === value));
    const applyUpdate = () => {
        if (!state.updateData) return [];
        const targets = resolve();
        for (const row of targets) Object.assign(row, state.updateData);
        return targets;
    };
    const builder: any = {
        select: () => builder,
        update: (data: any) => { state.updateData = data; return builder; },
        insert: () => builder,
        eq: (column: string, value: any) => { state.filters[column] = value; return builder; },
        in: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
            const updated = applyUpdate();
            const rows = state.updateData ? updated : resolve();
            return { data: rows[0] ?? null, error: null };
        },
        single: async () => ({ data: resolve()[0] ?? null, error: null }),
        then: (r: any) => {
            const updated = applyUpdate();
            return r({ data: state.updateData ? updated : resolve(), error: null });
        },
    };
    return builder;
}

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: (table: string) => makeBuilder(table),
        rpc: async (fn: string, args: any) => {
            const tx = store.txs[args.p_payment_transaction_id];
            if (fn === 'fn_claim_payment_fulfillment') {
                if (!tx || tx.__claimed || tx.completed_at) return { data: false, error: null };
                tx.__claimed = args.p_lease_token;
                return { data: true, error: null };
            }
            if (fn === 'fn_release_payment_fulfillment') {
                if (tx && tx.__claimed === args.p_lease_token) tx.__claimed = null;
                return { data: true, error: null };
            }
            return { data: null, error: null };
        },
    },
}));

vi.mock('../../adapters/paystack.js', () => ({
    verifyTransaction: async (reference: string) => ({
        status: 'success',
        reference,
        // Payer bore the fee on a ₦50,000 single-phase meter order.
        amount: 5_007_614,
        currency: 'NGN',
        channel: 'card',
        paid_at: '2026-07-29T09:00:00.000Z',
        authorization: null,
    }),
}));

vi.mock('../ledger.js', () => ({ postEntry: async () => ({ id: 'entry-1' }) }));
vi.mock('../wallets.js', () => ({
    findWalletByOwner: async () => null,
    assertWalletCanTransact: () => undefined,
}));
vi.mock('../audit.js', () => ({ logAction: async () => undefined }));
vi.mock('../notifications.js', () => ({
    notifyWalletFunded: async () => undefined,
    notifyTokenPurchased: async () => undefined,
}));
vi.mock('../customer-purchase.js', () => ({
    sendTokenSmsToCustomer: async () => undefined,
    declaredMeterType: async () => null,
    effectiveThreePhase: () => false,
}));

import { processPaystackChargeSuccess } from '../payment-webhooks.js';

const ORDER_ID = 'order-1';

function seed(orderOverrides: Record<string, any> = {}) {
    store.txs = {
        'tx-m1': {
            id: 'tx-m1',
            gateway: 'paystack',
            gateway_reference: 'mord_abc123',
            status: 'initiated',
            purpose: 'meter_order',
            actor_type: 'customer',
            actor_id: 'cust-1',
            amount_minor: 5_000_000,
            completed_at: null,
            metadata: { meter_order_id: ORDER_ID },
            __claimed: null,
        },
    };
    store.orders = {
        [ORDER_ID]: {
            id: ORDER_ID,
            customer_id: 'cust-1',
            amount_minor: 5_000_000,
            status: 'pending_payment',
            payment_reference: 'mord_abc123',
            ...orderOverrides,
        },
    };
}

describe('meter order paystack fulfillment', () => {
    beforeEach(() => seed());

    it('marks the order paid from the webhook, with no customer callback needed', async () => {
        const result = await processPaystackChargeSuccess('mord_abc123', 'webhook');
        expect(result.status).toBe('fulfilled');
        expect(store.orders[ORDER_ID].status).toBe('paid');
    });

    it('accepts the fee-grossed charge rather than rejecting it as a mismatch', async () => {
        // ₦50,000 order settled as ₦50,076.14 because the payer bears the fee.
        const result = await processPaystackChargeSuccess('mord_abc123', 'webhook');
        expect(result.status).toBe('fulfilled');
        expect(store.txs['tx-m1'].metadata?.gateway_amount_kind).toBe('fee_surplus');
    });

    it('is idempotent across a webhook and a callback landing together', async () => {
        const [a, b] = await Promise.all([
            processPaystackChargeSuccess('mord_abc123', 'webhook'),
            processPaystackChargeSuccess('mord_abc123', 'callback'),
        ]);
        expect([a.status, b.status].sort()).toEqual(['already_fulfilled', 'fulfilled']);
        expect(store.orders[ORDER_ID].status).toBe('paid');
    });

    it('does not rewind an order that already moved past payment', async () => {
        seed({ status: 'dispatched' });
        const result = await processPaystackChargeSuccess('mord_abc123', 'webhook');
        expect(result.status).toBe('fulfilled');
        expect(store.orders[ORDER_ID].status).toBe('dispatched');
    });

    it('holds a payment against a cancelled order for review', async () => {
        seed({ status: 'cancelled' });
        const result = await processPaystackChargeSuccess('mord_abc123', 'webhook');
        expect(result.status).toBe('blocked');
        expect(result.reason).toBe('meter_order_cancelled');
    });

    it('holds a payment whose order amount does not match the transaction', async () => {
        seed({ amount_minor: 7_500_000 });
        const result = await processPaystackChargeSuccess('mord_abc123', 'webhook');
        expect(result.status).toBe('blocked');
        expect(result.reason).toBe('payment_amount_mismatch');
        expect(store.orders[ORDER_ID].status).toBe('pending_payment');
    });
});
