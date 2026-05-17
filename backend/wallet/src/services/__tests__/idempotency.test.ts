import { describe, it, expect } from 'vitest';
import { ledgerKey, hashIdempotency } from '../idempotency.js';

describe('idempotency helpers', () => {
    it('composes deterministic ledger keys', () => {
        const k = ledgerKey('purchase', 'debit', 'po-123', 'client-abc');
        expect(k).toBe('purchase.debit.po-123.client-abc');
    });

    it('hashes inputs deterministically and skips nullish parts', () => {
        const a = hashIdempotency(['purchase', 'po-1', null, 'tag']);
        const b = hashIdempotency(['purchase', 'po-1', undefined, 'tag']);
        const c = hashIdempotency(['purchase', 'po-1', 'tag']);
        expect(a).toBe(b);
        expect(a).toBe(c);
        expect(a).toHaveLength(32);
    });

    it('produces different hashes for different inputs', () => {
        const a = hashIdempotency(['x', '1']);
        const b = hashIdempotency(['x', '2']);
        expect(a).not.toBe(b);
    });
});
