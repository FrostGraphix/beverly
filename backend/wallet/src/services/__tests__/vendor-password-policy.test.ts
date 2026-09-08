import { describe, expect, it } from 'vitest';
import { evaluateVendorPassword } from '@beverly/tokens/password-policy';

describe('vendor password policy', () => {
    it.each([
        ['all lowercase despite sufficient length', 'longpassword!2'],
        ['no lowercase letter', 'LONGPASSWORD!2'],
        ['no number', 'LongPassword!!'],
        ['no symbol', 'LongPassword22'],
        ['common Beverly pattern', 'BeverlySecure!2'],
        ['common keyboard pattern', 'QwertySecure!22'],
    ])('rejects %s', (_label, password) => {
        expect(evaluateVendorPassword(password)).toMatchObject({ valid: false });
    });

    it('accepts a password satisfying every published requirement', () => {
        const result = evaluateVendorPassword('River!Quartz92');
        expect(result.valid).toBe(true);
        expect(result.checks.every((check) => check.ok)).toBe(true);
    });
});
