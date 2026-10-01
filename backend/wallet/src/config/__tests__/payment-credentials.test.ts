import { describe, expect, it } from 'vitest';
import { normalizePaystackKey } from '../env.js';

describe('Paystack credential normalization', () => {
    it('removes transport whitespace and matching quotes', () => {
        expect(normalizePaystackKey('  "pk_live_abc123"\r\n')).toBe('pk_live_abc123');
        expect(normalizePaystackKey(" 'sk_live_xyz789'\n")).toBe('sk_live_xyz789');
    });

    it('does not repair malformed credentials', () => {
        expect(normalizePaystackKey('not-a-key')).toBe('not-a-key');
        expect(normalizePaystackKey('')).toBeUndefined();
    });
});
