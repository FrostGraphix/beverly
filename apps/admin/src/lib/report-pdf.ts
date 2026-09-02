export type ReportFamily = 'financial' | 'transactions' | 'vendors-wallets' | 'audit' | 'disputes' | 'general';

export type ReportPdfInput = {
    family: ReportFamily;
    title: string;
    period: string;
    generatedBy: string;
    kpis: { label: string; value: string; note: string }[];
    series: { date: string; revenueMinor: number; energyRevenueMinor: number; vatMinor: number; purchaseCount: number; fundingMinor: number; refundMinor: number; newCustomers: number; newVendors: number; auditLogsCount?: number; securityEventsCount?: number }[];
    statusRows: { key: string; count: number; pct: number }[];
    actorRows: { key: string; minor: number; pct: number }[];
    stations: { station_id: string; count: number; revenueMinor: number }[];
    groupBy: 'site' | 'vendor' | 'customer';
    entityBreakdowns: {
        siteId: string; entityId: string; entityName: string; purchaseCount: number;
        deliveredCount: number; revenueMinor: number; successRate: number;
    }[];
    insights: string[];
    money: (minor: number) => string;
    auditBreakdown?: { action: string; count: number; pct: number }[];
    securityBreakdown?: { severity: string; count: number; pct: number }[];
    fundingRows?: { key: string; minor: number; pct: number }[];
    fundingStatusRows?: { key: string; count: number; pct: number }[];
    disputeRows?: { key: string; count: number; pct: number }[];
    refundRows?: { key: string; count: number; pct: number }[];
    settlementRows?: { key: string; count: number; pct: number }[];
    sources?: Record<string, number>;
};

const C = {
    ink: [20, 31, 38], muted: [94, 112, 122], green: [34, 197, 94], leaf: [74, 222, 128], mist: [240, 245, 242], line: [210, 222, 215], white: [255, 255, 255], danger: [220, 63, 63],
    panel: [9, 20, 26], paper: [248, 251, 249], blue: [34, 197, 94], cyan: [45, 180, 106], orange: [132, 204, 22], amber: [234, 179, 8], purple: [22, 163, 74],
};

type PdfJpeg = { bytes: Uint8Array; width: number; height: number };

function encode(value: string): Uint8Array { return new TextEncoder().encode(value); }
function concatBytes(parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
}

async function loadBrandLogo(): Promise<PdfJpeg | null> {
    try {
        const response = await fetch('/brand/beverly-lockup-light.png');
        if (!response.ok) return null;
        const bitmap = await createImageBitmap(await response.blob());
        const maxWidth = 720;
        const scale = Math.min(1, maxWidth / bitmap.width);
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return null;
        context.fillStyle = '#09141a';
        context.fillRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        const binary = atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        return { bytes, width, height };
    } catch {
        return null;
    }
}

function esc(value: unknown): string { return String(value ?? '').replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7E]/g, ' '); }
function dateStamp(): string { return new Date().toISOString().slice(0, 10); }
function number(value: number): string { return Number(value || 0).toLocaleString('en-NG'); }
function short(value: string, max = 28): string { return value.length > max ? `${value.slice(0, max - 3)}...` : value; }

