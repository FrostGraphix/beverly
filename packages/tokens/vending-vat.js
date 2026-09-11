export const VENDING_VAT_BASIS_POINTS = 750;

export function calculateVendingVatBreakdown(
    grossAmountMinor,
    vatRateBasisPoints = VENDING_VAT_BASIS_POINTS,
) {
    if (!Number.isInteger(grossAmountMinor) || grossAmountMinor <= 0) {
        throw new Error('grossAmountMinor must be a positive integer.');
    }
    if (!Number.isInteger(vatRateBasisPoints) || vatRateBasisPoints < 0 || vatRateBasisPoints > 10000) {
        throw new Error('vatRateBasisPoints must be between 0 and 10000.');
    }

    const energyAmountMinor = Math.round((grossAmountMinor * 10000) / (10000 + vatRateBasisPoints));
    const vatAmountMinor = grossAmountMinor - energyAmountMinor;
    return {
        grossAmountMinor,
        energyAmountMinor,
        vatAmountMinor,
        vatRateBasisPoints,
    };
}
