import { describe, expect, it } from 'vitest';
import { presentVendorVendFailure } from '../../../../../apps/vendor/src/lib/vend-errors.js';

describe('vendor vend failure presentation', () => {
    it('keeps quota failures inline and blocking', () => {
        expect(presentVendorVendFailure(
            'oem_insufficient_quota',
            { retryAfterSeconds: 240, operationsNotified: true },
        )).toEqual({
            showPopup: false,
            blockConfirmation: true,
            action: 'No wallet debit occurred. Beverly operations were notified. Retry after 4 minutes.',
        });
    });

    it('keeps unexpected failures visible', () => {
        expect(presentVendorVendFailure('unexpected_failure')).toMatchObject({
            showPopup: true,
            blockConfirmation: false,
        });
    });

    it('blocks when safety checks fail', () => {
        expect(presentVendorVendFailure('oem_quota_circuit_unavailable')).toEqual({
            showPopup: false,
            blockConfirmation: true,
            action: 'No wallet debit occurred. Retry after one minute.',
        });
    });
});
