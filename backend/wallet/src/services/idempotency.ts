/**
 * Helpers for composing deterministic idempotency keys.
 *
 * Pattern: `<domain>.<operation>.<entityId>.<discriminator>`
 * The discriminator is typically the client-supplied Idempotency-Key header
 * for user-initiated writes, or a deterministic value for system flows.
 */
import crypto from 'node:crypto';

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
