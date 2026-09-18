import { describe, expect, it } from 'vitest';
import {
    buildSparkMeterAuthHeaders,
    buildSparkMeterPaymentRequest,
    parseSparkMeterPaymentResponse,
} from '../sparkmeter-v1.js';

describe('SparkMeter Koios v1 adapter', () => {
    it('builds the documented authentication headers', () => {
        expect(buildSparkMeterAuthHeaders('public-key', 'private-secret')).toEqual({
            'X-API-KEY': 'public-key',
            'X-API-SECRET': 'private-secret',
        });
    });

    it('rejects incomplete authentication credentials', () => {
        expect(() => buildSparkMeterAuthHeaders('public-key', ''))
            .toThrow('SparkMeter API credentials are incomplete');
    });

    it('builds the documented customer-id payment request', () => {
        expect(buildSparkMeterPaymentRequest({
            commandId: '4b85a890-75ee-48ff-8eb1-bf19b6282494',
            amountMinor: 234,
            currency: 'USD',
            settlementCurrency: 'USD',
            externalCustomerId: 'a49c0554-60be-406c-b109-03cc2ba785f4',
        })).toEqual({
            method: 'POST',
            path: '/api/v1/payments',
            body: {
                amount: '2.34',
                memo: 'Beverly vend 4b85a890-75ee-48ff-8eb1-bf19b6282494',
                customer_id: 'a49c0554-60be-406c-b109-03cc2ba785f4',
            },
        });
    });

    it('rejects unverified currency conversion', () => {
        expect(() => buildSparkMeterPaymentRequest({
            commandId: '4b85a890-75ee-48ff-8eb1-bf19b6282494',
            amountMinor: 234,
            currency: 'NGN',
            settlementCurrency: 'USD',
            externalCustomerId: 'a49c0554-60be-406c-b109-03cc2ba785f4',
        })).toThrow('SparkMeter settlement currency mismatch');
    });

    it('rejects nonpositive payment amounts', () => {
        expect(() => buildSparkMeterPaymentRequest({
            commandId: '4b85a890-75ee-48ff-8eb1-bf19b6282494',
            amountMinor: 0,
            currency: 'USD',
            settlementCurrency: 'USD',
            externalCustomerId: 'a49c0554-60be-406c-b109-03cc2ba785f4',
        })).toThrow('SparkMeter payment amount is invalid');
    });

    it('rejects missing customer mappings', () => {
        expect(() => buildSparkMeterPaymentRequest({
            commandId: '4b85a890-75ee-48ff-8eb1-bf19b6282494',
            amountMinor: 234,
            currency: 'USD',
            settlementCurrency: 'USD',
            externalCustomerId: '',
        })).toThrow('SparkMeter customer mapping is required');
    });

    it('normalizes documented processed payments', () => {
        expect(parseSparkMeterPaymentResponse(201, {
            errors: [],
            data: {
                id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                recipient_id: 'a49c0554-60be-406c-b109-03cc2ba785f4',
                amount: { value: '2.34', currency: 'USD' },
                memo: 'Cash payment',
                external_id: 'ZQRS5',
                status: 'processed',
            },
        })).toEqual({
            status: 'confirmed_success',
            providerReference: 'ZQRS5',
        });
    });

    it('normalizes documented request rejection', () => {
        expect(parseSparkMeterPaymentResponse(400, {
            errors: [{ title: 'Unknown parameter', details: 'query' }],
            data: null,
            cursor: null,
        })).toEqual({
            status: 'confirmed_failure',
            reason: 'Unknown parameter: query',
        });
    });
});
