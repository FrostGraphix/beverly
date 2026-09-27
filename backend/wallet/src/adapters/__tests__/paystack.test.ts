import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
    PAYSTACK_SECRET_KEY: 'sk_test_secret_123' as string | undefined,
}));

vi.mock('../../config/env.js', () => ({
    env: mockEnv,
    isProd: false,
    isDev: true,
    corsOrigins: [],
}));

import { initializeTransaction, verifyWebhookSignature } from '../paystack.js';
import crypto from 'node:crypto';

describe('paystack webhook signature', () => {
    const secret = 'sk_test_secret_123';

    beforeEach(() => {
        mockEnv.PAYSTACK_SECRET_KEY = secret;
    });

    it('accepts a valid HMAC-SHA512 signature', () => {
        const body = JSON.stringify({ event: 'charge.success', data: { reference: 'abc' } });
        const sig = crypto.createHmac('sha512', secret).update(body).digest('hex');
        expect(verifyWebhookSignature(body, sig)).toBe(true);
    });

    it('rejects a tampered body', () => {
        const body = JSON.stringify({ event: 'charge.success', data: { reference: 'abc' } });
        const sig = crypto.createHmac('sha512', secret).update(body).digest('hex');
        const tampered = body.replace('abc', 'xyz');
        expect(verifyWebhookSignature(tampered, sig)).toBe(false);
    });

    it('rejects missing signature', () => {
        expect(verifyWebhookSignature('body', undefined)).toBe(false);
    });

    it('rejects wrong signature', () => {
        expect(verifyWebhookSignature('body', 'a'.repeat(128))).toBe(false);
    });

    it('rejects non-integer gateway amounts before making a request', async () => {
        await expect(initializeTransaction({
            email: 'buyer@example.test',
            amountMinor: 10.5,
            reference: 'ref-1',
        })).rejects.toThrow('positive integer in kobo');
    });

    it('returns a safe service error when credentials are unavailable', async () => {
        mockEnv.PAYSTACK_SECRET_KEY = undefined;

        await expect(initializeTransaction({
            email: 'buyer@example.test',
            amountMinor: 50_000,
            reference: 'ref-2',
        })).rejects.toMatchObject({
            code: 'paystack_unavailable',
            statusCode: 503,
            message: 'Paystack is temporarily unavailable. Kindly use bank transfer.',
        });
    });
});
