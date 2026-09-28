import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    rpc: vi.fn(),
}));

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        rpc: mocks.rpc,
    },
}));

vi.mock('../../adapters/paystack.js', () => ({ verifyTransaction: vi.fn() }));
vi.mock('../../services/payment-transactions.js', () => ({
    fulfillSuccessfulPaystackTransaction: vi.fn(),
    markUnsuccessfulPaystackTransaction: vi.fn(),
}));
vi.mock('../../services/fraud-engine.js', () => ({ refreshCustomerBaseline: vi.fn() }));
vi.mock('../../services/vending.js', () => ({ reconcileRemoteSendOrders: vi.fn() }));

import { sweepApprovedFundingCredits } from '../scheduler.js';

describe('approved funding recovery scheduler', () => {
    beforeEach(() => {
        mocks.rpc.mockReset();
    });

    it('repairs approved requests through the atomic database seam', async () => {
        mocks.rpc.mockResolvedValue({
            data: {
                checked: 17,
                repaired: 2,
                missingLedger: 2,
                staleWallet: 0,
                blockedInactive: 0,
            },
            error: null,
        });

        const result = await sweepApprovedFundingCredits();

        expect(mocks.rpc).toHaveBeenCalledWith('fn_reconcile_approved_funding_credits', {
            p_limit: 250,
        });
        expect(result).toMatchObject({ checked: 17, repaired: 2, missingLedger: 2 });
    });

    it('fails loudly when recovery cannot run', async () => {
        mocks.rpc.mockResolvedValue({
            data: null,
            error: { message: 'database unavailable' },
        });

        await expect(sweepApprovedFundingCredits()).rejects.toThrow('database unavailable');
    });
});
