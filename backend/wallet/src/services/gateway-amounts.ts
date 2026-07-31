/**
 * Gateway amount reconciliation.
 *
 * Paystack accounts that put the transaction fee on the payer gross the charge
 * up, so the verified amount is legitimately *higher* than the amount we asked
 * for: a ₦500 funding request settles as ₦507.62. A strict equality check reads
 * that as tampering and blocks every single payment.
 *
 * The rule we want instead:
 *   • paid  <  requested            → underpaid, never credit.
 *   • paid === requested            → exact.
 *   • paid  >  requested, within the
 *     largest fee Paystack can add  → fee surplus, credit the requested amount.
 *   • paid  >  that                 → unexplained, hold for review.
 *
 * We always credit the *requested* amount. The surplus is Paystack's fee — it
 * never lands in our settlement account, so crediting it would invent money.
 */

/** Paystack NGN pricing, in minor units (kobo). */
export const PAYSTACK_FLAT_FEE_MINOR = 10_000;              // ₦100
export const PAYSTACK_FLAT_FEE_THRESHOLD_MINOR = 250_000;   // ₦2,500 — flat fee waived below this
export const PAYSTACK_FEE_CAP_MINOR = 200_000;              // ₦2,000 — fee is capped here
const PERCENT_HEADROOM_BASIS_POINTS = 200;                  // 2% covers the 1.5% band once grossed up
const ROUNDING_SLACK_MINOR = 200;                           // ₦2 for gross-up rounding

/**
 * Largest surplus over `expectedMinor` that a gateway fee could account for.
 * Bounded: never more than roughly ₦2,104 regardless of transaction size.
 */
export function maxGatewaySurplusMinor(expectedMinor: number): number {
    const percent = Math.min(
        Math.ceil((expectedMinor * PERCENT_HEADROOM_BASIS_POINTS) / 10_000),
        PAYSTACK_FEE_CAP_MINOR,
    );
    const flat = expectedMinor >= PAYSTACK_FLAT_FEE_THRESHOLD_MINOR
        ? PAYSTACK_FLAT_FEE_MINOR + ROUNDING_SLACK_MINOR
        : 0;
    return percent + flat + ROUNDING_SLACK_MINOR;
}

export type GatewayAmountKind = 'exact' | 'fee_surplus' | 'underpaid' | 'excess_surplus';

export interface GatewayAmountAssessment {
    kind: GatewayAmountKind;
    /** paid − expected. Negative when underpaid. */
    surplusMinor: number;
    /** The amount that may be credited. Always the requested amount. */
    creditableMinor: number;
    allowedSurplusMinor: number;
}

export function classifyGatewayAmount(input: {
    expectedMinor: number;
    paidMinor: number;
}): GatewayAmountAssessment {
    const expected = Number(input.expectedMinor);
    const paid = Number(input.paidMinor);
    const allowedSurplusMinor = maxGatewaySurplusMinor(expected);
    const surplusMinor = paid - expected;

    if (!Number.isFinite(expected) || !Number.isFinite(paid)) {
        return { kind: 'underpaid', surplusMinor: 0, creditableMinor: 0, allowedSurplusMinor };
    }
    const base = { surplusMinor, creditableMinor: expected, allowedSurplusMinor };
    if (surplusMinor === 0) return { kind: 'exact', ...base };
    if (surplusMinor < 0) return { kind: 'underpaid', ...base };
    if (surplusMinor <= allowedSurplusMinor) return { kind: 'fee_surplus', ...base };
    return { kind: 'excess_surplus', ...base };
}

/** True when the assessment permits crediting the wallet. */
export function isCreditable(assessment: GatewayAmountAssessment): boolean {
    return assessment.kind === 'exact' || assessment.kind === 'fee_surplus';
}

/** Block code to record when an assessment is not creditable. */
export function blockCodeFor(assessment: GatewayAmountAssessment): string {
    return assessment.kind === 'excess_surplus' ? 'payment_overpaid' : 'payment_amount_mismatch';
}
