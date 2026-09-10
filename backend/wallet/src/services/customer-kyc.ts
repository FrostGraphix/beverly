/**
 * Customer KYC service.
 *
 * Tier 0  → registered with basic profile information
 * Tier 1+ → evidence-backed verification approved by authorised staff
 *
 * Tier caps (enforced in routes via requireKycTier):
 *   Tier 0: read-only, no purchases
 *   Tier 1: purchases up to ₦50,000/day
 *   Tier 2: purchases up to ₦200,000/day
 */
import { adminClient } from '../db/supabase.js';

export const NIN_VERIFICATION_UNAVAILABLE_MESSAGE =
    'Automatic NIN verification is unavailable. Use the secure manual identity review.';

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

export interface KycBasicInfoInput {
    customerId: string;
    actorUserId: string;
    full_name: string;
    date_of_birth: string;   // ISO date YYYY-MM-DD
    address: string;
    state: string;
    lga: string;
}

export async function saveCustomerBasicInfo(input: KycBasicInfoInput): Promise<{ completedAt: string }> {
    const dob = new Date(input.date_of_birth);
    if (isNaN(dob.getTime())) throw new KycError('Invalid date of birth.', 'invalid_dob');
    const ageYears = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (ageYears < 18) throw new KycError('Must be at least 18 years old.', 'underage');
    if (!input.full_name.trim() || input.full_name.trim().split(' ').length < 2) {
        throw new KycError('Full name must include first and last name.', 'invalid_name');
    }

    const completedAt = new Date().toISOString();
    const { data, error } = await adminClient.rpc('save_customer_kyc_basic_info', {
        p_customer_id: input.customerId,
        p_actor_user_id: input.actorUserId,
        p_basic_info: {
            full_name: input.full_name.trim(),
            date_of_birth: input.date_of_birth,
            address: input.address.trim(),
            state: input.state.trim(),
            lga: input.lga.trim(),
            completed_at: completedAt,
        },
    });
    if (error || !data) throw new KycError(error?.message ?? 'Basic information could not be saved.', 'basic_info_save_failed');
    return { completedAt: String((data as any).completed_at ?? completedAt) };
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
