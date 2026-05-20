/**
 * Client-side export helpers — CSV + printable PDF.
 *
 * CSV is built in-browser from already-loaded rows (admin tables are capped at
 * a few hundred rows server-side). For server-streamed CSV (audit, reports) use
 * downloadAuthedCsv, which attaches the staff bearer token.
 */
import { API_BASE } from './api';

export type Column<T> = {
    key: string;
    header: string;
    value: (row: T) => unknown;
};

function csvEscape(value: unknown): string {
    if (value === null || value === undefined) return '';
    const s = typeof value === 'string' ? value : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv<T>(rows: T[], columns: Column<T>[]): string {
    const head = columns.map((c) => csvEscape(c.header)).join(',');
    const body = rows.map((row) => columns.map((c) => csvEscape(c.value(row))).join(','));
    return [head, ...body].join('\r\n');
}

function timestamp(): string {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv<T>(filenameBase: string, rows: T[], columns: Column<T>[]): void {
    const csv = rowsToCsv(rows, columns);
    triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), `${filenameBase}-${timestamp()}.csv`);
}

/** Fetch a server CSV endpoint with the staff token and save it. */
export async function downloadAuthedCsv(path: string, filenameBase: string): Promise<void> {
    const token = localStorage.getItem('beverly.staff.access_token');
    const res = await fetch(`${API_BASE}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    triggerDownload(blob, `${filenameBase}-${timestamp()}.csv`);
}

export type PdfTable = {
    title: string;
    columns: string[];
    rows: (string | number)[][];
};

export type PdfDoc = {
    title: string;
    subtitle?: string;
    meta?: { label: string; value: string }[];
    sections?: { heading: string; html: string }[];
    tables?: PdfTable[];
};

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Open a print-ready window styled as a Beverly report. The browser's
 * "Save as PDF" target produces the PDF — no third-party dependency.
 */
export function printPdf(doc: PdfDoc): void {
    const win = window.open('', '_blank', 'noopener,width=900,height=1000');
    if (!win) return;

    const metaHtml = (doc.meta ?? [])
        .map((m) => `<div class="meta"><span>${escapeHtml(m.label)}</span><strong>${escapeHtml(m.value)}</strong></div>`)
        .join('');

    const tablesHtml = (doc.tables ?? []).map((t) => `
      <section>
        <h2>${escapeHtml(t.title)}</h2>
        <table>
          <thead><tr>${t.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
          <tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </section>`).join('');

    const sectionsHtml = (doc.sections ?? [])
        .map((s) => `<section><h2>${escapeHtml(s.heading)}</h2>${s.html}</section>`)
        .join('');

    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 36px; }
        header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #16a34a; padding-bottom: 16px; margin-bottom: 24px; }
        .brand { display: flex; align-items: center; gap: 12px; }
        .mark { width: 40px; height: 40px; border-radius: 10px; background: #16a34a; color: #fff; font-weight: 800; display: grid; place-items: center; font-size: 20px; }
        h1 { font-size: 22px; margin: 0; letter-spacing: -.02em; }
        .sub { color: #64748b; font-size: 13px; margin-top: 2px; }
        .stamp { text-align: right; color: #64748b; font-size: 12px; }
        .metas { display: flex; flex-wrap: wrap; gap: 18px; margin-bottom: 22px; }
        .meta { display: flex; flex-direction: column; gap: 2px; }
        .meta span { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
        .meta strong { font-size: 15px; }
        section { margin-bottom: 26px; page-break-inside: avoid; }
        h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; background: #f1f5f9; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #475569; }
        td { padding: 7px 10px; border-bottom: 1px solid #eef2f6; }
        tr:nth-child(even) td { background: #fafcfd; }
        footer { margin-top: 30px; color: #94a3b8; font-size: 11px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
        @media print { body { margin: 14mm; } }
      </style></head><body>
      <header>
        <div class="brand">
          <div class="mark">B</div>
          <div><h1>${escapeHtml(doc.title)}</h1>${doc.subtitle ? `<div class="sub">${escapeHtml(doc.subtitle)}</div>` : ''}</div>
        </div>
        <div class="stamp">Beverly Wallet Admin<br>Generated ${escapeHtml(new Date().toLocaleString())}</div>
      </header>
      ${metaHtml ? `<div class="metas">${metaHtml}</div>` : ''}
      ${sectionsHtml}
      ${tablesHtml}
      <footer>Confidential — Beverly Wallet operations. For internal use only.</footer>
      <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };<\/script>
      </body></html>`);
    win.document.close();
}
