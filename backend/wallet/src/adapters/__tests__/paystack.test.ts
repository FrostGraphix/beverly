import { describe, it, expect, beforeEach, vi } from 'vitest';

// We import after mocking env to ensure secret is set
vi.mock('../../config/env.js', () => ({
    env: {
        PAYSTACK_WEBHOOK_SECRET: 'test_secret_123',
        PAYSTACK_SECRET_KEY: 'sk_test',
    },
    isProd: false,
    isDev: true,
    corsOrigins: [],
}));

import { verifyWebhookSignature } from '../paystack.js';
import crypto from 'node:crypto';

describe('paystack webhook signature', () => {
    const secret = 'test_secret_123';

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
});
