import { describe, expect, it } from 'vitest';
import {
    blockCodeFor,
    classifyGatewayAmount,
    isCreditable,
    maxGatewaySurplusMinor,
} from '../gateway-amounts.js';

describe('classifyGatewayAmount', () => {
    it('treats an exact match as creditable', () => {
        const result = classifyGatewayAmount({ expectedMinor: 50_000, paidMinor: 50_000 });
        expect(result.kind).toBe('exact');
        expect(result.surplusMinor).toBe(0);
        expect(isCreditable(result)).toBe(true);
    });

    it('accepts the real ₦500 fee-bearing charge that used to block funding', () => {
        // Production case: ₦500 requested, Paystack charged ₦507.62 because the
        // payer bears the 1.5% fee. Strict equality held this at requires_review.
        const result = classifyGatewayAmount({ expectedMinor: 50_000, paidMinor: 50_762 });
        expect(result.kind).toBe('fee_surplus');
        expect(result.surplusMinor).toBe(762);
        expect(isCreditable(result)).toBe(true);
        expect(result.creditableMinor).toBe(50_000);
    });

    it('credits only the requested amount, never the grossed-up charge', () => {
        const result = classifyGatewayAmount({ expectedMinor: 500_000, paidMinor: 507_614 });
        expect(result.creditableMinor).toBe(500_000);
    });

    it('accepts fee-bearing charges across the flat-fee threshold', () => {
        // ₦2,500 attracts the ₦100 flat fee on top of 1.5%.
        const result = classifyGatewayAmount({ expectedMinor: 250_000, paidMinor: 263_959 });
        expect(result.kind).toBe('fee_surplus');
    });

    it('accepts a large charge where the fee is capped at ₦2,000', () => {
        const result = classifyGatewayAmount({ expectedMinor: 100_000_000, paidMinor: 100_200_000 });
        expect(result.kind).toBe('fee_surplus');
    });

    it('blocks underpayment', () => {
        const result = classifyGatewayAmount({ expectedMinor: 50_000, paidMinor: 49_999 });
        expect(result.kind).toBe('underpaid');
        expect(isCreditable(result)).toBe(false);
        expect(blockCodeFor(result)).toBe('payment_amount_mismatch');
    });

    it('blocks a surplus too large to be a fee', () => {
        const result = classifyGatewayAmount({ expectedMinor: 50_000, paidMinor: 500_000 });
        expect(result.kind).toBe('excess_surplus');
        expect(isCreditable(result)).toBe(false);
        expect(blockCodeFor(result)).toBe('payment_overpaid');
    });

    it('never allows an unbounded surplus', () => {
        // The allowance must stay near the ₦2,000 fee cap even for huge amounts.
        expect(maxGatewaySurplusMinor(1_000_000_000)).toBeLessThanOrEqual(211_000);
    });

    it('rejects non-finite amounts rather than crediting them', () => {
        const result = classifyGatewayAmount({ expectedMinor: 50_000, paidMinor: Number.NaN });
        expect(isCreditable(result)).toBe(false);
    });
});

describe('funding credit keys', () => {
    it('uses one key for both the gateway and approval paths', async () => {
        const { fundingCreditKey, fundingCreditKeys, legacyPaystackFundingCreditKey } =
            await import('../funding-credit.js');
        const id = 'a805389b-11ef-41f1-a2e2-1f82bc8d43fb';
        expect(fundingCreditKey(id)).toBe(`funding.${id}.credit`);
        expect(fundingCreditKeys(id)).toContain(legacyPaystackFundingCreditKey(id));
        expect(fundingCreditKeys(id)).toHaveLength(2);
    });
});
