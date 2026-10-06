import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { evaluateVendorPassword } from '@beverly/tokens/password-policy';
import { generateTemporaryPassword } from '../temporary-password.js';

describe('temporary password issuance', () => {
    it('generates policy-compliant unique credentials', () => {
        const generated = Array.from({ length: 100 }, generateTemporaryPassword);
        expect(new Set(generated).size).toBe(100);
        for (const password of generated) {
            expect(password).toHaveLength(20);
            expect(evaluateVendorPassword(password).valid).toBe(true);
        }
    });

    it('retries a candidate containing a banned common pattern', () => {
        const all = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?';
        const filler = ['a', 'b', 'c', 'A', 'A', 'A', 'A', 'A'];
        let calls = 0;
        const randomInt = vi.spyOn(crypto, 'randomInt').mockImplementation((max) => {
            const call = calls++;
            if (call < 4) return 0;
            if (call < 12) return all.indexOf(filler[call - 4]);
            if (call < 23) return max - 1;
            return 0;
        });
        try {
            const password = generateTemporaryPassword(12);
            expect(calls).toBeGreaterThan(23);
            expect(evaluateVendorPassword(password).valid).toBe(true);
        } finally {
            randomInt.mockRestore();
        }
    });
});
