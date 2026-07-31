import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── In-memory stores ─────────────────────────────────────────────────────────
const store: {
    txs: Record<string, any>;
    funding: Record<string, any>;
    wallets: Record<string, any>;
    ledgerKeys: Map<string, number>;
} = { txs: {}, funding: {}, wallets: {}, ledgerKeys: new Map() };

function matches(row: any, filters: Record<string, any>): boolean {
    return Object.entries(filters).every(([column, value]) => {
        if (column === 'idempotency_key__in') return value.includes(row.idempotency_key);
        return row[column] === value;
    });
}

function rowsFor(table: string): any[] {
    if (table === 'payment_transactions') return Object.values(store.txs);
    if (table === 'funding_requests') return Object.values(store.funding);
    if (table === 'wallets') return Object.values(store.wallets);
    if (table === 'wallet_ledger_entries') {
        return [...store.ledgerKeys.keys()].map((key) => ({ id: `entry-${key}`, idempotency_key: key }));
    }
    return [];
}

function makeBuilder(table: string) {
    const state: any = { filters: {}, updateData: null };
    const resolveRows = () => rowsFor(table).filter((row) => matches(row, state.filters));
    const applyUpdate = () => {
        if (!state.updateData) return [];
        const targets = resolveRows();
        for (const row of targets) Object.assign(row, state.updateData);
        return targets;
    };
    const builder: any = {
        select: () => builder,
        update: (data: any) => { state.updateData = data; return builder; },
        insert: () => builder,
        eq: (column: string, value: any) => { state.filters[column] = value; return builder; },
        in: (column: string, values: any[]) => {
            if (column === 'idempotency_key') state.filters.idempotency_key__in = values;
            else state.filters[`${column}__in`] = values;
            return builder;
        },
        limit: () => builder,
        maybeSingle: async () => {
            const updated = applyUpdate();
            const rows = state.updateData ? updated : resolveRows();
            return { data: rows[0] ?? null, error: null };
        },
        single: async () => ({ data: resolveRows()[0] ?? null, error: null }),
        then: (resolve: any) => {
            const updated = applyUpdate();
            const rows = state.updateData ? updated : resolveRows();
            return resolve({ data: rows, error: null });
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
        // Payer bore the fee: ₦500 requested settles as ₦507.62.
        amount: 507_62,
        currency: 'NGN',
        channel: 'card',
        paid_at: '2026-07-29T07:28:33.000Z',
        authorization: null,
    }),
}));

vi.mock('../ledger.js', () => ({
    postEntry: async (input: any) => {
        store.ledgerKeys.set(input.idempotencyKey, (store.ledgerKeys.get(input.idempotencyKey) ?? 0) + 1);
        return { id: `entry-${input.idempotencyKey}`, amount_minor: input.amountMinor };
    },
}));

vi.mock('../wallets.js', () => ({
    findWalletByOwner: async () => store.wallets['wallet-v1'],
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
}));
vi.mock('../customer-purchase.js', () => ({
    sendTokenSmsToCustomer: async () => undefined,
    declaredMeterType: async () => null,
    effectiveThreePhase: () => false,
}));

import { processPaystackChargeSuccess } from '../payment-webhooks.js';

const FR_ID = 'fr-1';

function seed(fundingOverrides: Record<string, any> = {}) {
    store.txs = {
        'tx-v1': {
            id: 'tx-v1',
            gateway: 'paystack',
            gateway_reference: 'BEV-FND-PS-TEST',
            status: 'initiated',
            purpose: 'wallet_funding',
            actor_type: 'vendor',
            actor_id: 'org-1',
            amount_minor: 500_00,
            completed_at: null,
            metadata: { funding_request_id: FR_ID },
            __claimed: null,
        },
    };
    store.funding = {
        [FR_ID]: {
            id: FR_ID,
            vendor_organization_id: 'org-1',
            wallet_id: 'wallet-v1',
            amount_minor: 500_00,
            status: 'initiated',
            submitted_by: 'user-1',
            rejection_reason: null,
            approved_at: null,
            ...fundingOverrides,
        },
    };
    store.wallets = {
        'wallet-v1': { id: 'wallet-v1', owner_type: 'vendor', owner_id: 'org-1', currency: 'NGN', status: 'active' },
    };
    store.ledgerKeys = new Map();
}

describe('vendor paystack funding fulfillment', () => {
    beforeEach(() => seed());

    it('credits the requested amount when Paystack added its fee to the charge', async () => {
        const result = await processPaystackChargeSuccess('BEV-FND-PS-TEST', 'webhook');
        expect(result.status).toBe('fulfilled');
        expect(store.ledgerKeys.get(`funding.${FR_ID}.credit`)).toBe(1);
        expect(store.funding[FR_ID].status).toBe('approved');
    });

    it('posts under the key staff approval also uses, so the two cannot double-credit', async () => {
        await processPaystackChargeSuccess('BEV-FND-PS-TEST', 'webhook');
        expect([...store.ledgerKeys.keys()]).toEqual([`funding.${FR_ID}.credit`]);
        expect(store.ledgerKeys.has(`funding.${FR_ID}.paystack.credit`)).toBe(false);
    });

    it('does not re-credit a request already credited under the legacy gateway key', async () => {
        store.ledgerKeys.set(`funding.${FR_ID}.paystack.credit`, 1);
        const result = await processPaystackChargeSuccess('BEV-FND-PS-TEST', 'webhook');
        expect(result.status).toBe('fulfilled');
        expect(store.ledgerKeys.get(`funding.${FR_ID}.credit`)).toBeUndefined();
        expect(store.ledgerKeys.get(`funding.${FR_ID}.paystack.credit`)).toBe(1);
    });

    it('refuses to credit a request staff already rejected', async () => {
        seed({ status: 'rejected' });
        const result = await processPaystackChargeSuccess('BEV-FND-PS-TEST', 'webhook');
        expect(result.status).toBe('blocked');
        expect(result.reason).toBe('funding_request_rejected');
        expect(store.ledgerKeys.size).toBe(0);
        expect(store.funding[FR_ID].status).toBe('rejected');
    });

    it('refuses to credit an expired request', async () => {
        seed({ status: 'expired' });
        const result = await processPaystackChargeSuccess('BEV-FND-PS-TEST', 'webhook');
        expect(result.status).toBe('blocked');
        expect(store.ledgerKeys.size).toBe(0);
    });

    it('clears the stale block reason once the credit lands', async () => {
        seed({ status: 'under_review', rejection_reason: 'paystack_amount_mismatch: payment_amount_mismatch' });
        await processPaystackChargeSuccess('BEV-FND-PS-TEST', 'webhook');
        expect(store.funding[FR_ID].status).toBe('approved');
        expect(store.funding[FR_ID].rejection_reason).toBeNull();
    });
});
