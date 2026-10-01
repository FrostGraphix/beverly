import { beforeEach, describe, expect, it, vi } from 'vitest';

let result: { data: unknown; error: { message: string } | null } = { data: null, error: null };

vi.mock('../../db/supabase.js', () => ({
    adminClient: {
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => result,
                }),
            }),
        }),
    },
}));

describe('vendor KYC vending gate', () => {
    beforeEach(() => { result = { data: null, error: null }; });

    it('allows an approved Tier 0 vendor to vend within policy limits', async () => {
        result = { data: { status: 'approved', kyc_tier: 0, kyc_status: 'unverified' }, error: null };
        const { assertVendorKycReadyForVending } = await import('../vendor-kyc-gate.js');
        await expect(assertVendorKycReadyForVending('vendor-1')).resolves.toBeUndefined();
    });

    it('blocks vendors whose organization has not been approved', async () => {
        result = { data: { status: 'pending', kyc_tier: 0, kyc_status: 'unverified' }, error: null };
        const { assertVendorKycReadyForVending } = await import('../vendor-kyc-gate.js');
        await expect(assertVendorKycReadyForVending('vendor-1')).rejects.toMatchObject({
            code: 'vendor_not_approved', status: 403,
        });
    });

    it('allows a reviewed Tier 1 vendor', async () => {
        result = { data: { status: 'approved', kyc_tier: 1, kyc_status: 'verified' }, error: null };
        const { assertVendorKycReadyForVending } = await import('../vendor-kyc-gate.js');
        await expect(assertVendorKycReadyForVending('vendor-1')).resolves.toBeUndefined();
    });
});
