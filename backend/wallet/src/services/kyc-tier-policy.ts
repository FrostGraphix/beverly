import { adminClient } from '../db/supabase.js';

export type KycTier = 0 | 1 | 2;

export interface KycTierPolicy {
    tier0DailyLimitMinor: number;
    tier1DailyLimitMinor: number;
    tier2DailyLimitMinor: number | null;
    version: number;
    updatedAt: string;
}

export interface KycTierPolicyInput {
    tier0DailyLimitMinor: number;
    tier1DailyLimitMinor: number;
    tier2DailyLimitMinor: number | null;
}

export class KycTierPolicyError extends Error {
    constructor(message: string, public code: 'policy_unavailable' | 'invalid_policy' | 'policy_conflict') {
        super(message);
    }
}

type PolicyRow = {
    tier0_daily_limit_minor: number | string;
    tier1_daily_limit_minor: number | string;
    tier2_daily_limit_minor: number | string | null;
    version: number | string;
    updated_at: string;
};

function positiveInteger(value: unknown): number | null {
    const numberValue = Number(value);
    return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

export function validateKycTierPolicy(input: KycTierPolicyInput): KycTierPolicyInput {
    const tier0 = positiveInteger(input.tier0DailyLimitMinor);
    const tier1 = positiveInteger(input.tier1DailyLimitMinor);
    const rawTier2 = input.tier2DailyLimitMinor;
    const tier2 = rawTier2 === null ? null : positiveInteger(rawTier2);
    if (tier0 === null || tier1 === null || (rawTier2 !== null && tier2 === null)) {
        throw new KycTierPolicyError('Every configured KYC limit must be a whole positive naira amount.', 'invalid_policy');
    }
    if (tier1 <= tier0) {
        throw new KycTierPolicyError('Tier 1 must be higher than Tier 0.', 'invalid_policy');
    }
    if (tier2 !== null && tier2 <= tier1) {
        throw new KycTierPolicyError('Tier 2 must be higher than Tier 1, or have no cap.', 'invalid_policy');
    }
    return { tier0DailyLimitMinor: tier0, tier1DailyLimitMinor: tier1, tier2DailyLimitMinor: tier2 };
}

export function toKycTierPolicy(row: PolicyRow): KycTierPolicy {
    const input = validateKycTierPolicy({
        tier0DailyLimitMinor: Number(row.tier0_daily_limit_minor),
        tier1DailyLimitMinor: Number(row.tier1_daily_limit_minor),
        tier2DailyLimitMinor: row.tier2_daily_limit_minor === null ? null : Number(row.tier2_daily_limit_minor),
    });
    const version = Number(row.version);
    if (!Number.isSafeInteger(version) || version < 1 || !row.updated_at) {
        throw new KycTierPolicyError('KYC policy data is invalid.', 'policy_unavailable');
    }
    return { ...input, version, updatedAt: row.updated_at };
}

export function effectiveTierLimit(tier: KycTier, policy: KycTierPolicy): number | null {
    if (tier === 0) return policy.tier0DailyLimitMinor;
    if (tier === 1) return policy.tier1DailyLimitMinor;
    return policy.tier2DailyLimitMinor;
}

export function requiredTierForAmount(amountMinor: number, policy: KycTierPolicy): KycTier {
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) {
        throw new KycTierPolicyError('Amount must be a positive whole value.', 'invalid_policy');
    }
    if (amountMinor <= policy.tier0DailyLimitMinor) return 0;
    if (amountMinor <= policy.tier1DailyLimitMinor) return 1;
    return 2;
}

export async function getKycTierPolicy(): Promise<KycTierPolicy> {
    const { data, error } = await adminClient
        .from('kyc_tier_settings')
        .select('tier0_daily_limit_minor, tier1_daily_limit_minor, tier2_daily_limit_minor, version, updated_at')
        .eq('singleton', true)
        .maybeSingle();
    if (error || !data) {
        throw new KycTierPolicyError('KYC limits are not available. Please try again shortly.', 'policy_unavailable');
    }
    return toKycTierPolicy(data as PolicyRow);
}

export async function updateKycTierPolicy(input: KycTierPolicyInput & { expectedVersion: number; updatedBy?: string | null; reason: string }): Promise<KycTierPolicy> {
    const policy = validateKycTierPolicy(input);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
        throw new KycTierPolicyError('The latest KYC settings version is required.', 'invalid_policy');
    }
    if (input.reason.trim().length < 4 || input.reason.trim().length > 500) {
        throw new KycTierPolicyError('Record a clear reason for this KYC policy change.', 'invalid_policy');
    }
    const { data, error } = await adminClient
        .from('kyc_tier_settings')
        .update({
            tier0_daily_limit_minor: policy.tier0DailyLimitMinor,
            tier1_daily_limit_minor: policy.tier1DailyLimitMinor,
            tier2_daily_limit_minor: policy.tier2DailyLimitMinor,
            version: input.expectedVersion + 1,
            updated_at: new Date().toISOString(),
            updated_by: input.updatedBy ?? null,
            change_reason: input.reason.trim(),
        })
        .eq('singleton', true)
        .eq('version', input.expectedVersion)
        .select('tier0_daily_limit_minor, tier1_daily_limit_minor, tier2_daily_limit_minor, version, updated_at')
        .maybeSingle();
    if (error) throw new KycTierPolicyError(error.message, 'policy_unavailable');
    if (!data) throw new KycTierPolicyError('KYC settings changed. Refresh and try again.', 'policy_conflict');
    return toKycTierPolicy(data as PolicyRow);
}
