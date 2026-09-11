export declare const VENDING_VAT_BASIS_POINTS: number;

export interface VendingVatBreakdown {
    grossAmountMinor: number;
    energyAmountMinor: number;
    vatAmountMinor: number;
    vatRateBasisPoints: number;
}

export declare function calculateVendingVatBreakdown(
    grossAmountMinor: number,
    vatRateBasisPoints?: number,
): VendingVatBreakdown;
