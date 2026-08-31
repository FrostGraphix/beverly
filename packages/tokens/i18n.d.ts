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