class Pdf {
    private pages: string[][] = [];
    private page: string[] = [];
    private y = 0;
    constructor(private readonly logo: PdfJpeg | null = null) { this.newPage(); }
    private rgb(c: number[]) { return `${c.map((x) => (x / 255).toFixed(3)).join(' ')} rg`; }
    private stroke(c: number[]) { return `${c.map((x) => (x / 255).toFixed(3)).join(' ')} RG`; }
    newPage() { if (this.page.length) this.pages.push(this.page); this.page = []; this.y = 802; }
    text(x: number, y: number, value: string, size = 10, color = C.ink, bold = false) {
        this.page.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${this.rgb(color)} 1 0 0 1 ${x} ${y} Tm (${esc(value)}) Tj ET`);
    }
    rect(x: number, y: number, w: number, h: number, color: number[], stroke?: number[]) {
        this.page.push(`${this.rgb(color)} ${stroke ? this.stroke(stroke) : ''} ${x} ${y} ${w} ${h} re ${stroke ? 'B' : 'f'}`);
    }
    line(x1: number, y1: number, x2: number, y2: number, color = C.line, width = 1) {
        this.page.push(`${this.stroke(color)} ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
    }
    polyline(points: [number, number][], color = C.green, width = 2) {
        if (!points.length) return;
        this.page.push(`${this.stroke(color)} ${width} w ${points.map(([x, y], i) => `${i ? `${x} ${y} l` : `${x} ${y} m`}`).join(' ')} S`);
    }
    polygon(points: [number, number][], color: number[]) {
        if (!points.length) return;
        this.page.push(`${this.rgb(color)} ${points.map(([x, y], i) => `${i ? `${x} ${y} l` : `${x} ${y} m`}`).join(' ')} h f`);
    }
    brandLogo(x: number, y: number, maxWidth: number, maxHeight: number) {
        if (!this.logo) return false;
        const scale = Math.min(maxWidth / this.logo.width, maxHeight / this.logo.height);
        const width = this.logo.width * scale;
        const height = this.logo.height * scale;
        this.page.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Logo Do Q`);
        return true;
    }
    heading(title: string, kicker: string) {
        this.rect(0, 770, 595, 72, C.panel);
        this.rect(0, 770, 10, 72, C.blue);
        this.rect(10, 770, 4, 72, C.orange);
        this.text(32, 812, kicker.toUpperCase(), 8, C.cyan, true);
        this.text(32, 787, title, 20, C.white, true);
        if (!this.brandLogo(446, 785, 112, 34)) this.text(456, 787, 'BEVERLY', 9, C.white, true);
        this.y = 742;
    }
    finish(filename: string) {
        this.pages.push(this.page);
        const totalPages = this.pages.length;
        for (let i = 1; i < totalPages; i++) {
            const p = this.pages[i];
            p.push(
                `${this.stroke(C.line)} 1 w 32 30 m 563 30 l S`,
                `BT /F1 7 Tf ${this.rgb(C.muted)} 1 0 0 1 32 17 Tm (CONFIDENTIAL  |  Beverly Analytics Report) Tj ET`,
                `BT /F1 7 Tf ${this.rgb(C.muted)} 1 0 0 1 510 17 Tm (${i} / ${totalPages - 1}) Tj ET`
            );
        }
        const imageId = this.logo ? 5 : null;
        const firstPageId = this.logo ? 6 : 5;
        const objects: Uint8Array[] = [
            encode('<< /Type /Catalog /Pages 2 0 R >>'),
            encode(`<< /Type /Pages /Count ${this.pages.length} /Kids [${this.pages.map((_, i) => `${firstPageId + i * 2} 0 R`).join(' ')}] >>`),
            encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
            encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'),
        ];
        if (this.logo) {
            objects.push(concatBytes([
                encode(`<< /Type /XObject /Subtype /Image /Width ${this.logo.width} /Height ${this.logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${this.logo.bytes.length} >>\nstream\n`),
                this.logo.bytes,
                encode('\nendstream'),
            ]));
        }
        this.pages.forEach((p, i) => {
            const pageId = firstPageId + i * 2;
            const contentId = pageId + 1;
            const xObject = imageId ? ` /XObject << /Logo ${imageId} 0 R >>` : '';
            const content = encode(`${p.join('\n')}\n`);
            objects.push(encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObject} >> /Contents ${contentId} 0 R >>`));
            objects.push(concatBytes([encode(`<< /Length ${content.length} >>\nstream\n`), content, encode('endstream')]));
        });
        const parts: Uint8Array[] = [encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
        const offsets = [0];
        let byteLength = parts[0].length;
        objects.forEach((object, index) => {
            offsets.push(byteLength);
            const wrapped = concatBytes([encode(`${index + 1} 0 obj\n`), object, encode('\nendobj\n')]);
            parts.push(wrapped);
            byteLength += wrapped.length;
        });
        const start = byteLength;
        parts.push(encode(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`));
        const url = URL.createObjectURL(new Blob(parts as BlobPart[], { type: 'application/pdf' }));
        const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
}

function chart(pdf: Pdf, series: ReportPdfInput['series'], field: keyof ReportPdfInput['series'][number], label: string) {
    const x = 42, y = 270, w = 511, h = 126;
    pdf.text(x, y + h + 18, label, 11, C.ink, true);
    pdf.rect(x, y, w, h, C.paper, C.line);
    [0.25, 0.5, 0.75].forEach((step) => pdf.line(x, y + h * step, x + w, y + h * step, C.line));
    const values = series.slice(-20).map((row) => Number(row[field]) || 0); const max = Math.max(1, ...values);
    values.forEach((v, i) => { const bw = Math.max(4, w / Math.max(values.length, 1) - 5); const bh = Math.max(2, (v / max) * (h - 24)); pdf.rect(x + 5 + i * (w / values.length), y + 12, bw, bh, i === values.length - 1 ? C.orange : C.blue); });
    pdf.text(x + w - 68, y + h - 14, `Max ${number(max)}`, 7, C.muted, true);
    pdf.text(x, y - 12, series.length ? `Latest period: ${series[series.length - 1].date}` : 'No series data', 8, C.muted);
}

function lineChart(pdf: Pdf, series: ReportPdfInput['series']) {
    const x = 42, y = 430, w = 511, h = 126; const points = series.slice(-16); const values = points.map((row) => Number(row.revenueMinor || 0)); const max = Math.max(1, ...values);
    pdf.text(x, y + h + 18, 'Revenue trend', 11, C.ink, true); pdf.rect(x, y, w, h, C.paper, C.line);
    [0.25, 0.5, 0.75].forEach((step) => pdf.line(x, y + h * step, x + w, y + h * step, C.line));
    const coords = values.map((value, index) => [x + 8 + index * ((w - 16) / Math.max(1, values.length - 1)), y + 12 + (value / max) * (h - 24)] as [number, number]);
    pdf.polyline(coords, C.blue, 2.5); coords.forEach(([px, py]) => pdf.rect(px - 2, py - 2, 4, 4, C.orange));
    pdf.text(x, y - 12, points.length ? `${points[0].date} to ${points[points.length - 1].date}` : 'No trend data', 8, C.muted);
}

function pieChart(pdf: Pdf, rows: ReportPdfInput['statusRows']) {
    const cx = 163, cy = 285, radius = 66; const palette = [C.blue, C.orange, C.green, C.purple, C.danger]; const values = rows.slice(0, 5); const total = Math.max(1, values.reduce((sum, row) => sum + row.count, 0)); let start = -Math.PI / 2;
    pdf.text(42, 370, 'Outcome mix', 11, C.ink, true);
    values.forEach((row, index) => { const angle = (row.count / total) * Math.PI * 2; const steps = Math.max(3, Math.ceil(angle / 0.12)); const points: [number, number][] = [[cx, cy]]; for (let i = 0; i <= steps; i++) { const a = start + angle * (i / steps); points.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]); } pdf.polygon(points, palette[index]); start += angle; });
    values.forEach((row, index) => { const y = 340 - index * 21; pdf.rect(275, y - 3, 8, 8, palette[index]); pdf.text(291, y - 1, `${row.key}: ${number(row.count)} (${row.pct}%)`, 8, C.ink); });
}

function meterRow(pdf: Pdf, y: number, label: string, value: string, pct: number, tone = C.blue) {
    pdf.text(42, y, label, 8, C.ink);
    pdf.rect(190, y - 4, 245, 8, C.mist);
    pdf.rect(190, y - 4, Math.max(2, 245 * Math.max(0, Math.min(100, pct)) / 100), 8, tone);
    pdf.text(448, y, value, 8, C.ink, true);
}

function overviewPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.heading(input.title, 'Analytics dashboard');
    pdf.text(32, 718, input.period, 10, C.muted);
    pdf.text(32, 698, `Compiled ${dateStamp()} by ${input.generatedBy}`, 8, C.muted);
    pdf.text(428, 718, 'Power BI + Tableau + Grafana inspired', 8, C.cyan, true);
    input.kpis.slice(0, 6).forEach((k, i) => {
        const col = i % 3; const row = Math.floor(i / 3); const x = 32 + col * 177; const y = 610 - row * 94;
        pdf.rect(x, y, 160, 74, C.white, C.line);
        pdf.rect(x, y + 70, 160, 4, [C.blue, C.orange, C.green, C.purple, C.cyan, C.amber][i]);
        pdf.text(x + 12, y + 54, k.label.toUpperCase(), 7, C.muted, true); pdf.text(x + 12, y + 33, k.value, 15, C.ink, true); pdf.text(x + 12, y + 16, k.note, 7, C.muted);
    });
    
    const trend: [keyof ReportPdfInput['series'][number], string] = input.family === 'audit' ? ['auditLogsCount', 'Audit activity by day']
        : input.family === 'transactions' ? ['purchaseCount', 'Transaction volume by day']
            : input.family === 'vendors-wallets' ? ['fundingMinor', 'Successful funding by day']
                : input.family === 'disputes' ? ['refundMinor', 'Approved refunds by day']
                    : ['revenueMinor', 'Delivered revenue by day'];
    chart(pdf, input.series, trend[0], trend[1]);
    pdf.text(32, 220, 'Dashboard note', 11, C.ink, true);
    pdf.text(32, 202, 'Figures reflect approved operational records.', 9, C.muted);
}

function coverPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.rect(0, 0, 595, 842, C.panel); pdf.rect(0, 0, 16, 842, C.blue); pdf.rect(16, 0, 6, 842, C.orange); pdf.rect(32, 118, 531, 1, C.cyan);
    pdf.rect(420, 614, 118, 82, C.blue); pdf.rect(452, 566, 86, 34, C.orange); pdf.rect(384, 532, 154, 20, C.green);
    if (!pdf.brandLogo(48, 730, 148, 46)) pdf.text(48, 748, 'BEVERLY', 10, C.cyan, true); pdf.text(48, 684, input.title, 34, C.white, true); pdf.text(48, 648, 'Operational BI report', 15, C.white);
    pdf.text(48, 568, input.period, 11, C.white); pdf.text(48, 540, `Generated ${dateStamp()}`, 9, C.leaf);
    pdf.text(48, 146, 'Prepared for internal decision-making.', 10, C.white); pdf.text(48, 130, `Source: ${input.generatedBy}`, 8, C.cyan);
}

function insightsPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.newPage(); pdf.heading(input.title, 'Observability board');
    if (input.family === 'audit') chart(pdf, input.series, 'securityEventsCount', 'Security events by day');
    else if (input.family === 'transactions' || input.family === 'general') {
        lineChart(pdf, input.series);
        pieChart(pdf, input.statusRows);
    } else if (input.family === 'vendors-wallets') chart(pdf, input.series, 'fundingMinor', 'Successful funding by day');
    else if (input.family === 'disputes') chart(pdf, input.series, 'refundMinor', 'Approved refunds by day');
    else chart(pdf, input.series, 'revenueMinor', 'Delivered revenue by day');
    pdf.text(32, 215, 'Decision notes', 12, C.ink, true);
    input.insights.slice(0, 4).forEach((insight, index) => { const y = 186 - index * 30; pdf.rect(32, y - 3, 8, 8, [C.blue, C.orange, C.green, C.purple][index]); pdf.text(52, y - 1, insight, 8, C.ink); });
    pdf.text(32, 58, 'Review exceptions before settlement approval.', 8, C.muted);
}

function tablePage(pdf: Pdf, input: ReportPdfInput) {
    pdf.newPage();
    if (input.family === 'audit') {
        pdf.heading(input.title, 'Audit heatmap');
        pdf.text(32, 716, 'Top audit activities', 12, C.ink, true);
        ['Action / Operation', 'Occurrences', 'Rate'].forEach((h, i) => pdf.text([42, 285, 438][i], 690, h.toUpperCase(), 8, C.muted, true));
        pdf.line(32, 680, 563, 680);
        const rows = (input.auditBreakdown || []).slice(0, 12);
        rows.forEach((row, i) => {
            const y = 658 - i * 29;
            if (i % 2 === 0) pdf.rect(32, y - 9, 531, 25, C.paper);
            pdf.text(42, y, row.action, 9);
            pdf.text(285, y, number(row.count), 9);
            pdf.text(438, y, `${row.pct}%`, 9, C.green, true);
        });

        const statsY = 285;
        pdf.text(32, statsY + 70, 'Security severities distribution', 12, C.ink, true);
        const list = (input.securityBreakdown || []).slice(0, 6);
        list.forEach((r, i) => {
            const y = statsY + 42 - i * 30;
            pdf.text(42, y, r.severity.toUpperCase(), 9, r.severity === 'critical' || r.severity === 'high' ? C.danger : C.ink);
            pdf.rect(195, y - 4, 235, 8, C.mist);
            pdf.rect(195, y - 4, Math.max(2, 235 * r.pct / 100), 8, r.severity === 'critical' || r.severity === 'high' ? C.danger : C.blue);
            pdf.text(448, y, `${number(r.count)} alerts`, 9, C.ink, true);
        });
    } else if (input.family === 'disputes') {
        pdf.heading(input.title, 'Case outcomes');
        pdf.text(32, 716, 'Disputes by status', 12, C.ink, true);
        (input.disputeRows || []).slice(0, 8).forEach((r, i) => meterRow(pdf, 682 - i * 34, r.key, `${number(r.count)} cases`, r.pct));
        pdf.text(32, 370, 'Refund requests by status', 12, C.ink, true);
        (input.refundRows || []).slice(0, 8).forEach((r, i) => meterRow(pdf, 336 - i * 34, r.key, `${number(r.count)} requests`, r.pct));
    } else {
        pdf.heading(input.title, 'Performance matrix');
        const rows = input.entityBreakdowns.slice(0, 12); const headerY = 690;
        const entityLabel = input.groupBy === 'vendor' ? 'Vendor' : input.groupBy === 'customer' ? 'Customer' : 'SiteID';
        pdf.text(32, 716, `${entityLabel} performance by SiteID`, 12, C.ink, true);
        ['SiteID', entityLabel, 'Purchases', 'Revenue'].forEach((h, i) => pdf.text([42, 150, 378, 465][i], headerY, h.toUpperCase(), 8, C.muted, true));
        pdf.line(32, 680, 563, 680);
        rows.forEach((row, i) => {
            const y = 658 - i * 29;
            if (i % 2 === 0) pdf.rect(32, y - 9, 531, 25, C.paper);
            pdf.text(42, y, short(row.siteId, 15), 8);
            pdf.text(150, y, short(row.entityName), 8);
            pdf.text(378, y, number(row.purchaseCount), 8);
            pdf.text(465, y, input.money(row.revenueMinor), 8, C.blue, true);
        });
        const statsY = 285;
        const section = input.family === 'vendors-wallets'
                ? { title: 'Funding by channel', rows: (input.fundingRows || []).map((r) => ({ label: r.key, value: input.money(r.minor), pct: r.pct })) }
                : input.family === 'financial'
                    ? { title: 'Settlement states', rows: (input.settlementRows || []).map((r) => ({ label: r.key, value: `${number(r.count)} batches`, pct: r.pct })) }
                    : { title: 'Revenue channels', rows: input.actorRows.map((r) => ({ label: r.key, value: input.money(r.minor), pct: r.pct })) };
        pdf.text(32, statsY + 70, section.title, 12, C.ink, true);
        section.rows.slice(0, 6).forEach((r, i) => meterRow(pdf, statsY + 42 - i * 30, r.label, r.value, r.pct));
    }
}

function dataPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.newPage(); pdf.heading(input.title, 'Daily table');
    pdf.text(32, 716, 'Daily operational series', 12, C.ink, true);
    if (input.family === 'audit') {
        const heads = ['Date', 'Audit logs', 'Security alerts']; const xs = [32, 175, 345];
        heads.forEach((h, i) => pdf.text(xs[i], 692, h.toUpperCase(), 7, C.muted, true)); pdf.line(32, 682, 563, 682);
        input.series.slice(-18).forEach((r, i) => {
            const y = 662 - i * 27;
            if (i % 2 === 0) pdf.rect(32, y - 9, 531, 23, C.mist);
            const total = Number(r.auditLogsCount || 0);
            const security = Number(r.securityEventsCount || 0);
            [r.date, number(total), number(security)].forEach((v, j) => {
                pdf.text(xs[j], y, String(v), 8, j === 2 && security > 0 ? C.danger : C.ink, j === 2 && security > 0);
            });
        });
    } else if (input.family === 'financial') {
        const heads = ['Date', 'Revenue', 'Energy', 'VAT', 'Funding', 'Refunds']; const xs = [32, 112, 210, 302, 380, 472];
        heads.forEach((h, i) => pdf.text(xs[i], 692, h.toUpperCase(), 7, C.muted, true)); pdf.line(32, 682, 563, 682);
        input.series.slice(-18).forEach((r, i) => { const y = 662 - i * 27; if (i % 2 === 0) pdf.rect(32, y - 9, 531, 23, C.mist); [r.date, input.money(r.revenueMinor), input.money(r.energyRevenueMinor), input.money(r.vatMinor), input.money(r.fundingMinor), input.money(r.refundMinor)].forEach((v, j) => pdf.text(xs[j], y, v, 8, j === 1 ? C.green : C.ink, j === 1)); });
    } else if (input.family === 'transactions') {
        const heads = ['Date', 'Transactions', 'Revenue']; const xs = [32, 220, 405];
        heads.forEach((h, i) => pdf.text(xs[i], 692, h.toUpperCase(), 7, C.muted, true)); pdf.line(32, 682, 563, 682);
        input.series.slice(-18).forEach((r, i) => { const y = 662 - i * 27; if (i % 2 === 0) pdf.rect(32, y - 9, 531, 23, C.mist); [r.date, number(r.purchaseCount), input.money(r.revenueMinor)].forEach((v, j) => pdf.text(xs[j], y, v, 8, j === 2 ? C.green : C.ink, j === 2)); });
    } else if (input.family === 'vendors-wallets') {
        const heads = ['Date', 'Funding', 'Revenue', 'New vendors']; const xs = [32, 175, 320, 470];
        heads.forEach((h, i) => pdf.text(xs[i], 692, h.toUpperCase(), 7, C.muted, true)); pdf.line(32, 682, 563, 682);
        input.series.slice(-18).forEach((r, i) => { const y = 662 - i * 27; if (i % 2 === 0) pdf.rect(32, y - 9, 531, 23, C.mist); [r.date, input.money(r.fundingMinor), input.money(r.revenueMinor), number(r.newVendors)].forEach((v, j) => pdf.text(xs[j], y, v, 8, j === 1 ? C.green : C.ink, j === 1)); });
    } else if (input.family === 'disputes') {
        const heads = ['Date', 'Approved refunds', 'Purchases']; const xs = [32, 200, 430];
        heads.forEach((h, i) => pdf.text(xs[i], 692, h.toUpperCase(), 7, C.muted, true)); pdf.line(32, 682, 563, 682);
        input.series.slice(-18).forEach((r, i) => { const y = 662 - i * 27; if (i % 2 === 0) pdf.rect(32, y - 9, 531, 23, C.mist); [r.date, input.money(r.refundMinor), number(r.purchaseCount)].forEach((v, j) => pdf.text(xs[j], y, v, 8, j === 1 ? C.danger : C.ink, j === 1)); });
    } else {
        const heads = ['Date', 'Revenue', 'Purchases', 'Funding', 'Refunds', 'New customers']; const xs = [32, 112, 215, 292, 385, 475];
        heads.forEach((h, i) => pdf.text(xs[i], 692, h.toUpperCase(), 7, C.muted, true)); pdf.line(32, 682, 563, 682);
        input.series.slice(-18).forEach((r, i) => { const y = 662 - i * 27; if (i % 2 === 0) pdf.rect(32, y - 9, 531, 23, C.mist); [r.date, input.money(r.revenueMinor), number(r.purchaseCount), input.money(r.fundingMinor), input.money(r.refundMinor), number(r.newCustomers)].forEach((v, j) => pdf.text(xs[j], y, v, 8, j === 1 ? C.green : C.ink, j === 1)); });
    }
}

function sourcesPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.newPage(); pdf.heading(input.title, 'Data provenance');
    pdf.text(32, 716, 'Tables read for this report', 12, C.ink, true);
    const rows = Object.entries(input.sources || {}).sort((a, b) => a[0].localeCompare(b[0]));
    rows.slice(0, 18).forEach(([key, count], i) => {
        const y = 682 - i * 28;
        if (i % 2 === 0) pdf.rect(32, y - 9, 531, 23, C.mist);
        pdf.text(42, y, key, 9, C.ink);
        pdf.text(448, y, `${number(Number(count))} rows`, 9, C.green, true);
    });
    pdf.text(32, 82, 'No estimated fields are used in this PDF.', 9, C.muted);
}

export async function downloadReportPdf(input: ReportPdfInput) {
    const pdf = new Pdf(await loadBrandLogo()); coverPage(pdf, input); pdf.newPage(); overviewPage(pdf, input); insightsPage(pdf, input); tablePage(pdf, input); dataPage(pdf, input); sourcesPage(pdf, input);
    pdf.finish(`beverly-${input.family}-report-${dateStamp()}.pdf`);
}
