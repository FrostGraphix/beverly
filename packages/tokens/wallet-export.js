const DANGEROUS_FORMULA = /^[\t\r ]*[=+\-@]/;

export function sanitizeSpreadsheetValue(value) {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return DANGEROUS_FORMULA.test(text) ? `'${text}` : text;
}

function csvEscape(value) {
    const text = sanitizeSpreadsheetValue(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows, columns) {
    const header = columns.map((column) => csvEscape(column.header)).join(',');
    const body = rows.map((row) => columns.map((column) => csvEscape(column.value(row))).join(','));
    return [header, ...body].join('\r\n');
}

export function exportTimestamp(date = new Date()) {
    return date.toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

export function downloadBlob(blob, filename) {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
        throw new Error('Downloads require a browser.');
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv(filenameBase, rows, columns) {
    if (!rows.length) throw new Error('No records available.');
    const csv = rowsToCsv(rows, columns);
    downloadBlob(
        new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }),
        `${filenameBase}-${exportTimestamp()}.csv`,
    );
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function buildPrintDocument({ title, subtitle = '', rows, columns, meta = [] }) {
    const metaMarkup = meta.map((item) => (
        `<div class="meta"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`
    )).join('');
    const tableRows = rows.map((row) => (
        `<tr>${columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join('')}</tr>`
    )).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
      <style>
        *{box-sizing:border-box}body{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a;margin:36px}
        header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #16a34a;padding-bottom:16px;margin-bottom:24px}
        h1{font-size:22px;margin:0}.sub,.stamp{color:#64748b;font-size:12px}.stamp{text-align:right}.metas{display:flex;flex-wrap:wrap;gap:20px;margin-bottom:22px}
        .meta{display:grid;gap:2px}.meta span{color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.05em}.meta strong{font-size:14px}
        table{width:100%;border-collapse:collapse;font-size:11px}th{text-align:left;background:#f1f5f9;padding:8px;color:#475569}td{padding:7px 8px;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere}
        tr:nth-child(even) td{background:#f8fafc}footer{margin-top:24px;padding-top:10px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:10px;text-align:center}
        @page{size:landscape;margin:12mm}@media print{body{margin:0}thead{display:table-header-group}tr{break-inside:avoid}}
      </style></head><body><header><div><h1>${escapeHtml(title)}</h1>${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ''}</div><div class="stamp">Beverly<br>Generated ${escapeHtml(new Date().toLocaleString())}</div></header>
      ${metaMarkup ? `<div class="metas">${metaMarkup}</div>` : ''}<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table>
      <footer>Confidential Beverly wallet record.</footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),200));<\/script></body></html>`;
}

export function printPdf(options) {
    if (!options.rows.length) throw new Error('No records available.');
    const popup = window.open('', '_blank', 'width=1100,height=800');
    if (!popup) throw new Error('Allow popups to export PDF.');
    popup.opener = null;
    popup.document.open();
    popup.document.write(buildPrintDocument(options));
    popup.document.close();
}
