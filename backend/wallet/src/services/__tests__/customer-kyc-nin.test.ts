import { describe, expect, it } from 'vitest';
import {
    getNinVerificationAvailability,
    submitKycTier2Nin,
} from '../customer-kyc.js';

describe('customer NIN verification', () => {
    it('reports unavailable without naming infrastructure secrets', () => {
        const status = getNinVerificationAvailability();
        expect(status.available).toBe(false);
        expect(status.code).toBe('nin_service_unavailable');
        expect(status.message).not.toContain('PAYSTACK_SECRET_KEY');
    });

    it('fails closed before accepting unsupported verification', async () => {
        await expect(submitKycTier2Nin({
            customerId: 'customer-1',
            actorUserId: 'user-1',
            nin: '12345678901',
        })).rejects.toMatchObject({
            code: 'nin_service_unavailable',
        });
    });

    it('still rejects malformed NIN input', async () => {
        await expect(submitKycTier2Nin({
            customerId: 'customer-1',
            actorUserId: 'user-1',
            nin: '1234',
        })).rejects.toMatchObject({
            code: 'invalid_nin',
        });
    });
});
