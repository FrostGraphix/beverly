import { describe, expect, it } from 'vitest';
import { isPasswordSetupRoute } from '../staff-route-access.js';

describe('staff temporary-password route access', () => {
    it.each([
        '/api/v1/admin/me',
        '/api/v1/admin/password-change',
        '/api/v1/admin/account-setup',
        '/api/v1/admin/logout',
    ])('allows setup route %s', (routeUrl) => {
        expect(isPasswordSetupRoute(routeUrl)).toBe(true);
    });

    it.each([
        '/api/v1/admin/notifications',
        '/api/v1/admin/access/users',
        '/api/v1/vendor/account-setup',
        '/api/v1/admin/account-setup/extra',
    ])('blocks non-setup route %s', (routeUrl) => {
        expect(isPasswordSetupRoute(routeUrl)).toBe(false);
    });
});
