import { describe, expect, it } from 'vitest';
import {
    buildSparkMeterProductionCanaryPlan,
    buildSparkMeterAuthHeaders,
    buildSparkMeterPaymentRequest,
    evaluateSparkMeterCreditSafety,
    parseSparkMeterPaymentResponse,
} from '../sparkmeter-v1.js';

describe('SparkMeter Koios v1 adapter', () => {
    it.each([
        { creditMinor: Number.NaN },
        { creditMinor: Number.POSITIVE_INFINITY },
        { creditMinor: 0.5 },
        { planBalanceMinor: Number.MAX_SAFE_INTEGER + 1 },
        { lastMeterState: 'unknown' },
        { lastMeterState: '' },
        { operatingMode: null },
        { now: 'invalid' },
        { lastReadingAt: '2026-09-25T10:00:01.000Z' },
        { lastReadingAt: '2026-09-25T09:50:00' },
    ])('rejects malformed or uncertain telemetry: %j', (override) => {
        const result = evaluateSparkMeterCreditSafety({
            creditMinor: 100,
            planBalanceMinor: 0,
            operatingMode: 'auto',
            lastMeterState: 'off',
            lastReadingAt: '2026-09-25T09:50:00.000Z',
            now: '2026-09-25T10:00:00.000Z',
            ...override,
        } as Parameters<typeof evaluateSparkMeterCreditSafety>[0]);
        expect(result).toMatchObject({
            allowFinancialWrite: false,
            requiresManualReview: true,
            expectedMeterState: 'unknown',
            reason: 'invalid_telemetry',
        });
        expect(result.displayedBalanceMinor === null || Number.isSafeInteger(result.displayedBalanceMinor)).toBe(true);
    });

    it('blocks stale telemetry without estimating debt', () => {
        expect(evaluateSparkMeterCreditSafety({
            creditMinor: 0,
            planBalanceMinor: 0,
            operatingMode: 'auto',
            lastMeterState: 'off',
            lastReadingAt: '2026-09-25T09:00:00.000Z',
            now: '2026-09-25T10:00:01.000Z',
        })).toEqual({
            allowFinancialWrite: false,
            displayedBalanceMinor: 0,
            expectedMeterState: 'off',
            requiresManualReview: false,
            reason: 'telemetry_stale',
        });
    });

    it('flags energized zero-credit meters', () => {
        expect(evaluateSparkMeterCreditSafety({
            creditMinor: 0,
            planBalanceMinor: 0,
            operatingMode: 'auto',
            lastMeterState: 'on',
            lastReadingAt: '2026-09-25T09:50:00.000Z',
            now: '2026-09-25T10:00:00.000Z',
        })).toEqual({
            allowFinancialWrite: false,
            displayedBalanceMinor: 0,
            expectedMeterState: 'off',
            requiresManualReview: true,
            reason: 'zero_credit_meter_on',
        });
    });

    it('preserves provider debt for review', () => {
        expect(evaluateSparkMeterCreditSafety({
            creditMinor: -25,
            planBalanceMinor: 0,
            operatingMode: 'auto',
            lastMeterState: 'off',
            lastReadingAt: '2026-09-25T09:50:00.000Z',
            now: '2026-09-25T10:00:00.000Z',
        })).toEqual({
            allowFinancialWrite: false,
            displayedBalanceMinor: -25,
            expectedMeterState: 'off',
            requiresManualReview: true,
            reason: 'provider_balance_negative',
        });
    });

    it('never authorizes payment from fresh positive telemetry', () => {
        expect(evaluateSparkMeterCreditSafety({
            creditMinor: 10_000,
            planBalanceMinor: 0,
            operatingMode: 'auto',
            lastMeterState: 'on',
            lastReadingAt: '2026-09-25T09:50:00.000Z',
            now: '2026-09-25T10:00:00.000Z',
        })).toEqual({
            allowFinancialWrite: false,
            displayedBalanceMinor: 10_000,
            expectedMeterState: 'unknown',
            requiresManualReview: false,
            reason: 'advisory_only',
        });
    });

    it('builds a single-attempt production canary plan', () => {
        expect(buildSparkMeterProductionCanaryPlan({
            installationId: '53f12390-74f7-40b3-b1db-e907c256986d',
            externalCustomerId: 'a49c0554-60be-406c-b109-03cc2ba785f4',
            amountMinor: 100,
        }, {
            enabled: true,
            approvedInstallationId: '53f12390-74f7-40b3-b1db-e907c256986d',
            approvedExternalCustomerId: 'a49c0554-60be-406c-b109-03cc2ba785f4',
            maximumAmountMinor: 100,
            remainingUses: 1,
            writeContractAcknowledged: true,
        })).toEqual({
            attemptLimit: 1,
            automaticRetry: false,
            captureMode: 'confirmed_success_only',
            ambiguousOutcome: 'manual_review',
            releaseHoldOnAmbiguous: false,
        });
    });

    it.each([
        [{ enabled: false }, 'disabled'],
        [{ writeContractAcknowledged: false }, 'acknowledgement'],
        [{ remainingUses: 0 }, 'exactly one remaining use'],
        [{ approvedInstallationId: '11111111-1111-4111-8111-111111111111' }, 'installation'],
        [{ approvedExternalCustomerId: 'different-customer' }, 'customer'],
        [{ maximumAmountMinor: 99 }, 'amount exceeds approval'],
    ])('fails closed when canary policy changes: %s', (override, expectedMessage) => {
        expect(() => buildSparkMeterProductionCanaryPlan({
            installationId: '53f12390-74f7-40b3-b1db-e907c256986d',
            externalCustomerId: 'a49c0554-60be-406c-b109-03cc2ba785f4',
            amountMinor: 100,
        }, {
            enabled: true,
            approvedInstallationId: '53f12390-74f7-40b3-b1db-e907c256986d',
            approvedExternalCustomerId: 'a49c0554-60be-406c-b109-03cc2ba785f4',
            maximumAmountMinor: 100,
            remainingUses: 1,
            writeContractAcknowledged: true,
            ...override,
        })).toThrow(expectedMessage);
    });

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
