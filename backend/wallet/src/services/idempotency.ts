/**
 * Helpers for composing deterministic idempotency keys.
 *
 * Pattern: `<domain>.<operation>.<entityId>.<discriminator>`
 * The discriminator is typically the client-supplied Idempotency-Key header
 * for user-initiated writes, or a deterministic value for system flows.
 */
import crypto from 'node:crypto';
import { adminClient } from '../db/supabase.js';

const CLIENT_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/;

export function assertClientIdempotencyKey(value: unknown): string {
    const key = typeof value === 'string' ? value.trim() : '';
    if (!CLIENT_IDEMPOTENCY_KEY.test(key)) {
        throw new Error('A valid Idempotency-Key header is required.');
    }
    return key;
}

export type IdempotencyClaim =
    | { state: 'claimed' }
    | { state: 'replay'; responsePayload: unknown }
    | { state: 'pending' };

export async function claimWalletIdempotency(
    scope: string,
    idempotencyKey: string,
    requestFingerprint: string,
): Promise<IdempotencyClaim> {
    const { data, error } = await adminClient.rpc('fn_claim_wallet_idempotency', {
        p_scope: scope,
        p_idempotency_key: idempotencyKey,
        p_request_fingerprint: requestFingerprint,
    });
    if (error) throw error;
    const claim = Array.isArray(data) ? data[0] : data;
    if (claim?.state === 'replay') return { state: 'replay', responsePayload: claim.response_payload };
    if (claim?.state === 'pending') return { state: 'pending' };
    return { state: 'claimed' };
}

export async function completeWalletIdempotency(
    scope: string,
    idempotencyKey: string,
    responsePayload: unknown,
): Promise<void> {
    const { error } = await adminClient.rpc('fn_complete_wallet_idempotency', {
        p_scope: scope,
        p_idempotency_key: idempotencyKey,
        p_response_payload: responsePayload,
    });
    if (error) throw error;
}

export async function abandonWalletIdempotency(
    scope: string,
    idempotencyKey: string,
    requestFingerprint: string,
): Promise<void> {
    const { error } = await adminClient.rpc('fn_abandon_wallet_idempotency', {
        p_scope: scope,
        p_idempotency_key: idempotencyKey,
        p_request_fingerprint: requestFingerprint,
    });
    if (error) throw error;
}

export function ledgerKey(
    domain: 'funding' | 'payment' | 'purchase' | 'meter_order' | 'manual' | 'reversal' | 'fee' | 'promo',
    operation: 'credit' | 'debit' | 'capture',
    entityId: string,
    discriminator: string,
): string {
    return `${domain}.${operation}.${entityId}.${discriminator}`;
}

export function hashIdempotency(parts: (string | number | null | undefined)[]): string {
    const input = parts.filter((p) => p !== null && p !== undefined).join('|');
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 32);
}

export function newRequestId(): string {
    return crypto.randomUUID();
}
