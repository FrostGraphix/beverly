import { describe, expect, it } from 'vitest';
import {
    buildFundingCallbackUrl,
    buildMeterOrderCallbackUrl,
    resolveFundingCallbackUrl,
    resolveMeterOrderCallbackUrl,
} from '../funding-callbacks.js';

describe('funding callback URLs', () => {
    it('builds local customer and vendor returns', () => {
        expect(buildFundingCallbackUrl('customer', 'http://localhost:5173'))
            .toBe('http://localhost:5173/wallet/fund?payment=return');
        expect(buildFundingCallbackUrl('vendor', 'http://localhost:5174/'))
            .toBe('http://localhost:5174/wallet/fund?payment=return');
    });

    it('preserves Vercel path prefixes', () => {
        expect(buildFundingCallbackUrl('customer', 'https://beverly.vercel.app/wallet-customer/'))
            .toBe('https://beverly.vercel.app/wallet-customer/wallet/fund?payment=return');
        expect(buildFundingCallbackUrl('vendor', 'https://beverly.vercel.app/wallet-vendor'))
            .toBe('https://beverly.vercel.app/wallet-vendor/wallet/fund?payment=return');
    });

    it('honors dedicated portal callbacks', () => {
        expect(resolveFundingCallbackUrl(
            'customer',
            'https://customer-acob-beverly.vercel.app/wallet/fund?payment=return',
            'http://localhost:5173',
        )).toBe('https://customer-acob-beverly.vercel.app/wallet/fund?payment=return');
    });

    it('builds customer meter-order returns', () => {
        expect(buildMeterOrderCallbackUrl('http://localhost:5173'))
            .toBe('http://localhost:5173/meter-orders');
        expect(buildMeterOrderCallbackUrl('https://beverly.vercel.app/wallet-customer/'))
            .toBe('https://beverly.vercel.app/wallet-customer/meter-orders');
        expect(resolveMeterOrderCallbackUrl(
            'https://customer-acob-beverly.vercel.app/meter-orders',
            'http://localhost:5173',
        )).toBe('https://customer-acob-beverly.vercel.app/meter-orders');
    });
});
