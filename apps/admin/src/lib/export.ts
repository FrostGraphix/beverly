/**
 * Client-side export helpers — CSV + printable PDF.
 *
 * CSV is built in-browser from already-loaded rows (admin tables are capped at
 * a few hundred rows server-side). For server-streamed CSV (audit, reports) use
 * downloadAuthedCsv, which attaches the staff bearer token.
 */
import { API_BASE } from './api';
import { resolveWalletPrintBranding } from '@beverly/tokens/wallet-export';

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
    const { theme, logoUrl } = resolveWalletPrintBranding();
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

    win.document.write(`<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title>
      <style>
        :root { --paper:#fff; --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --head:#f1f5f9; --stripe:#fafcfd; --brand-name:#0f172a; }
        :root[data-theme="dark"] { --paper:#0b1118; --ink:#f8fafc; --muted:#94a3b8; --line:#263442; --head:#16212b; --stripe:#101923; --brand-name:#f8fafc; }
        * { box-sizing: border-box; }
        html, body { background: var(--paper); }
        body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: var(--ink); margin: 36px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #16a34a; padding-bottom: 16px; margin-bottom: 24px; }
        .brand { display: flex; align-items: center; gap: 12px; }
        .brand img { width: 42px; height: 42px; object-fit: contain; }
        .brand-name { color: var(--brand-name); font-size: 13px; font-weight: 800; letter-spacing: .02em; }
        h1 { font-size: 22px; margin: 0; letter-spacing: -.02em; }
        .sub { color: var(--muted); font-size: 13px; margin-top: 2px; }
        .stamp { text-align: right; color: var(--muted); font-size: 12px; }
        .metas { display: flex; flex-wrap: wrap; gap: 18px; margin-bottom: 22px; }
        .meta { display: flex; flex-direction: column; gap: 2px; }
        .meta span { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
        .meta strong { font-size: 15px; }
        section { margin-bottom: 26px; page-break-inside: avoid; }
        h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink); border-bottom: 1px solid var(--line); padding-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; background: var(--head); padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
        td { padding: 7px 10px; border-bottom: 1px solid var(--line); }
        tr:nth-child(even) td { background: var(--stripe); }
        footer { margin-top: 30px; color: var(--muted); font-size: 11px; text-align: center; border-top: 1px solid var(--line); padding-top: 12px; }
        @media print { body { margin: 14mm; } }
      </style></head><body>
      <header>
        <div class="brand">
          <img src="${escapeHtml(logoUrl)}" alt="Beverly" onerror="this.hidden=true">
          <div><div class="brand-name">Beverly</div><h1>${escapeHtml(doc.title)}</h1>${doc.subtitle ? `<div class="sub">${escapeHtml(doc.subtitle)}</div>` : ''}</div>
        </div>
        <div class="stamp">Beverly Wallet Admin<br>Generated ${escapeHtml(new Date().toLocaleString())}</div>
      </header>
      ${metaHtml ? `<div class="metas">${metaHtml}</div>` : ''}
      ${sectionsHtml}
      ${tablesHtml}
      <footer>Confidential — Beverly Wallet operations. For internal use only.</footer>
      <script>window.onload = async function(){ await Promise.all(Array.from(document.images).map(function(img){ return img.complete ? Promise.resolve() : new Promise(function(resolve){ img.addEventListener('load', resolve, { once:true }); img.addEventListener('error', resolve, { once:true }); }); })); setTimeout(function(){ window.print(); }, 100); };<\/script>
      </body></html>`);
    win.document.close();
}
