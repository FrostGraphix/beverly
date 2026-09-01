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

export declare function publishNotificationCount(count: number): void;
export declare function onNotificationCountChange(callback: (count: number) => void): () => void;

export declare function setTheme(name: 'dark' | 'light' | string): void;
export declare function initTheme(defaultName?: string): void;
export declare function toggleTheme(): void;

export declare const DEFAULT_PAGE_SIZE: number;
export declare function pageCount(total: number, pageSize?: number): number;
export declare function clampPage(page: number, total: number, pageSize?: number): number;
export declare function paginate<T>(rows: T[], page: number, pageSize?: number): T[];
export declare function pageRange(page: number, total: number, pageSize?: number): { first: number; last: number };

export * from './wallet-export';

export declare function isInstallDismissed(): boolean;
export declare function dismissInstallPrompt(days?: number): void;
export declare function clearInstallDismissal(): void;
export declare function isStandalone(): boolean;
export declare function isIos(): boolean;
export declare function isIosInstallable(): boolean;

export declare function getDeferredInstallPrompt(): any | null;
export declare function onInstallPromptChange(callback: (event: any | null) => void): () => void;
export declare function triggerInstallPrompt(): Promise<{ outcome: 'accepted' | 'dismissed'; platform: string } | null>;

export type BeverlyLocale = 'en' | 'yo' | 'ha' | 'ig';
export interface BeverlyLocaleOption { code: BeverlyLocale; label: string; nativeLabel: string; intl: string }
export interface BeverlyLanguageOption extends BeverlyLocaleOption { localizedLabel: string; displayLabel: string }
export declare const LOCALE_STORAGE_KEY: string;
export declare const SUPPORTED_LOCALES: readonly BeverlyLocaleOption[];
export declare function resolveLocale(input?: string): BeverlyLocale;
export declare function getLocale(): BeverlyLocale;
export declare function getIntlLocale(locale?: string): string;
export declare function getLanguageOptions(locale?: string): BeverlyLanguageOption[];
export declare function getMissingTranslationKeys(locale: string): string[];
export declare function translate(key: string, params?: Record<string, unknown>, locale?: string): string;
export declare function setLocale(locale: string, options?: { persist?: boolean }): BeverlyLocale;
export declare function initLocale(): BeverlyLocale;
export declare function useI18n(): {
    locale: Readonly<{ value: BeverlyLocale }>;
    locales: readonly BeverlyLocaleOption[];
    getLanguageOptions: typeof getLanguageOptions;
    t: (key: string, params?: Record<string, unknown>) => string;
    setLocale: typeof setLocale;
    getIntlLocale: typeof getIntlLocale;
};
export declare function formatLocalizedNumber(value: number, options?: Intl.NumberFormatOptions): string;
export declare function formatLocalizedCurrency(amount: number, currency?: string): string;
