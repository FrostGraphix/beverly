import { describe, expect, it } from 'vitest';
import { safeVendorRedirect } from '../../../../../apps/vendor/src/lib/auth-navigation.js';

describe('vendor authentication navigation', () => {
    it('accepts normal internal destinations', () => {
        expect(safeVendorRedirect('/wallet?source=login')).toBe('/wallet?source=login');
    });

    it.each([
        '/login',
        '/forgot-password',
        '/reset-password?token=secret',
        '/password-change',
        '//evil.example',
        '/\\evil',
        'https://evil.example',
    ])('rejects unsafe destination %s', (destination) => {
        expect(safeVendorRedirect(destination)).toBe('/');
    });
});
