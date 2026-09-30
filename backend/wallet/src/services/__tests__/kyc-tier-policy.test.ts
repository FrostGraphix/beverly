import { describe, expect, it } from 'vitest';
import {
    effectiveTierLimit,
    requiredTierForAmount,
    validateKycTierPolicy,
} from '../kyc-tier-policy.js';

const policy = {
    tier0DailyLimitMinor: 20_000_000,
    tier1DailyLimitMinor: 70_000_000,
    tier2DailyLimitMinor: null,
    version: 1,
    updatedAt: '2026-09-29T00:00:00.000Z',
};

describe('KYC tier policy boundaries', () => {
    it('assigns the configured exact boundaries without hard-coded limits', () => {
        expect(requiredTierForAmount(20_000_000, policy)).toBe(0);
        expect(requiredTierForAmount(20_000_001, policy)).toBe(1);
        expect(requiredTierForAmount(70_000_000, policy)).toBe(1);
        expect(requiredTierForAmount(70_000_001, policy)).toBe(2);
    });

    it('keeps Tier 2 uncapped when settings say so', () => {
        expect(effectiveTierLimit(0, policy)).toBe(20_000_000);
        expect(effectiveTierLimit(1, policy)).toBe(70_000_000);
        expect(effectiveTierLimit(2, policy)).toBeNull();
    });

    it('rejects non-increasing settings before persistence', () => {
        expect(() => validateKycTierPolicy({
            tier0DailyLimitMinor: 70_000_000,
            tier1DailyLimitMinor: 20_000_000,
            tier2DailyLimitMinor: null,
        })).toThrow(/Tier 1/i);
    });
});
