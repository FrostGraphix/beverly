/**
 * VAT policy governance.
 *
 * Supabase owns approved VAT rates. The environment default only protects local
 * development before the governance migration is available.
 */
import { env } from '../config/env.js';
import { adminClient } from '../db/supabase.js';

export interface VatPolicy {
    id: string;
    jurisdiction: string;
    label: string;
    rate_basis_points: number;
    effective_at: string;
    status: 'pending' | 'approved' | 'rejected' | 'superseded';
    submitted_by: string | null;
    approved_by: string | null;
    approved_at: string | null;
    rejection_reason: string | null;
    created_at: string;
    updated_at: string;
}

let cachedVatRate: { rate: number; expiresAt: number } | null = null;

export async function resolveVatRateBasisPoints(at = new Date()): Promise<number> {
    const now = Date.now();
    if (cachedVatRate && cachedVatRate.expiresAt > now) return cachedVatRate.rate;
    const { data, error } = await adminClient
        .from('vat_policies')
        .select('rate_basis_points')
        .eq('jurisdiction', 'NG')
        .eq('status', 'approved')
        .lte('effective_at', at.toISOString())
        .order('effective_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) return env.VENDING_VAT_BASIS_POINTS;
    const rate = Number((data as any)?.rate_basis_points ?? env.VENDING_VAT_BASIS_POINTS);
    cachedVatRate = { rate, expiresAt: now + 60_000 };
    return rate;
}

export async function listVatPolicies(): Promise<VatPolicy[]> {
    const { data, error } = await adminClient
        .from('vat_policies')
        .select('*')
        .order('effective_at', { ascending: false })
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as VatPolicy[];
}

export async function submitVatPolicy(input: {
    label: string;
    rateBasisPoints: number;
    effectiveAt: string;
    actorUserId: string;
}): Promise<VatPolicy> {
    const { data, error } = await adminClient
        .from('vat_policies')
        .insert({
            jurisdiction: 'NG',
            label: input.label,
            rate_basis_points: input.rateBasisPoints,
            effective_at: input.effectiveAt,
            status: 'pending',
            submitted_by: input.actorUserId,
        })
        .select('*')
        .single();
    if (error) throw error;
    return data as VatPolicy;
}

export async function approveVatPolicy(id: string, actorUserId: string): Promise<VatPolicy> {
    const { data: current, error: lookupError } = await adminClient
        .from('vat_policies')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (lookupError) throw lookupError;
    if (!current) throw new Error('vat_policy_not_found');

    const policy = current as VatPolicy;
    const approvedAt = new Date().toISOString();
    const { data, error } = await adminClient
        .from('vat_policies')
        .update({
            status: 'approved',
            approved_by: actorUserId,
            approved_at: approvedAt,
        })
        .eq('id', id)
        .eq('status', 'pending')
        .select('*')
        .single();
    if (error) throw error;

    await adminClient
        .from('vat_policies')
        .update({ status: 'superseded' })
        .eq('jurisdiction', policy.jurisdiction)
        .eq('status', 'approved')
        .lt('effective_at', policy.effective_at)
        .neq('id', id);
    cachedVatRate = null;
    return data as VatPolicy;
}
