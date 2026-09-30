import { adminClient } from '../db/supabase.js';

export class VendorKycGateError extends Error {
    constructor(message: string, public code: string, public status: number) {
        super(message);
    }
}

/**
 * Vendor accounts may sign in and fund at Tier 0. Vending starts only after
 * a Beverly reviewer approves the vendor's sequential Tier 1 review.
 */
export async function assertVendorKycReadyForVending(vendorOrganizationId: string): Promise<void> {
    const { data, error } = await adminClient
        .from('vendor_organizations')
        .select('status, kyc_tier, kyc_status')
        .eq('id', vendorOrganizationId)
        .maybeSingle();
    if (error) {
        throw new VendorKycGateError('Vendor verification status is unavailable. Try again shortly.', 'vendor_kyc_unavailable', 503);
    }
    if (!data) {
        throw new VendorKycGateError('Vendor account was not found.', 'vendor_not_found', 404);
    }
    if ((data as any).status !== 'approved') {
        throw new VendorKycGateError('Your vendor organization is not active.', 'vendor_not_approved', 403);
    }
    if (Number((data as any).kyc_tier ?? 0) < 1 || (data as any).kyc_status !== 'verified') {
        throw new VendorKycGateError(
            'Complete and receive approval for Tier 1 verification before vending. You can still fund your wallet.',
            'vendor_kyc_tier_required',
            403,
        );
    }
}
