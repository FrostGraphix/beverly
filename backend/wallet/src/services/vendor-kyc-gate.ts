import { adminClient } from '../db/supabase.js';

export class VendorKycGateError extends Error {
    constructor(message: string, public code: string, public status: number) {
        super(message);
    }
}

/**
 * Organization approval activates vending. KYC tier policy controls the
 * wallet's monetary cap separately, so an approved Tier 0 vendor can vend
 * up to the configured Tier 0 limit without unnecessary identity friction.
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
}
