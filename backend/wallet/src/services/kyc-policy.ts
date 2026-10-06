import { z } from 'zod';
import { adminClient } from '../db/supabase.js';
import { KycReviewError, type KycDocumentType, type KycSubjectType } from './kyc-reviews.js';

const SETTING_KEY = 'kyc_policy';
export const KYC_DOCUMENT_TYPES = ['national_id', 'voters_card', 'passport', 'drivers_license', 'utility_bill', 'bank_statement', 'selfie'] as const;
export const KYC_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

const requirementSchema = z.object({
    identity: z.array(z.enum(['national_id', 'voters_card', 'passport', 'drivers_license'])).min(1),
    selfie: z.boolean(),
    address: z.array(z.enum(['utility_bill', 'bank_statement'])),
});
export const kycPolicySchema = z.object({
    customer_enabled: z.boolean(),
    vendor_enabled: z.boolean(),
    allowed_mime_types: z.array(z.enum(KYC_MIME_TYPES)).min(1),
    customer: z.object({ tier1: requirementSchema, tier2: requirementSchema }),
    vendor: z.object({ tier2: requirementSchema }),
});
export type KycPolicy = z.infer<typeof kycPolicySchema>;

export const DEFAULT_KYC_POLICY: KycPolicy = {
    customer_enabled: true,
    vendor_enabled: true,
    allowed_mime_types: [...KYC_MIME_TYPES],
    customer: {
        tier1: { identity: ['national_id', 'voters_card', 'passport', 'drivers_license'], selfie: true, address: [] },
        tier2: { identity: ['national_id', 'voters_card', 'passport', 'drivers_license'], selfie: true, address: ['utility_bill', 'bank_statement'] },
    },
    vendor: { tier2: { identity: ['national_id', 'voters_card', 'passport', 'drivers_license'], selfie: true, address: ['utility_bill', 'bank_statement'] } },
};

export async function getKycPolicy(): Promise<KycPolicy> {
    try {
        const { data, error } = await adminClient.from('system_settings').select('value').eq('key', SETTING_KEY).maybeSingle();
        if (error || !data?.value) return DEFAULT_KYC_POLICY;
        return kycPolicySchema.parse(data.value);
    } catch { return DEFAULT_KYC_POLICY; }
}
export async function updateKycPolicy(policy: KycPolicy, actorId: string): Promise<KycPolicy> {
    const value = kycPolicySchema.parse(policy);
    const { error } = await adminClient.from('system_settings').upsert({ key: SETTING_KEY, value, updated_at: new Date().toISOString(), updated_by: actorId });
    if (error) throw new KycReviewError('Could not save KYC policy.', 'kyc_policy_save_failed', 503);
    return value;
}

function requirements(policy: KycPolicy, subjectType: KycSubjectType, tier: 1 | 2) {
    return subjectType === 'customer'
        ? policy.customer[tier === 1 ? 'tier1' : 'tier2']
        : policy.vendor.tier2;
}

export async function assertKycEnabled(subjectType: KycSubjectType): Promise<void> {
    const policy = await getKycPolicy();
    if (subjectType === 'customer' ? policy.customer_enabled : policy.vendor_enabled) return;
    throw new KycReviewError(`${subjectType === 'customer' ? 'Customer' : 'Vendor'} KYC is currently unavailable.`, 'kyc_disabled', 409);
}

export async function isKycEnabled(subjectType: KycSubjectType): Promise<boolean> {
    const policy = await getKycPolicy();
    return subjectType === 'customer' ? policy.customer_enabled : policy.vendor_enabled;
}

export async function assertKycUploadAllowed(input: { subjectType: KycSubjectType; tier: 1 | 2; documentType: KycDocumentType; mimeType: string }): Promise<void> {
    const policy = await getKycPolicy();
    if (!(input.subjectType === 'customer' ? policy.customer_enabled : policy.vendor_enabled)) throw new KycReviewError('KYC is currently unavailable.', 'kyc_disabled', 409);
    if (!policy.allowed_mime_types.includes(input.mimeType as any)) throw new KycReviewError('This document format is not accepted.', 'document_format_not_allowed');
    const requirement = requirements(policy, input.subjectType, input.tier);
    const allowed = new Set([...requirement.identity, ...requirement.address, ...(requirement.selfie ? ['selfie'] : [])]);
    if (!allowed.has(input.documentType)) throw new KycReviewError('This document type is not required for this verification.', 'document_not_required');
}

export async function assertKycEvidenceMeetsPolicy(input: { subjectType: KycSubjectType; tier: 1 | 2; documentTypes: string[] }): Promise<void> {
    const policy = await getKycPolicy();
    if (!(input.subjectType === 'customer' ? policy.customer_enabled : policy.vendor_enabled)) throw new KycReviewError('KYC is currently unavailable.', 'kyc_disabled', 409);
    const requirement = requirements(policy, input.subjectType, input.tier);
    const types = new Set(input.documentTypes);
    if (!requirement.identity.some((type) => types.has(type))) throw new KycReviewError('Choose one approved identity document.', 'identity_document_required');
    if (requirement.selfie && !types.has('selfie')) throw new KycReviewError('A selfie is required.', 'selfie_required');
    if (requirement.address.length && !requirement.address.some((type) => types.has(type))) throw new KycReviewError('Choose one approved address document.', 'address_document_required');
}

export interface KycTierSettings {
    tier0_daily_limit_minor: number;
    tier1_daily_limit_minor: number;
    tier2_daily_limit_minor: number | null;
    version: number;
    updated_at: string;
    updated_by: string | null;
    change_reason: string;
}

