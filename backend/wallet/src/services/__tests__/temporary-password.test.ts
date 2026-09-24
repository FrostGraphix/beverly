import { describe, expect, it } from 'vitest';
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
});
