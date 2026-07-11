export type ReportFamily = 'financial' | 'transactions' | 'vendors-wallets' | 'audit' | 'disputes' | 'general';

export type ReportPdfInput = {
    family: ReportFamily;
    title: string;
    period: string;
    generatedBy: string;
    kpis: { label: string; value: string; note: string }[];
    series: { date: string; revenueMinor: number; purchaseCount: number; fundingMinor: number; refundMinor: number; newCustomers: number; auditLogsCount?: number; securityEventsCount?: number }[];
    statusRows: { key: string; count: number; pct: number }[];
    actorRows: { key: string; minor: number; pct: number }[];
    stations: { station_id: string; count: number; revenueMinor: number }[];
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
    ink: [18, 24, 38], muted: [91, 105, 135], green: [20, 132, 88], leaf: [112, 171, 107], mist: [238, 243, 249], line: [207, 216, 230], white: [255, 255, 255], danger: [199, 57, 57],
    panel: [15, 23, 42], paper: [248, 250, 252], blue: [37, 99, 235], cyan: [8, 145, 178], orange: [234, 88, 12], amber: [217, 119, 6], purple: [124, 58, 237],
};

function esc(value: unknown): string { return String(value ?? '').replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7E]/g, ' '); }
function dateStamp(): string { return new Date().toISOString().slice(0, 10); }
function number(value: number): string { return Number(value || 0).toLocaleString('en-NG'); }

class Pdf {
    private pages: string[][] = [];
    private page: string[] = [];
    private y = 0;
    constructor() { this.newPage(); }
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
    heading(title: string, kicker: string) {
        this.rect(0, 770, 595, 72, C.panel);
        this.rect(0, 770, 10, 72, C.blue);
        this.rect(10, 770, 4, 72, C.orange);
        this.text(32, 812, kicker.toUpperCase(), 8, C.cyan, true);
        this.text(32, 787, title, 20, C.white, true);
        this.text(456, 787, 'BEVERLY BI', 9, C.white, true);
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
        const body = this.pages.map((p, i) => `${p.join('\n')}\n`).join('');
        const objects: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Count ${this.pages.length} /Kids [${this.pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
        this.pages.forEach((p, i) => {
            const contentId = 6 + i * 2;
            objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
            objects.push(`<< /Length ${p.join('\n').length + 1} >>\nstream\n${p.join('\n')}\nendstream`);
        });
        let pdf = '%PDF-1.4\n'; const offsets = [0];
        objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
        const start = pdf.length;
        pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
        const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
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
    
    if (input.family === 'audit') {
        chart(pdf, input.series, 'auditLogsCount', 'Audit activity by day');
    } else {
        chart(pdf, input.series, input.family === 'transactions' ? 'purchaseCount' : 'revenueMinor', input.family === 'transactions' ? 'Transaction volume by day' : 'Revenue performance by day');
    }
    pdf.text(32, 220, 'Dashboard note', 11, C.ink, true);
    pdf.text(32, 202, 'Figures reflect approved operational records.', 9, C.muted);
}

function coverPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.rect(0, 0, 595, 842, C.panel); pdf.rect(0, 0, 16, 842, C.blue); pdf.rect(16, 0, 6, 842, C.orange); pdf.rect(32, 118, 531, 1, C.cyan);
    pdf.rect(420, 614, 118, 82, C.blue); pdf.rect(452, 566, 86, 34, C.orange); pdf.rect(384, 532, 154, 20, C.green);
    pdf.text(48, 748, 'BEVERLY ANALYTICS', 10, C.cyan, true); pdf.text(48, 684, input.title, 34, C.white, true); pdf.text(48, 648, 'Operational BI report', 15, C.white);
    pdf.text(48, 568, input.period, 11, C.white); pdf.text(48, 540, `Generated ${dateStamp()}`, 9, C.leaf);
    pdf.text(48, 146, 'Prepared for internal decision-making.', 10, C.white); pdf.text(48, 130, `Source: ${input.generatedBy}`, 8, C.cyan);
}

function insightsPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.newPage(); pdf.heading(input.title, 'Observability board');
    if (input.family === 'audit') {
        chart(pdf, input.series, 'securityEventsCount', 'Security alerts activity');
    } else {
        lineChart(pdf, input.series);
    }
    pieChart(pdf, input.statusRows);
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
    } else {
        pdf.heading(input.title, 'Performance matrix');
        const rows = input.stations.slice(0, 12); const headerY = 690;
        pdf.text(32, 716, 'Top stations', 12, C.ink, true);
        ['Station', 'Successful vends', 'Revenue'].forEach((h, i) => pdf.text([42, 285, 438][i], headerY, h.toUpperCase(), 8, C.muted, true));
        pdf.line(32, 680, 563, 680);
        rows.forEach((row, i) => { const y = 658 - i * 29; if (i % 2 === 0) pdf.rect(32, y - 9, 531, 25, C.paper); pdf.text(42, y, row.station_id, 9); pdf.text(285, y, number(row.count), 9); pdf.text(438, y, input.money(row.revenueMinor), 9, C.blue, true); });
        const statsY = 285;
        const section = input.family === 'disputes'
            ? { title: 'Disputes by status', rows: (input.disputeRows || []).map((r) => ({ label: r.key, value: `${number(r.count)} cases`, pct: r.pct })) }
            : input.family === 'vendors-wallets'
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

export function downloadReportPdf(input: ReportPdfInput) {
    const pdf = new Pdf(); coverPage(pdf, input); pdf.newPage(); overviewPage(pdf, input); insightsPage(pdf, input); tablePage(pdf, input); dataPage(pdf, input); sourcesPage(pdf, input);
    pdf.finish(`beverly-${input.family}-report-${dateStamp()}.pdf`);
}
