import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    assertWalletDailyDebitLimitAllowed,
    WalletDebitLimitError,
    kycTierSettingsUpdateSchema,
} from '../kyc-policy.js';

// Setup supabase adminClient mocks
const fromMock = vi.fn();
vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: (...args: any[]) => fromMock(...args),
    },
}));

describe('KYC Tier Debit Limit Boundary Enforcement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function setupWalletMock(dailyCapMinor: number | null, todayDebits: number[] = [], todayHolds: number[] = []) {
        fromMock.mockImplementation((table: string) => {
            if (table === 'wallets') {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({
                                data: {
                                    id: 'wallet-test-1',
                                    daily_debit_cap_minor: dailyCapMinor,
                                    owner_type: 'customer',
                                    owner_id: 'cust-123',
                                },
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            if (table === 'wallet_ledger_entries') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                gte: async () => ({
                                    data: todayDebits.map((amount_minor) => ({ amount_minor })),
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === 'wallet_holds') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                gte: async () => ({
                                    data: todayHolds.map((amount_minor) => ({ amount_minor })),
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            throw new Error(`Unexpected table: ${table}`);
        });
    }

    describe('Tier 0 Canonical Boundaries (₦200,000 / 20,000,000 kobo)', () => {
        const TIER_0_CAP_MINOR = 20_000_000; // ₦200,000.00

        it('allows purchase exactly equal to ₦200,000', async () => {
            setupWalletMock(TIER_0_CAP_MINOR, []);
            const result = await assertWalletDailyDebitLimitAllowed('wallet-test-1', 20_000_000);
            expect(result.allowed).toBe(true);
            expect(result.dailyLimitMinor).toBe(20_000_000);
            expect(result.remainingMinor).toBe(20_000_000);
        });

        it('strictly rejects purchase of ₦200,000.01 (₦200,001)', async () => {
            setupWalletMock(TIER_0_CAP_MINOR, []);
            await expect(
                assertWalletDailyDebitLimitAllowed('wallet-test-1', 20_000_001),
            ).rejects.toThrow(WalletDebitLimitError);
        });

        it('allows purchase of ₦199,999.99', async () => {
            setupWalletMock(TIER_0_CAP_MINOR, []);
            const result = await assertWalletDailyDebitLimitAllowed('wallet-test-1', 19_999_999);
            expect(result.allowed).toBe(true);
            expect(result.remainingMinor).toBe(20_000_000);
        });
    });

    describe('Tier 1 Canonical Boundaries (₦700,000 / 70,000,000 kobo)', () => {
        const TIER_1_CAP_MINOR = 70_000_000; // ₦700,000.00

        it('allows purchase exactly equal to ₦700,000', async () => {
            setupWalletMock(TIER_1_CAP_MINOR, []);
            const result = await assertWalletDailyDebitLimitAllowed('wallet-test-1', 70_000_000);
            expect(result.allowed).toBe(true);
            expect(result.dailyLimitMinor).toBe(70_000_000);
            expect(result.remainingMinor).toBe(70_000_000);
        });

        it('strictly rejects purchase of ₦700,000.01 (₦700,001)', async () => {
            setupWalletMock(TIER_1_CAP_MINOR, []);
            await expect(
                assertWalletDailyDebitLimitAllowed('wallet-test-1', 70_000_001),
            ).rejects.toThrow(WalletDebitLimitError);
        });
    });

    describe('Tier 2 / Uncapped Wallets (null limit)', () => {
        it('allows any purchase amount without restriction when cap is null', async () => {
            setupWalletMock(null, [100_000_000]); // ₦1,000,000 already spent
            const result = await assertWalletDailyDebitLimitAllowed('wallet-test-1', 500_000_000); // ₦5,000,000
            expect(result.allowed).toBe(true);
            expect(result.dailyLimitMinor).toBeNull();
            expect(result.remainingMinor).toBeNull();
        });
    });

    describe('Accumulated Usage & Holds Accounting', () => {
        const TIER_0_CAP_MINOR = 20_000_000;

        it('factors in executed debits and active holds when testing boundaries', async () => {
            // Already spent ₦150k, active hold of ₦40k -> used = ₦190k
            setupWalletMock(TIER_0_CAP_MINOR, [15_000_000], [4_000_000]);

            // Remaining capacity before this transaction is exactly ₦10,000 (1,000,000 kobo)
            const allowed = await assertWalletDailyDebitLimitAllowed('wallet-test-1', 1_000_000);
            expect(allowed.allowed).toBe(true);
            expect(allowed.dailyDebitsMinor).toBe(19_000_000);
            expect(allowed.remainingMinor).toBe(1_000_000);

            // ₦10,000.01 exceeds limit
            await expect(
                assertWalletDailyDebitLimitAllowed('wallet-test-1', 1_000_001),
            ).rejects.toThrow(WalletDebitLimitError);
        });
    });

    describe('Dynamic Admin Tier Limit Schema Validation', () => {
        it('accepts valid ascending tier configuration', () => {
            const valid = kycTierSettingsUpdateSchema.safeParse({
                tier0_daily_limit_minor: 30_000_000, // ₦300,000
                tier1_daily_limit_minor: 100_000_000, // ₦1,000,000
                tier2_daily_limit_minor: null, // uncapped
                change_reason: 'Updated limits for new compliance framework',
            });
            expect(valid.success).toBe(true);
        });

        it('rejects Tier 1 limit if not strictly greater than Tier 0', () => {
            const invalid = kycTierSettingsUpdateSchema.safeParse({
                tier0_daily_limit_minor: 50_000_000,
                tier1_daily_limit_minor: 50_000_000, // equal to Tier 0
                tier2_daily_limit_minor: null,
                change_reason: 'Testing boundary rejection',
            });
            expect(invalid.success).toBe(false);
            if (!invalid.success) {
                expect(invalid.error.issues[0]?.message).toContain('Tier 1 daily limit must be strictly greater');
            }
        });

        it('rejects short change reason (< 5 characters)', () => {
            const invalid = kycTierSettingsUpdateSchema.safeParse({
                tier0_daily_limit_minor: 20_000_000,
                tier1_daily_limit_minor: 70_000_000,
                change_reason: 'edit',
            });
            expect(invalid.success).toBe(false);
        });
    });

    describe('Dynamic Admin Limit Updates & Enforced Boundaries', () => {
        it('fetches default tier settings when none stored', async () => {
            fromMock.mockImplementation((table: string) => {
                if (table === 'kyc_tier_settings') {
                    return {
                        select: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: null, error: null }),
                            }),
                        }),
                    };
                }
                throw new Error(`Unexpected table: ${table}`);
            });

            const { getKycTierSettings } = await import('../kyc-policy.js');
            const settings = await getKycTierSettings();
            expect(settings.tier0_daily_limit_minor).toBe(20_000_000);
            expect(settings.tier1_daily_limit_minor).toBe(70_000_000);
            expect(settings.tier2_daily_limit_minor).toBeNull();
            expect(settings.version).toBe(1);
        });

        it('updates tier limits to ₦300,000 and enforces the new boundary immediately', async () => {
            let currentVersion = 1;
            fromMock.mockImplementation((table: string) => {
                if (table === 'kyc_tier_settings') {
                    return {
                        select: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: {
                                        tier0_daily_limit_minor: 20_000_000,
                                        tier1_daily_limit_minor: 70_000_000,
                                        tier2_daily_limit_minor: null,
                                        version: currentVersion,
                                        updated_at: '2026-10-01T00:00:00Z',
                                        updated_by: null,
                                        change_reason: 'Initial',
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                        update: (payload: any) => ({
                            eq: () => ({
                                select: () => ({
                                    single: async () => {
                                        currentVersion = payload.version;
                                        return {
                                            data: {
                                                ...payload,
                                            },
                                            error: null,
                                        };
                                    },
                                }),
                            }),
                        }),
                    };
                }
                throw new Error(`Unexpected table: ${table}`);
            });

            const { updateKycTierSettings } = await import('../kyc-policy.js');
            const updated = await updateKycTierSettings({
                tier0_daily_limit_minor: 30_000_000, // Raised to ₦300,000
                tier1_daily_limit_minor: 80_000_000,
                tier2_daily_limit_minor: null,
                change_reason: 'Raised Tier 0 limit for festival season promo',
            }, 'staff-admin-1');

            expect(updated.version).toBe(2);
            expect(updated.tier0_daily_limit_minor).toBe(30_000_000);

            // Now test boundary on wallet updated to this new ₦300k limit
            setupWalletMock(updated.tier0_daily_limit_minor, []);

            // ₦250k: allowed
            const res250k = await assertWalletDailyDebitLimitAllowed('wallet-test-1', 25_000_000);
            expect(res250k.allowed).toBe(true);

            // ₦300k: allowed
            const res300k = await assertWalletDailyDebitLimitAllowed('wallet-test-1', 30_000_000);
            expect(res300k.allowed).toBe(true);

            // ₦300,001: rejected
            await expect(
                assertWalletDailyDebitLimitAllowed('wallet-test-1', 30_000_100),
            ).rejects.toThrow(WalletDebitLimitError);
        });
    });
});
