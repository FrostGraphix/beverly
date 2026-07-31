/**
 * CSV rendering helpers shared by the admin route groups.
 *
 * Kept in one place so every admin export quotes and escapes identically —
 * a field containing a comma, quote, or newline must never split a row.
 */

export function csvEscape(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

export function toCsv<T extends object>(rows: T[], columns: string[]): string {
    return [
        columns.map(csvEscape).join(','),
        ...rows.map((row) => columns.map((column) => csvEscape((row as Record<string, unknown>)[column])).join(',')),
    ].join('\n');
}
