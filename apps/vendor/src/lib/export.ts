export type Column<T> = {
    key: string;
    header: string;
    value: (row: T) => unknown;
};

function csvEscape(value: unknown): string {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv<T>(rows: T[], columns: Column<T>[]): string {
    const header = columns.map((column) => csvEscape(column.header)).join(',');
    const body = rows.map((row) => columns.map((column) => csvEscape(column.value(row))).join(','));
    return [header, ...body].join('\r\n');
}

export function exportCsv<T>(filenameBase: string, rows: T[], columns: Column<T>[]): void {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rowsToCsv(rows, columns)], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filenameBase}-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
