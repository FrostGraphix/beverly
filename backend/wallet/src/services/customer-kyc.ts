/**
 * Customer KYC service.
 *
 * Tier 0  → unverified (phone OTP only)
 * Tier 1  → basic profile: full_name + date_of_birth + address submitted
 * Tier 2  → NIN verified through an approved identity provider
 *
 * Tier caps (enforced in routes via requireKycTier):
 *   Tier 0: read-only, no purchases
 *   Tier 1: purchases up to ₦50,000/day
 *   Tier 2: purchases up to ₦200,000/day
 */
import { adminClient } from '../db/supabase.js';
import { logAction } from './audit.js';
import { notifyKycUpdate } from './notifications.js';

export const NIN_VERIFICATION_UNAVAILABLE_MESSAGE =
    'NIN verification is temporarily unavailable. Your Tier 1 access remains active.';

export function getNinVerificationAvailability() {
    return {
        available: false,
        code: 'nin_service_unavailable' as const,
        message: NIN_VERIFICATION_UNAVAILABLE_MESSAGE,
    };
}

export class KycError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'KycError';
    }
}

export interface KycTier1Input {
    customerId: string;
    actorUserId: string;
    full_name: string;
    date_of_birth: string;   // ISO date YYYY-MM-DD
    address: string;
    state: string;
    lga: string;
}

export async function submitKycTier1(input: KycTier1Input): Promise<void> {
    const dob = new Date(input.date_of_birth);
    if (isNaN(dob.getTime())) throw new KycError('Invalid date of birth.', 'invalid_dob');
    const ageYears = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (ageYears < 18) throw new KycError('Must be at least 18 years old.', 'underage');
    if (!input.full_name.trim() || input.full_name.trim().split(' ').length < 2) {
        throw new KycError('Full name must include first and last name.', 'invalid_name');
    }

    const { data: cu } = await adminClient.from('customers').select('kyc_tier').eq('id', input.customerId).single();
    if (!cu) throw new KycError('Customer not found.', 'not_found');

    const tier1Payload: Record<string, unknown> = {
        full_name: input.full_name.trim(),
        kyc_tier: Math.max((cu as { kyc_tier: number }).kyc_tier, 1),
        kyc_status: 'verified',
    };

    // kyc_data column added in migration 20260520110000 — write it only when the
    // column exists in the schema cache (avoids 422 on un-migrated environments).
    const kycDataValue = {
        tier1: {
            date_of_birth: input.date_of_birth,
            address: input.address,
            state: input.state,
            lga: input.lga,
            verified_at: new Date().toISOString(),
        },
    };
    let { error } = await adminClient.from('customers').update(tier1Payload).eq('id', input.customerId);
    if (error?.message?.includes('kyc_data')) {
        // Column missing — skip for now; supplementary data is already in the audit log.
    } else if (!error) {
        // Try to write the JSONB field if the column is present.
        const res2 = await adminClient.from('customers')
            .update({ kyc_data: kycDataValue } as any)
            .eq('id', input.customerId);
        if (res2.error && !res2.error.message.includes('kyc_data')) {
            error = res2.error;
        }
    }
    if (error && !error.message.includes('kyc_data')) throw new KycError(error.message, 'update_failed');

    // Raise wallet daily cap to ₦50k
    const { data: wallet } = await adminClient
        .from('wallets')
        .select('id')
        .eq('owner_type', 'customer')
        .eq('owner_id', input.customerId)
        .maybeSingle();
    if (wallet) {
        await adminClient.from('wallets').update({
            daily_debit_cap_minor: 5_000_000,    // ₦50,000
            monthly_debit_cap_minor: 100_000_000, // ₦1,000,000
        }).eq('id', (wallet as { id: string }).id);
    }

    await logAction({
        actorUserId: input.actorUserId,
        actorType: 'customer',
        action: 'kyc.tier1.submit',
        targetType: 'customer',
        targetId: input.customerId,
        after: {
            kyc_tier: 1,
            date_of_birth: input.date_of_birth,
            address: input.address,
            state: input.state,
            lga: input.lga,
        },
    });

    notifyKycUpdate(input.customerId, { tier: 1 }).catch(() => undefined);
}

export interface KycTier2Input {
    customerId: string;
    actorUserId: string;
    nin: string;
}

export async function submitKycTier2Nin(input: KycTier2Input): Promise<void> {
    if (!/^\d{11}$/.test(input.nin)) throw new KycError('NIN must be 11 digits.', 'invalid_nin');
    throw new KycError(NIN_VERIFICATION_UNAVAILABLE_MESSAGE, 'nin_service_unavailable');
}
