export declare const brand: {
    50: string;
    100: string;
    300: string;
    500: string;
    600: string;
    700: string;
    glow: string;
};

export declare const semantic: {
    accent: string;
    info: string;
    warn: string;
    danger: string;
    success: string;
};

export declare const motion: {
    easeOut: string;
    easeInOut: string;
    easeSpring: string;
    durFast: number;
    durBase: number;
    durSlow: number;
};

export declare const fontStacks: {
    sans: string;
    mono: string;
};

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

export type WalletGreetingPeriod = 'morning' | 'afternoon' | 'night';

export interface WalletGreeting {
    period: WalletGreetingPeriod;
    english: string;
    yoruba: string;
    hausa: string;
    igbo: string;
    pulse: string;
}

export declare function getWalletGreeting(date?: Date): WalletGreeting;

export declare function setTheme(name: 'dark' | 'light' | string): void;
export declare function initTheme(defaultName?: string): void;
export declare function toggleTheme(): void;
