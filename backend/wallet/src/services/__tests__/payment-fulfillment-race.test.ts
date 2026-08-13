import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── In-memory stores ─────────────────────────────────────────────────────────
const store: {
    txs: Record<string, any>;
    wallets: Record<string, any>;
    ledgerKeys: Map<string, number>;
    failNextPost: boolean;
} = {
    txs: {},
    wallets: {},
    ledgerKeys: new Map(),
    failNextPost: false,
};

function findRow(table: string, filters: Record<string, any>) {
    if (table === 'payment_transactions') {
        return Object.values(store.txs).find((tx) =>
            Object.entries(filters).every(([column, value]) => {
                if (column === 'gateway') return tx.gateway === value;
                if (column === 'gateway_reference') return tx.gateway_reference === value;
                if (column === 'id') return tx.id === value;
                return true;
            })) ?? null;
    }
    if (table === 'wallets') {
        return Object.values(store.wallets).find((w) => w.id === filters.id) ?? null;
    }
    if (table === 'wallet_ledger_entries') {
        return store.ledgerKeys.has(filters.idempotency_key) ? { id: 'existing' } : null;
    }
    return null;
}

function makeBuilder(table: string) {
    const state: any = { table, filters: {}, updateData: null };
    const builder: any = {
        select: () => builder,
        update: (data: any) => { state.updateData = data; return builder; },
        eq: (column: string, value: any) => { state.filters[column] = value; return builder; },
        in: () => builder,
        maybeSingle: async () => ({ data: findRow(table, state.filters), error: null }),
        then: (resolve: any) => {
            if (state.updateData && table === 'payment_transactions') {
                const tx = store.txs[state.filters.id];
                if (tx) {
                    Object.assign(tx, state.updateData);
                    if (state.updateData.fulfillment_lease_token === null) tx.__claimed = null;
                }
            }
            return resolve({ data: null, error: null });
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
                if (!tx) return { data: false, error: null };
                const completed = tx.status === 'succeeded' && tx.metadata?.fulfillment_completed_at;
                if (tx.__claimed || completed) return { data: false, error: null };
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
    verifiedPrincipalAmount: (result: { amount: number; requestedAmount?: number }) => result.requestedAmount ?? result.amount,
    verifyTransaction: async (reference: string) => ({
        status: reference.includes('abandoned') ? 'abandoned' : reference.includes('pending') ? 'pending' : 'success',
        reference: reference.includes('wrong-reference') ? 'different-reference' : reference,
        amount: reference.includes('fee-bearing') ? 507_62 : 500_00,
        requestedAmount: reference.includes('fee-bearing') ? 500_00 : undefined,
        fees: reference.includes('fee-bearing') ? 7_62 : undefined,
        currency: reference.includes('wrong-currency') ? 'USD' : 'NGN',
        channel: 'card',
        paid_at: '2026-07-15T10:00:00.000Z',
        authorization: null,
    }),
}));

vi.mock('../ledger.js', () => ({
    postEntry: async (input: any) => {
        if (store.failNextPost) {
            store.failNextPost = false;
            throw new Error('transient ledger outage');
        }
        store.ledgerKeys.set(input.idempotencyKey, (store.ledgerKeys.get(input.idempotencyKey) ?? 0) + 1);
        return { id: `entry-${input.idempotencyKey}` };
    },
}));

vi.mock('../wallets.js', () => ({
    findWalletByOwner: async () => store.wallets['wallet-1'],
    assertWalletCanTransact: (wallet: any) => {
        if (!wallet || wallet.status !== 'active') {
            const error: any = new Error('wallet inactive');
            error.code = 'wallet_inactive';
            throw error;
        }
    },
}));

vi.mock('../audit.js', () => ({ logAction: async () => undefined }));
vi.mock('../notifications.js', () => ({
    notifyWalletFunded: async () => undefined,
    notifyTokenPurchased: async () => undefined,
    notifyPaymentFailed: async () => undefined,
}));
vi.mock('../customer-purchase.js', () => ({
    sendTokenSmsToCustomer: async () => undefined,
    declaredMeterType: async () => null,
    effectiveThreePhase: () => false,
}));

import { processPaystackChargeSuccess } from '../payment-webhooks.js';

function seedFundingTransaction() {
    store.txs = {
        'tx-1': {
            id: 'tx-1',
            gateway: 'paystack',
            gateway_reference: 'ref-race-1',
            status: 'pending',
            purpose: 'wallet_funding',
            actor_type: 'customer',
            actor_id: 'cust-1',
            amount_minor: 500_00,
            metadata: { wallet_id: 'wallet-1' },
            __claimed: null,
        },
    };
    store.wallets = {
        'wallet-1': { id: 'wallet-1', owner_type: 'customer', owner_id: 'cust-1', currency: 'NGN', status: 'active' },
    };
    store.ledgerKeys = new Map();
    store.failNextPost = false;
}

