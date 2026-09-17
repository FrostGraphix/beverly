import { describe, expect, it } from 'vitest';
import { presentVendorMfaError } from '../../../../../apps/vendor/src/lib/mfa-errors.js';

describe('vendor MFA error presentation', () => {
    it('shows recovery guidance and a support reference', () => {
        const presentation = presentVendorMfaError({
            code: 'mfa_secret_invalid',
            message: 'Use a recovery code. Contact Beverly support if none remain.',
            details: { correlationId: 'req-mfa-123' },
        }, 'Security code failed.');

        expect(presentation).toEqual({
            message: 'Use a recovery code. Contact Beverly support if none remain.',
            reference: 'req-mfa-123',
            recoveryRequired: true,
        });
    });
});
