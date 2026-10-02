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

export interface SparkMeterProductionCanaryInput {
    installationId: string;
    externalCustomerId: string;
    amountMinor: number;
}

export interface SparkMeterProductionCanaryPolicy {
    enabled: boolean;
    approvedInstallationId: string;
    approvedExternalCustomerId: string;
    maximumAmountMinor: number;
    remainingUses: number;
    writeContractAcknowledged: boolean;
}

export interface SparkMeterProductionCanaryPlan {
    attemptLimit: 1;
    automaticRetry: false;
    captureMode: 'confirmed_success_only';
    ambiguousOutcome: 'manual_review';
    releaseHoldOnAmbiguous: false;
}

export interface SparkMeterCreditSafetyInput {
    creditMinor: number;
    planBalanceMinor: number;
    operatingMode: string;
    lastMeterState: string;
    lastReadingAt: string;
    now: string;
}

export interface SparkMeterCreditSafetyDecision {
    allowFinancialWrite: false;
    /** Provider credit, including debt; null means the supplied amount is malformed. */
    displayedBalanceMinor: number | null;
    /** Advisory zero-credit expectation, never confirmation of physical relay state. */
    expectedMeterState: 'unknown' | 'off';
    requiresManualReview: boolean;
    reason: 'advisory_only' | 'invalid_telemetry' | 'telemetry_stale' | 'zero_credit_meter_on' | 'provider_balance_negative' | 'unsafe_meter_mode';
}

// Portal display heuristic only; this is not a documented offline cutoff guarantee.
const SPARKMETER_TELEMETRY_FRESHNESS_MS = 30 * 60 * 1_000;

/** Advisory observations only; telemetry never authorizes payments or proves physical cutoff. */
export function evaluateSparkMeterCreditSafety(
    input: SparkMeterCreditSafetyInput,
): SparkMeterCreditSafetyDecision {
    const displayedBalanceMinor = Number.isSafeInteger(input?.creditMinor) ? input.creditMinor : null;
    const meterState = typeof input?.lastMeterState === 'string' ? input.lastMeterState.trim().toLowerCase() : '';
    const explicitZone = /T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
    const readingTime = typeof input?.lastReadingAt === 'string' && explicitZone.test(input.lastReadingAt)
        ? Date.parse(input.lastReadingAt) : Number.NaN;
    const currentTime = typeof input?.now === 'string' && explicitZone.test(input.now)
        ? Date.parse(input.now) : Number.NaN;
    const telemetryAge = currentTime - readingTime;
    if (displayedBalanceMinor === null || !Number.isSafeInteger(input?.planBalanceMinor)
        || typeof input?.operatingMode !== 'string' || !['on', 'off'].includes(meterState)
        || !Number.isFinite(telemetryAge) || telemetryAge < 0) {
        return {
            displayedBalanceMinor,
            expectedMeterState: 'unknown',
            allowFinancialWrite: false,
            requiresManualReview: true,
            reason: 'invalid_telemetry',
        };
    }
    const hasCredit = input.creditMinor > 0 || input.planBalanceMinor > 0;
    const expectedMeterState = hasCredit ? 'unknown' : 'off';
    const base = { displayedBalanceMinor, expectedMeterState } as const;

    if (input.creditMinor < 0 || input.planBalanceMinor < 0) {
        return {
            ...base,
            allowFinancialWrite: false,
            requiresManualReview: true,
            reason: 'provider_balance_negative',
        };
    }
    if (input.operatingMode.trim().toLowerCase() !== 'auto') {
        return {
            ...base,
            allowFinancialWrite: false,
            requiresManualReview: true,
            reason: 'unsafe_meter_mode',
        };
    }
    if (!hasCredit && input.lastMeterState.trim().toLowerCase() === 'on') {
        return {
            ...base,
            allowFinancialWrite: false,
            requiresManualReview: true,
            reason: 'zero_credit_meter_on',
        };
    }

    if (telemetryAge > SPARKMETER_TELEMETRY_FRESHNESS_MS) {
        return {
            ...base,
            allowFinancialWrite: false,
            requiresManualReview: false,
            reason: 'telemetry_stale',
        };
    }
    return {
        ...base,
        allowFinancialWrite: false,
        requiresManualReview: false,
        reason: 'advisory_only',
    };
}

/** Build a fail-closed plan for one explicitly allowlisted production canary. */
export function buildSparkMeterProductionCanaryPlan(
    input: SparkMeterProductionCanaryInput,
    policy: SparkMeterProductionCanaryPolicy,
): SparkMeterProductionCanaryPlan {
    if (!policy.enabled) throw new Error('SparkMeter production canary is disabled');
    if (!policy.writeContractAcknowledged) {
        throw new Error('SparkMeter write contract acknowledgement is required');
    }
    if (policy.remainingUses !== 1) {
        throw new Error('SparkMeter production canary requires exactly one remaining use');
    }
    if (input.installationId !== policy.approvedInstallationId) {
        throw new Error('SparkMeter production canary installation is not approved');
    }
    if (input.externalCustomerId !== policy.approvedExternalCustomerId) {
        throw new Error('SparkMeter production canary customer is not approved');
    }
    if (!Number.isSafeInteger(policy.maximumAmountMinor) || policy.maximumAmountMinor <= 0) {
        throw new Error('SparkMeter production canary maximum is invalid');
    }
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor > policy.maximumAmountMinor) {
        throw new Error('SparkMeter production canary amount exceeds approval');
    }
    return {
        attemptLimit: 1,
        automaticRetry: false,
        captureMode: 'confirmed_success_only',
        ambiguousOutcome: 'manual_review',
        releaseHoldOnAmbiguous: false,
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
