export interface SparkMeterPaymentInput {
    commandId: string;
    amountMinor: number;
    currency: string;
    settlementCurrency: string;
    externalCustomerId: string;
}

export interface SparkMeterPaymentRequest {
    method: 'POST';
    path: '/api/v1/payments';
    body: {
        amount: string;
        memo: string;
        customer_id: string;
    };
}

/** Build Koios v1's documented dual authentication headers. */
export function buildSparkMeterAuthHeaders(apiKey: string, apiSecret: string): Record<'X-API-KEY' | 'X-API-SECRET', string> {
    const key = apiKey.trim();
    const secret = apiSecret.trim();
    if (!key || !secret) throw new Error('SparkMeter API credentials are incomplete');
    return {
        'X-API-KEY': key,
        'X-API-SECRET': secret,
    };
}

/** Build Koios v1's documented customer-ID payment request. */
export function buildSparkMeterPaymentRequest(input: SparkMeterPaymentInput): SparkMeterPaymentRequest {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
        throw new Error('SparkMeter payment amount is invalid');
    }
    if (input.currency.trim().toUpperCase() !== input.settlementCurrency.trim().toUpperCase()) {
        throw new Error('SparkMeter settlement currency mismatch');
    }
    const externalCustomerId = input.externalCustomerId.trim();
    if (!externalCustomerId) throw new Error('SparkMeter customer mapping is required');
    return {
        method: 'POST',
        path: '/api/v1/payments',
        body: {
            amount: (input.amountMinor / 100).toFixed(2),
            memo: `Beverly vend ${input.commandId}`,
            customer_id: externalCustomerId,
        },
    };
}

/** Normalize only provider-confirmed Koios v1 payment evidence. */
export function parseSparkMeterPaymentResponse(statusCode: number, payload: unknown): VendOutcome {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { status: 'unknown' };
    }
    const envelope = payload as Record<string, unknown>;
    if (statusCode === 400 && Array.isArray(envelope.errors)) {
        const error = envelope.errors[0];
        if (error && typeof error === 'object' && !Array.isArray(error)) {
            const record = error as Record<string, unknown>;
            const title = String(record.title ?? '').trim();
            const details = String(record.details ?? '').trim();
            if (title) {
                return {
                    status: 'confirmed_failure',
                    reason: details ? `${title}: ${details}` : title,
                };
            }
        }
    }
    if (statusCode !== 201) return { status: 'unknown' };
    const data = envelope.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { status: 'unknown' };
    const payment = data as Record<string, unknown>;
    const providerReference = String(payment.external_id ?? '').trim();
    if (payment.status !== 'processed' || !providerReference) return { status: 'unknown' };
    return { status: 'confirmed_success', providerReference };
}
import type { VendOutcome } from '@beverly/oem-contracts';
