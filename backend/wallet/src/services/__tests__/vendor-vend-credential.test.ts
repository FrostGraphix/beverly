import { describe, expect, it } from 'vitest';
import { validateVendCredential, VendorVendCredentialError } from '../vendor-vend-credential.js';

describe('vendor vend credential validation', () => {
    it('accepts strong vendor PINs and passwords', () => {
        expect(() => validateVendCredential('pin', '4829')).not.toThrow();
        expect(() => validateVendCredential('password', 'BeverlyVend42')).not.toThrow();
    });

    it('rejects predictable or malformed PINs', () => {
        expect(() => validateVendCredential('pin', '1234')).toThrow(VendorVendCredentialError);
        expect(() => validateVendCredential('pin', '0000')).toThrow(VendorVendCredentialError);
        expect(() => validateVendCredential('pin', '12ab')).toThrow(VendorVendCredentialError);
    });

    it('rejects weak passwords', () => {
        expect(() => validateVendCredential('password', 'short1')).toThrow(VendorVendCredentialError);
        expect(() => validateVendCredential('password', 'lettersOnly')).toThrow(VendorVendCredentialError);
        expect(() => validateVendCredential('password', '1234567890')).toThrow(VendorVendCredentialError);
    });
});
