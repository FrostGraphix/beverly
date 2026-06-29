import { adminClient } from '../db/supabase.js';
import { env } from '../config/env.js';

export interface VatPolicy { id: string; label: string; rate_basis_points: number; effective_at: string; status: string; approved_by: string | null; approved_at: string | null; }

let cached: { rate: number; expiresAt: number } | null = null;

export async function resolveVatRateBasisPoints(at = new Date()): Promise<number> {
    if (cached && cached.expiresAt > Date.now()) return cached.rate;
    const { data, error } = await adminClient.from('vat_policies').select('rate_basis_points').eq('jurisdiction', 'NG').eq('status', 'approved').lte('effective_at', at.toISOString()).order('effective_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    const rate = Number((data as { rate_basis_points?: number } | null)?.rate_basis_points ?? env.VENDING_VAT_BASIS_POINTS);
    cached = { rate, expiresAt: Date.now() + 60_000 };
    return rate;
}

export async function listVatPolicies(): Promise<VatPolicy[]> {
    const { data, error } = await adminClient.from('vat_policies').select('id,label,rate_basis_points,effective_at,status,approved_by,approved_at').eq('jurisdiction', 'NG').order('effective_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as VatPolicy[];
}

export async function submitVatPolicy(input: { label: string; rateBasisPoints: number; effectiveAt: string; actorUserId: string }): Promise<VatPolicy> {
    const { data, error } = await adminClient.from('vat_policies').insert({ jurisdiction: 'NG', label: input.label, rate_basis_points: input.rateBasisPoints, effective_at: input.effectiveAt, submitted_by: input.actorUserId }).select('id,label,rate_basis_points,effective_at,status,approved_by,approved_at').single();
    if (error) throw error;
    return data as VatPolicy;
}

export async function approveVatPolicy(id: string, actorUserId: string): Promise<VatPolicy> {
    const now = new Date().toISOString();
    const { data, error } = await adminClient.from('vat_policies').update({ status: 'approved', approved_by: actorUserId, approved_at: now, updated_at: now }).eq('id', id).eq('status', 'pending').select('id,label,rate_basis_points,effective_at,status,approved_by,approved_at').single();
    if (error) throw error;
    cached = null;
    return data as VatPolicy;
}
