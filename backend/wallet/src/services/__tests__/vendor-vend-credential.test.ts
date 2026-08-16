import { describe, expect, it } from 'vitest';
import { hasVendorVendCredential, validateVendCredential, VendorVendCredentialError } from '../vendor-vend-credential.js';

describe('vendor vend credential validation', () => {
    it('requires the complete stored credential', () => {
        const complete = {
            vend_credential_type: 'pin',
            vend_credential_hash: 'hash',
            vend_credential_salt: 'salt',
            vend_credential_set_at: '2026-07-14T00:00:00.000Z',
        };
        expect(hasVendorVendCredential(complete)).toBe(true);
        expect(hasVendorVendCredential({ ...complete, vend_credential_hash: null })).toBe(false);
        expect(hasVendorVendCredential({ ...complete, vend_credential_salt: null })).toBe(false);
        expect(hasVendorVendCredential({ ...complete, vend_credential_type: null })).toBe(false);
    });

    it('accepts strong four-digit PINs', () => {
        expect(() => validateVendCredential('pin', '4829')).not.toThrow();
    });

    it('rejects predictable or malformed PINs', () => {
        expect(() => validateVendCredential('pin', '1234')).toThrow(VendorVendCredentialError);
        expect(() => validateVendCredential('pin', '0000')).toThrow(VendorVendCredentialError);
        expect(() => validateVendCredential('pin', '12ab')).toThrow(VendorVendCredentialError);
        expect(() => validateVendCredential('pin', '48291')).toThrow(VendorVendCredentialError);
    });
});
