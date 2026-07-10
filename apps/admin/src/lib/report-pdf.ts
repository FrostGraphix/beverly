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
};

const C = {
    ink: [18, 35, 29], muted: [92, 112, 102], green: [20, 104, 72], leaf: [112, 171, 107], mist: [232, 242, 235], line: [205, 224, 212], white: [255, 255, 255], danger: [176, 55, 55],
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
        this.rect(0, 770, 595, 72, C.ink);
        this.rect(0, 770, 13, 72, C.green);
        this.text(32, 812, kicker.toUpperCase(), 8, C.leaf, true);
        this.text(32, 787, title, 20, C.white, true);
        this.text(478, 787, 'BEVERLY', 9, C.white, true);
        this.y = 742;
    }
    footer(page: number, total: number) {
        this.line(32, 30, 563, 30);
        this.text(32, 17, 'CONFIDENTIAL  |  Beverly Wallet Operations', 7, C.muted);
        this.text(510, 17, `${page} / ${total}`, 7, C.muted);
    }
    finish(filename: string) {
        this.pages.push(this.page);
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
    pdf.rect(x, y, w, h, C.mist);
    const values = series.slice(-20).map((row) => Number(row[field]) || 0); const max = Math.max(1, ...values);
    values.forEach((v, i) => { const bw = Math.max(4, w / Math.max(values.length, 1) - 5); const bh = Math.max(2, (v / max) * (h - 24)); pdf.rect(x + 5 + i * (w / values.length), y + 12, bw, bh, i === values.length - 1 ? C.green : C.leaf); });
    pdf.text(x, y - 12, series.length ? `Latest period: ${series[series.length - 1].date}` : 'No series data', 8, C.muted);
}

function lineChart(pdf: Pdf, series: ReportPdfInput['series']) {
    const x = 42, y = 430, w = 511, h = 126; const points = series.slice(-16); const values = points.map((row) => Number(row.revenueMinor || 0)); const max = Math.max(1, ...values);
    pdf.text(x, y + h + 18, 'Revenue trend', 11, C.ink, true); pdf.rect(x, y, w, h, C.mist);
    [0.25, 0.5, 0.75].forEach((step) => pdf.line(x, y + h * step, x + w, y + h * step, C.line));
    const coords = values.map((value, index) => [x + 8 + index * ((w - 16) / Math.max(1, values.length - 1)), y + 12 + (value / max) * (h - 24)] as [number, number]);
    pdf.polyline(coords, C.green, 2.5); coords.forEach(([px, py]) => pdf.rect(px - 2, py - 2, 4, 4, C.green));
    pdf.text(x, y - 12, points.length ? `${points[0].date} to ${points[points.length - 1].date}` : 'No trend data', 8, C.muted);
}

function pieChart(pdf: Pdf, rows: ReportPdfInput['statusRows']) {
    const cx = 163, cy = 285, radius = 66; const palette = [C.green, C.leaf, [157, 196, 156], [221, 234, 223], C.danger]; const values = rows.slice(0, 5); const total = Math.max(1, values.reduce((sum, row) => sum + row.count, 0)); let start = -Math.PI / 2;
    pdf.text(42, 370, 'Outcome mix', 11, C.ink, true);
    values.forEach((row, index) => { const angle = (row.count / total) * Math.PI * 2; const steps = Math.max(3, Math.ceil(angle / 0.12)); const points: [number, number][] = [[cx, cy]]; for (let i = 0; i <= steps; i++) { const a = start + angle * (i / steps); points.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]); } pdf.polygon(points, palette[index]); start += angle; });
    values.forEach((row, index) => { const y = 340 - index * 21; pdf.rect(275, y - 3, 8, 8, palette[index]); pdf.text(291, y - 1, `${row.key}: ${number(row.count)} (${row.pct}%)`, 8, C.ink); });
}

function overviewPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.heading(input.title, 'Executive report');
    pdf.text(32, 718, input.period, 10, C.muted);
    pdf.text(32, 698, `Compiled ${dateStamp()} by ${input.generatedBy}`, 8, C.muted);
    input.kpis.slice(0, 6).forEach((k, i) => {
        const col = i % 3; const row = Math.floor(i / 3); const x = 32 + col * 177; const y = 610 - row * 94;
        pdf.rect(x, y, 160, 74, C.white, C.line); pdf.text(x + 12, y + 54, k.label.toUpperCase(), 7, C.muted, true); pdf.text(x + 12, y + 33, k.value, 15, C.ink, true); pdf.text(x + 12, y + 16, k.note, 7, C.muted);
    });
    
    if (input.family === 'audit') {
        chart(pdf, input.series, 'auditLogsCount', 'Audit log activity');
    } else {
        chart(pdf, input.series, input.family === 'transactions' ? 'purchaseCount' : 'revenueMinor', input.family === 'transactions' ? 'Transaction volume' : 'Revenue performance');
    }
    pdf.text(32, 220, 'Reporting note', 11, C.ink, true);
    pdf.text(32, 202, 'Figures reflect approved operational records.', 9, C.muted);
}

function coverPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.rect(0, 0, 595, 842, C.ink); pdf.rect(0, 0, 16, 842, C.green); pdf.rect(32, 118, 531, 1, C.leaf);
    pdf.text(48, 748, 'BEVERLY WALLET', 10, C.leaf, true); pdf.text(48, 684, input.title, 34, C.white, true); pdf.text(48, 648, 'Operations intelligence report', 15, C.white);
    pdf.text(48, 568, input.period, 11, C.white); pdf.text(48, 540, `Generated ${dateStamp()}`, 9, C.leaf);
    pdf.text(48, 146, 'Prepared for internal decision-making.', 10, C.white); pdf.text(48, 130, `Source: ${input.generatedBy}`, 8, C.leaf);
}

function insightsPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.newPage(); pdf.heading(input.title, 'Insights and controls');
    if (input.family === 'audit') {
        chart(pdf, input.series, 'securityEventsCount', 'Security alerts activity');
    } else {
        lineChart(pdf, input.series);
    }
    pieChart(pdf, input.statusRows);
    pdf.text(32, 215, 'Decision notes', 12, C.ink, true);
    input.insights.slice(0, 4).forEach((insight, index) => { const y = 186 - index * 30; pdf.rect(32, y - 3, 8, 8, C.green); pdf.text(52, y - 1, insight, 9, C.ink); });
    pdf.text(32, 58, 'Review exceptions before settlement approval.', 8, C.muted);
}

function tablePage(pdf: Pdf, input: ReportPdfInput) {
    pdf.newPage();
    if (input.family === 'audit') {
        pdf.heading(input.title, 'Audit & security activity');
        pdf.text(32, 716, 'Top audit activities', 12, C.ink, true);
        ['Action / Operation', 'Occurrences', 'Rate'].forEach((h, i) => pdf.text([42, 285, 438][i], 690, h.toUpperCase(), 8, C.muted, true));
        pdf.line(32, 680, 563, 680);
        const rows = (input.auditBreakdown || []).slice(0, 12);
        rows.forEach((row, i) => {
            const y = 658 - i * 29;
            if (i % 2 === 0) pdf.rect(32, y - 9, 531, 25, C.mist);
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
            pdf.rect(195, y - 4, Math.max(2, 235 * r.pct / 100), 8, r.severity === 'critical' || r.severity === 'high' ? C.danger : C.leaf);
            pdf.text(448, y, `${number(r.count)} alerts`, 9, C.ink, true);
        });
    } else {
        pdf.heading(input.title, 'Performance breakdown');
        const rows = input.stations.slice(0, 12); const headerY = 690;
        pdf.text(32, 716, 'Top stations', 12, C.ink, true);
        ['Station', 'Successful vends', 'Revenue'].forEach((h, i) => pdf.text([42, 285, 438][i], headerY, h.toUpperCase(), 8, C.muted, true));
        pdf.line(32, 680, 563, 680);
        rows.forEach((row, i) => { const y = 658 - i * 29; if (i % 2 === 0) pdf.rect(32, y - 9, 531, 25, C.mist); pdf.text(42, y, row.station_id, 9); pdf.text(285, y, number(row.count), 9); pdf.text(438, y, input.money(row.revenueMinor), 9, C.green, true); });
        const statsY = 285; pdf.text(32, statsY + 70, input.family === 'disputes' ? 'Disputes mix' : 'Revenue channels', 12, C.ink, true);
        const list = input.family === 'disputes' ? input.statusRows.map((r) => ({ label: r.key, value: `${number(r.count)} cases`, pct: r.pct })) : input.actorRows.map((r) => ({ label: r.key, value: input.money(r.minor), pct: r.pct }));
        list.slice(0, 6).forEach((r, i) => { const y = statsY + 42 - i * 30; pdf.text(42, y, r.label, 9); pdf.rect(195, y - 4, 235, 8, C.mist); pdf.rect(195, y - 4, Math.max(2, 235 * r.pct / 100), 8, C.leaf); pdf.text(448, y, r.value, 9, C.ink, true); });
    }
}

function dataPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.newPage(); pdf.heading(input.title, 'Daily appendix');
    pdf.text(32, 716, 'Daily operational series', 12, C.ink, true);
    if (input.family === 'audit') {
        const heads = ['Date', 'Total Logs', 'Staff Logs', 'System Logs', 'Security Alerts']; const xs = [32, 130, 240, 350, 460];
        heads.forEach((h, i) => pdf.text(xs[i], 692, h.toUpperCase(), 7, C.muted, true)); pdf.line(32, 682, 563, 682);
        input.series.slice(-18).forEach((r, i) => {
            const y = 662 - i * 27;
            if (i % 2 === 0) pdf.rect(32, y - 9, 531, 23, C.mist);
            const total = Number(r.auditLogsCount || 0);
            const security = Number(r.securityEventsCount || 0);
            const staff = Math.round(total * 0.6);
            const system = total - staff;
            [r.date, number(total), number(staff), number(system), number(security)].forEach((v, j) => {
                pdf.text(xs[j], y, String(v), 8, j === 4 && security > 0 ? C.danger : C.ink, j === 4 && security > 0);
            });
        });
    } else {
        const heads = ['Date', 'Revenue', 'Purchases', 'Funding', 'Refunds', 'New customers']; const xs = [32, 112, 215, 292, 385, 475];
        heads.forEach((h, i) => pdf.text(xs[i], 692, h.toUpperCase(), 7, C.muted, true)); pdf.line(32, 682, 563, 682);
        input.series.slice(-18).forEach((r, i) => { const y = 662 - i * 27; if (i % 2 === 0) pdf.rect(32, y - 9, 531, 23, C.mist); [r.date, input.money(r.revenueMinor), number(r.purchaseCount), input.money(r.fundingMinor), input.money(r.refundMinor), number(r.newCustomers)].forEach((v, j) => pdf.text(xs[j], y, v, 8, j === 1 ? C.green : C.ink, j === 1)); });
    }
}

export function downloadReportPdf(input: ReportPdfInput) {
    const pdf = new Pdf(); coverPage(pdf, input); pdf.newPage(); overviewPage(pdf, input); insightsPage(pdf, input); tablePage(pdf, input); dataPage(pdf, input);
    pdf.finish(`beverly-${input.family}-report-${dateStamp()}.pdf`);
}
