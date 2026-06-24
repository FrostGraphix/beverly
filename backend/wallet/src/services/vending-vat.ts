export const VENDING_VAT_BASIS_POINTS = 750;

export interface VendingVatBreakdown {
    grossAmountMinor: number;
    energyAmountMinor: number;
    vatAmountMinor: number;
    vatRateBasisPoints: number;
}

export function calculateVendingVatBreakdown(
    grossAmountMinor: number,
    vatRateBasisPoints = VENDING_VAT_BASIS_POINTS,
): VendingVatBreakdown {
    if (!Number.isInteger(grossAmountMinor) || grossAmountMinor <= 0) {
        throw new Error('grossAmountMinor must be a positive integer.');
    }
    if (!Number.isInteger(vatRateBasisPoints) || vatRateBasisPoints < 0 || vatRateBasisPoints > 10000) {
        throw new Error('vatRateBasisPoints must be between 0 and 10000.');
    }

    const divisor = 10000 + vatRateBasisPoints;
    const energyAmountMinor = Math.round((grossAmountMinor * 10000) / divisor);
    const vatAmountMinor = grossAmountMinor - energyAmountMinor;

    return {
        grossAmountMinor,
        energyAmountMinor,
        vatAmountMinor,
        vatRateBasisPoints,
    };
}
