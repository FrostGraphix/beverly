/**
 * Shared identity for a vendor funding credit.
 *
 * A funding request can be credited by two independent routes: the Paystack
 * fulfillment path and staff approval. They must post under the *same*
 * idempotency key, otherwise the ledger's uniqueness guarantee does not span
 * both and a request can be credited twice.
 *
 * `legacyPaystackFundingCreditKey` is the key the gateway path used before the
 * two were unified. Rows credited under it still exist, so every writer checks
 * for it before posting.
 */

/** Canonical key for the single funding credit a request may ever receive. */
export function fundingCreditKey(fundingRequestId: string): string {
    return `funding.${fundingRequestId}.credit`;
}

/** Pre-unification key used only by the Paystack fulfillment path. */
export function legacyPaystackFundingCreditKey(fundingRequestId: string): string {
    return `funding.${fundingRequestId}.paystack.credit`;
}

/** Every idempotency key under which a funding credit may already exist. */
export function fundingCreditKeys(fundingRequestId: string): string[] {
    return [fundingCreditKey(fundingRequestId), legacyPaystackFundingCreditKey(fundingRequestId)];
}

/**
 * Terminal states a funding request can reach without being paid. Reaching the
 * credit path in one of these means the gateway confirmed money for a request
 * staff already closed — hold it for review rather than crediting.
 */
export const UNCREDITABLE_FUNDING_STATUSES = new Set(['rejected', 'cancelled', 'expired']);