describe('paystack fulfillment race safety', () => {
    beforeEach(seedFundingTransaction);

    it('credits exactly once when the same webhook lands twice concurrently', async () => {
        const [first, second] = await Promise.all([
            processPaystackChargeSuccess('ref-race-1', 'webhook'),
            processPaystackChargeSuccess('ref-race-1', 'webhook'),
        ]);
        const statuses = [first.status, second.status].sort();
        expect(statuses).toEqual(['already_fulfilled', 'fulfilled']);
        expect(store.ledgerKeys.get('customer_fund.tx-1.paystack.credit')).toBe(1);
    });

    it('rejects a sequential replay after fulfillment completes', async () => {
        const first = await processPaystackChargeSuccess('ref-race-1', 'webhook');
        expect(first.status).toBe('fulfilled');
        const replay = await processPaystackChargeSuccess('ref-race-1', 'webhook');
        expect(replay.status).toBe('already_fulfilled');
        expect(store.ledgerKeys.get('customer_fund.tx-1.paystack.credit')).toBe(1);
    });

    it('releases the lease on crash so the scheduler retry can credit once', async () => {
        store.failNextPost = true;
        await expect(processPaystackChargeSuccess('ref-race-1', 'webhook')).rejects.toThrow('transient ledger outage');
        expect(store.txs['tx-1'].__claimed).toBeNull();

        const retry = await processPaystackChargeSuccess('ref-race-1', 'scheduler');
        expect(retry.status).toBe('fulfilled');
        expect(store.ledgerKeys.get('customer_fund.tx-1.paystack.credit')).toBe(1);
    });

    it('blocks on amount mismatch without touching the ledger', async () => {
        store.txs['tx-1'].amount_minor = 499_99;
        const result = await processPaystackChargeSuccess('ref-race-1', 'webhook');
        expect(result.status).toBe('blocked');
        expect(result.reason).toBe('payment_amount_mismatch');
        expect(store.ledgerKeys.size).toBe(0);
        expect(store.txs['tx-1'].status).toBe('requires_review');
        expect(store.txs['tx-1'].metadata?.fulfillment_completed_at).toBeUndefined();
    });

    it('fulfills when Paystack adds payer fees above the requested principal', async () => {
        store.txs['tx-1'].gateway_reference = 'ref-fee-bearing';
        const result = await processPaystackChargeSuccess('ref-fee-bearing', 'webhook');
        expect(result.status).toBe('fulfilled');
        expect(store.ledgerKeys.get('customer_fund.tx-1.paystack.credit')).toBe(1);
        expect(store.txs['tx-1'].status).toBe('succeeded');
        expect(store.txs['tx-1'].metadata?.paystack?.amount).toBe(507_62);
        expect(store.txs['tx-1'].metadata?.paystack?.requestedAmount).toBe(500_00);
    });

    it('closes an abandoned payment', async () => {
        store.txs['tx-1'].gateway_reference = 'ref-abandoned';
        const result = await processPaystackChargeSuccess('ref-abandoned', 'callback');
        expect(result.status).toBe('failed');
        expect(store.txs['tx-1'].status).toBe('failed');
        expect(store.ledgerKeys.size).toBe(0);
    });

    it('blocks on reference mismatch without touching the ledger', async () => {
        store.txs['tx-1'].gateway_reference = 'ref-wrong-reference';
        const result = await processPaystackChargeSuccess('ref-wrong-reference', 'webhook');
        expect(result).toEqual({ status: 'blocked', reason: 'payment_reference_mismatch' });
        expect(store.ledgerKeys.size).toBe(0);
    });

    it('blocks non-NGN payments without touching the ledger', async () => {
        store.txs['tx-1'].gateway_reference = 'ref-wrong-currency';
        const result = await processPaystackChargeSuccess('ref-wrong-currency', 'webhook');
        expect(result).toEqual({ status: 'blocked', reason: 'payment_currency_mismatch' });
        expect(store.ledgerKeys.size).toBe(0);
    });

    it('ignores webhooks whose gateway verification is not success', async () => {
        store.txs['tx-1'].gateway_reference = 'ref-pending-1';
        const result = await processPaystackChargeSuccess('ref-pending-1', 'webhook');
        expect(result.status).toBe('ignored');
        expect(store.ledgerKeys.size).toBe(0);
    });

    it('blocks funding into a frozen wallet and flags ops review', async () => {
        store.wallets['wallet-1'].status = 'frozen';
        const result = await processPaystackChargeSuccess('ref-race-1', 'webhook');
        expect(result.status).toBe('blocked');
        expect(result.reason).toBe('wallet_inactive');
        expect(store.ledgerKeys.size).toBe(0);
        expect(store.txs['tx-1'].metadata?.fulfillment_blocked).toBe(true);
        expect(store.txs['tx-1'].status).toBe('requires_review');
    });

    it('blocks when the customer funding target is missing', async () => {
        delete store.txs['tx-1'].metadata.wallet_id;
        const result = await processPaystackChargeSuccess('ref-race-1', 'webhook');
        expect(result).toEqual({ status: 'blocked', reason: 'wallet_target_missing' });
        expect(store.ledgerKeys.size).toBe(0);
        expect(store.txs['tx-1'].status).toBe('requires_review');
    });

    it('blocks when the target wallet belongs to another customer', async () => {
        store.wallets['wallet-1'].owner_id = 'cust-other';
        const result = await processPaystackChargeSuccess('ref-race-1', 'webhook');
        expect(result).toEqual({ status: 'blocked', reason: 'wallet_owner_mismatch' });
        expect(store.ledgerKeys.size).toBe(0);
        expect(store.txs['tx-1'].status).toBe('requires_review');
    });

    it('blocks unsupported payment targets instead of silently succeeding', async () => {
        store.txs['tx-1'].purpose = 'unknown';
        const result = await processPaystackChargeSuccess('ref-race-1', 'webhook');
        expect(result).toEqual({ status: 'blocked', reason: 'unsupported_payment_target' });
        expect(store.ledgerKeys.size).toBe(0);
        expect(store.txs['tx-1'].status).toBe('requires_review');
    });
});
