export interface WalletExportColumn<T = Record<string, unknown>> {
    key: string;
    header: string;
    value: (row: T) => unknown;
}

export interface WalletExportMeta {
    label: string;
    value: string;
}

export interface WalletPrintOptions<T = Record<string, unknown>> {
    title: string;
    subtitle?: string;
    rows: T[];
    columns: WalletExportColumn<T>[];
    meta?: WalletExportMeta[];
    theme?: 'light' | 'dark';
    logoUrl?: string;
}

export interface WalletPrintBranding {
    theme: 'light' | 'dark';
    logoUrl: string;
}

export declare function sanitizeSpreadsheetValue(value: unknown): string;
export declare function rowsToCsv<T>(rows: T[], columns: WalletExportColumn<T>[]): string;
export declare function exportTimestamp(date?: Date): string;
export declare function downloadBlob(blob: Blob, filename: string): void;
export declare function exportCsv<T>(filenameBase: string, rows: T[], columns: WalletExportColumn<T>[]): void;
export declare function resolveWalletPrintBranding(source?: Document | null): WalletPrintBranding;
export declare function buildPrintDocument<T>(options: WalletPrintOptions<T>): string;
export declare function printPdf<T>(options: WalletPrintOptions<T>): void;

