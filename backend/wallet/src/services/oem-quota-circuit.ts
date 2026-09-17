import { adminClient } from '../db/supabase.js';
import { DEFAULT_OEM_SLUG } from './oem-registry.js';

const QUOTA_PROBE_DELAY_MS = 5 * 60 * 1000;

export class OemQuotaCircuitError extends Error {
    constructor(
        message: string,
        public code = 'oem_insufficient_quota',
        public retryAfterSeconds: number,
    ) {
        super(message);
        this.name = 'OemQuotaCircuitError';
    }
}

function oemKey(value: string | null | undefined): string {
    return String(value || DEFAULT_OEM_SLUG).trim().toLowerCase();
}

export async function assertOemVendAvailable(
    oemId: string | null | undefined,
    now = new Date(),
): Promise<void> {
    const { data, error } = await adminClient
        .from('oem_vending_circuits')
        .select('status, blocked_until, public_message')
        .eq('oem_key', oemKey(oemId))
        .maybeSingle();
    if (error) {
        console.error('[oem-quota-circuit] lookup failed:', error.message);
        return;
    }
    if (!data || data.status !== 'blocked') return;

    const blockedUntil = new Date(data.blocked_until).getTime();
    const remainingMs = blockedUntil - now.getTime();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) return;

    throw new OemQuotaCircuitError(
        data.public_message || 'OEM vending is paused while quota is restored. No wallet debit occurred.',
        'oem_insufficient_quota',
        Math.max(1, Math.ceil(remainingMs / 1000)),
    );
}

export async function claimOemVendProbe(
    oemId: string | null | undefined,
    now = new Date(),
): Promise<void> {
    const probeUntil = new Date(now.getTime() + QUOTA_PROBE_DELAY_MS);
    const { data, error } = await adminClient.rpc('claim_oem_vending_probe', {
        p_oem_key: oemKey(oemId),
        p_now: now.toISOString(),
        p_probe_until: probeUntil.toISOString(),
    });
    if (error) {
        throw new OemQuotaCircuitError(
            'Vending safety checks are temporarily unavailable. No wallet debit occurred.',
            'oem_quota_circuit_unavailable',
            60,
        );
    }
    if (data === true) return;
    throw new OemQuotaCircuitError(
        'OEM vending is paused while quota is restored. No wallet debit occurred.',
        'oem_insufficient_quota',
        QUOTA_PROBE_DELAY_MS / 1000,
    );
}

export async function recordOemQuotaFailure(
    oemId: string | null | undefined,
    publicMessage: string,
    now = new Date(),
): Promise<void> {
    const blockedUntil = new Date(now.getTime() + QUOTA_PROBE_DELAY_MS).toISOString();
    const { error } = await adminClient.from('oem_vending_circuits').upsert({
        oem_key: oemKey(oemId),
        status: 'blocked',
        reason_code: 'oem_insufficient_quota',
        public_message: publicMessage.slice(0, 500),
        blocked_until: blockedUntil,
        last_failure_at: now.toISOString(),
        updated_at: now.toISOString(),
    }, { onConflict: 'oem_key' });
    if (error) console.error('[oem-quota-circuit] persistence failed:', error.message);
}

export async function clearOemQuotaCircuit(
    oemId: string | null | undefined,
    now = new Date(),
): Promise<void> {
    const { error } = await adminClient
        .from('oem_vending_circuits')
        .update({
            status: 'ready',
            blocked_until: now.toISOString(),
            last_success_at: now.toISOString(),
            updated_at: now.toISOString(),
        })
        .eq('oem_key', oemKey(oemId));
    if (error) console.error('[oem-quota-circuit] clear failed:', error.message);
}
