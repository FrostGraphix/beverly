import { describe, expect, it } from 'vitest';
import { resolveVendorPortalUrl } from '../vendor-portal-url.js';

describe('vendor portal public URL', () => {
    it('forces the canonical production domain', () => {
        expect(resolveVendorPortalUrl('http://localhost:3000', 'production')).toBe(
            'https://beverly.acoblighting.com/wallet-vendor/',
        );
        expect(resolveVendorPortalUrl('https://acob-beverly.vercel.app/wallet-vendor/', 'production')).toBe(
            'https://beverly.acoblighting.com/wallet-vendor/',
        );
    });

    it('preserves local development portals', () => {
        expect(resolveVendorPortalUrl('http://localhost:5174', 'development')).toBe('http://localhost:5174/');
    });
});