export interface KycTierPolicyHistoryItem {
    id: string;
    settings_version: number;
    actor_user_id: string | null;
    reason: string;
    before_json: Record<string, unknown>;
    after_json: Record<string, unknown>;
    created_at: string;
}

export const kycTierSettingsUpdateSchema = z.object({
    tier0_daily_limit_minor: z.number().int().positive('Tier 0 limit must be a positive integer in kobo'),
    tier1_daily_limit_minor: z.number().int().positive('Tier 1 limit must be a positive integer in kobo'),
    tier2_daily_limit_minor: z.number().int().positive('Tier 2 limit must be a positive integer in kobo').nullable().optional(),
    change_reason: z.string().trim().min(5, 'Provide a meaningful change reason (at least 5 characters)'),
}).refine((data) => data.tier1_daily_limit_minor > data.tier0_daily_limit_minor, {
    message: 'Tier 1 daily limit must be strictly greater than Tier 0 daily limit.',
    path: ['tier1_daily_limit_minor'],
}).refine((data) => data.tier2_daily_limit_minor === null || data.tier2_daily_limit_minor === undefined || data.tier2_daily_limit_minor > data.tier1_daily_limit_minor, {
    message: 'Tier 2 daily limit must be strictly greater than Tier 1 daily limit (or null for uncapped).',
    path: ['tier2_daily_limit_minor'],
});

export async function getKycTierSettings(): Promise<KycTierSettings> {
    const { data, error } = await adminClient
        .from('kyc_tier_settings')
        .select('*')
        .eq('singleton', true)
        .maybeSingle();

    if (error || !data) {
        return {
            tier0_daily_limit_minor: 20_000_000,
            tier1_daily_limit_minor: 70_000_000,
            tier2_daily_limit_minor: null,
            version: 1,
            updated_at: new Date().toISOString(),
            updated_by: null,
            change_reason: 'Default canonical policy',
        };
    }
    return data as KycTierSettings;
}

export async function getKycTierPolicyHistory(limit = 20): Promise<KycTierPolicyHistoryItem[]> {
    const { data } = await adminClient
        .from('kyc_tier_policy_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    return (data ?? []) as KycTierPolicyHistoryItem[];
}

export async function updateKycTierSettings(
    input: z.infer<typeof kycTierSettingsUpdateSchema>,
    actorId: string,
): Promise<KycTierSettings> {
    const current = await getKycTierSettings();
    const newVersion = current.version + 1;
    const { data, error } = await adminClient
        .from('kyc_tier_settings')
        .update({
            tier0_daily_limit_minor: input.tier0_daily_limit_minor,
            tier1_daily_limit_minor: input.tier1_daily_limit_minor,
            tier2_daily_limit_minor: input.tier2_daily_limit_minor ?? null,
            version: newVersion,
            updated_at: new Date().toISOString(),
            updated_by: actorId,
            change_reason: input.change_reason,
        })
        .eq('singleton', true)
        .select('*')
        .single();

    if (error || !data) {
        throw new KycReviewError(error?.message ?? 'Could not update KYC tier settings.', 'kyc_tier_settings_save_failed', 503);
    }
    return data as KycTierSettings;
}

export class WalletDebitLimitError extends Error {
    code = 'daily_debit_cap_exceeded';
    statusCode = 409;
    constructor(message: string) {
        super(message);
        this.name = 'WalletDebitLimitError';
    }
}

export async function assertWalletDailyDebitLimitAllowed(
    walletId: string,
    amountMinor: number,
): Promise<{ allowed: boolean; dailyLimitMinor: number | null; dailyDebitsMinor: number; remainingMinor: number | null }> {
    const { data: wallet } = await adminClient
        .from('wallets')
        .select('id, daily_debit_cap_minor, owner_type, owner_id')
        .eq('id', walletId)
        .maybeSingle();

    if (!wallet || wallet.daily_debit_cap_minor === null || wallet.daily_debit_cap_minor === undefined) {
        return { allowed: true, dailyLimitMinor: null, dailyDebitsMinor: 0, remainingMinor: null };
    }

    const todayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;

    // 1. Debits executed today
    const { data: debits } = await adminClient
        .from('wallet_ledger_entries')
        .select('amount_minor')
        .eq('wallet_id', walletId)
        .eq('direction', 'debit')
        .gte('created_at', todayStart);

    const executedDebits = (debits ?? []).reduce((sum, d) => sum + Number(d.amount_minor ?? 0), 0);

    // 2. Active holds created today
    const { data: holds } = await adminClient
        .from('wallet_holds')
        .select('amount_minor')
        .eq('wallet_id', walletId)
        .eq('status', 'active')
        .gte('created_at', todayStart);

    const activeHolds = (holds ?? []).reduce((sum, h) => sum + Number(h.amount_minor ?? 0), 0);

    const totalUsed = executedDebits + activeHolds;
    const limit = Number(wallet.daily_debit_cap_minor);
    const projected = totalUsed + amountMinor;

    if (projected > limit) {
        const limitNaira = (limit / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
        const usedNaira = (totalUsed / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
        const reqNaira = (amountMinor / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
        throw new WalletDebitLimitError(
            `This transaction of ${reqNaira} exceeds your daily debit limit of ${limitNaira}. (Total used today: ${usedNaira}). Complete KYC verification to upgrade your daily limit.`,
        );
    }

    return {
        allowed: true,
        dailyLimitMinor: limit,
        dailyDebitsMinor: totalUsed,
        remainingMinor: Math.max(0, limit - totalUsed),
    };
}
