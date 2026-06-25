/**
 * Customer KYC service.
 *
 * Tier 0  → unverified (phone OTP only)
 * Tier 1  → basic profile: full_name + date_of_birth + address submitted
 * Tier 2  → NIN verified via Paystack Identity API
 *
 * Tier caps (enforced in routes via requireKycTier):
 *   Tier 0: read-only, no purchases
 *   Tier 1: purchases up to ₦50,000/day
 *   Tier 2: purchases up to ₦200,000/day
 */
import { adminClient } from '../db/supabase.js';
import { resolveNin } from '../adapters/paystack.js';
import { logAction } from './audit.js';

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

    const { error } = await adminClient.from('customers').update({
        full_name: input.full_name.trim(),
        kyc_tier: Math.max((cu as { kyc_tier: number }).kyc_tier, 1),
        kyc_status: 'verified',
        kyc_data: {
            tier1: {
                date_of_birth: input.date_of_birth,
                address: input.address,
                state: input.state,
                lga: input.lga,
                verified_at: new Date().toISOString(),
            },
        },
    }).eq('id', input.customerId);
    if (error) throw new KycError(error.message, 'update_failed');

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
        after: { kyc_tier: 1 },
    });
}

export interface KycTier2Input {
    customerId: string;
    actorUserId: string;
    nin: string;
}

export async function submitKycTier2Nin(input: KycTier2Input): Promise<void> {
    if (!/^\d{11}$/.test(input.nin)) throw new KycError('NIN must be 11 digits.', 'invalid_nin');

    const { data: cu } = await adminClient.from('customers').select('*').eq('id', input.customerId).single();
    if (!cu) throw new KycError('Customer not found.', 'not_found');
    const customer = cu as { kyc_tier: number; full_name: string | null; kyc_data: Record<string, unknown> | null };

    if (customer.kyc_tier < 1) {
        throw new KycError('Tier 1 KYC is required before Tier 2.', 'tier1_required');
    }

    // Resolve NIN
    let ninData: Awaited<ReturnType<typeof resolveNin>>;
    try {
        ninData = await resolveNin(input.nin);
    } catch (e: any) {
        throw new KycError(`NIN verification failed: ${e.message}`, 'nin_resolve_failed');
    }

    // Soft name match — first OR last name must match
    const storedName = (customer.full_name ?? '').toLowerCase();
    const ninFirst = ninData.first_name.toLowerCase();
    const ninLast = ninData.last_name.toLowerCase();
    if (!storedName.includes(ninFirst) && !storedName.includes(ninLast)) {
        throw new KycError(
            'NIN name does not match your registered name. Contact support if this is incorrect.',
            'name_mismatch',
        );
    }

    const { error } = await adminClient.from('customers').update({
        kyc_tier: 2,
        kyc_status: 'verified',
        kyc_data: {
            ...(customer.kyc_data ?? {}),
            tier2: {
                nin_last4: input.nin.slice(-4),
                nin_name: `${ninData.first_name} ${ninData.last_name}`,
                verified_at: new Date().toISOString(),
            },
        },
    }).eq('id', input.customerId);
    if (error) throw new KycError(error.message, 'update_failed');

    // Raise wallet cap for Tier 2
    const { data: wallet } = await adminClient
        .from('wallets')
        .select('id')
        .eq('owner_type', 'customer')
        .eq('owner_id', input.customerId)
        .maybeSingle();
    if (wallet) {
        await adminClient.from('wallets').update({
            daily_debit_cap_minor: 20_000_000,   // ₦200,000
            monthly_debit_cap_minor: 500_000_000, // ₦5,000,000
        }).eq('id', (wallet as { id: string }).id);
    }

    await logAction({
        actorUserId: input.actorUserId,
        actorType: 'customer',
        action: 'kyc.tier2.nin',
        targetType: 'customer',
        targetId: input.customerId,
        after: { kyc_tier: 2, nin_last4: input.nin.slice(-4) },
    });
}
