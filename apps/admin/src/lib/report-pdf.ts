export type ReportFamily = 'financial' | 'transactions' | 'vendors-wallets' | 'audit' | 'disputes' | 'general';

export type ReportPdfInput = {
    family: ReportFamily;
    title: string;
    period: string;
    generatedBy: string;
    kpis: { label: string; value: string; note: string }[];
    series: { date: string; revenueMinor: number; purchaseCount: number; fundingMinor: number; refundMinor: number; newCustomers: number }[];
    statusRows: { key: string; count: number; pct: number }[];
    actorRows: { key: string; minor: number; pct: number }[];
    stations: { station_id: string; count: number; revenueMinor: number }[];
    insights: string[];
    money: (minor: number) => string;
};

const C = {
    ink: [17, 24, 39], muted: [107, 114, 128], green: [5, 150, 105], leaf: [52, 211, 153], mist: [249, 250, 251], line: [229, 231, 235], white: [255, 255, 255], danger: [220, 38, 38],
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
        this.y = 740;
        this.text(48, 800, kicker.toUpperCase(), 8, C.green, true);
        this.text(48, 776, title, 22, C.ink, true);
        this.line(48, 755, 547, 755, C.line);
    }
    finish(filename: string) {
        this.pages.push(this.page);
        this.pages.forEach((pageArray, i) => {
            const pageNum = i + 1; const total = this.pages.length; const y = 40;
            pageArray.push(`${this.stroke(C.line)} 1 w 48 ${y} m 547 ${y} l S`);
            pageArray.push(`BT /F1 8 Tf ${this.rgb(C.muted)} 1 0 0 1 48 25 Tm (CONFIDENTIAL  -  Beverly Wallet Operations) Tj ET`);
            pageArray.push(`BT /F1 8 Tf ${this.rgb(C.muted)} 1 0 0 1 520 25 Tm (${pageNum} / ${total}) Tj ET`);
        });
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

function chart(pdf: Pdf, series: ReportPdfInput['series'], field: keyof ReportPdfInput['series'][number], label: string, yPos: number = 270) {
    const x = 48, y = yPos, w = 499, h = 140;
    pdf.text(x, y + h + 20, label, 12, C.ink, true);
    const values = series.slice(-20).map((row) => Number(row[field]) || 0); const max = Math.max(1, ...values);
    [0, 0.5, 1].forEach(step => pdf.line(x, y + h * step, x + w, y + h * step, C.mist, 1));
    values.forEach((v, i) => { const bw = (w / Math.max(values.length, 1)) - 8; const bh = Math.max(2, (v / max) * h); pdf.rect(x + 4 + i * (w / values.length), y, bw, bh, i === values.length - 1 ? C.green : C.leaf); });
    pdf.text(x, y - 16, series.length ? `Trend from ${series[0].date} to ${series[series.length - 1].date}` : 'No series data', 9, C.muted);
}

function lineChart(pdf: Pdf, series: ReportPdfInput['series']) {
    const x = 48, y = 460, w = 499, h = 140; const points = series.slice(-16); const values = points.map((row) => Number(row.revenueMinor || 0)); const max = Math.max(1, ...values);
    pdf.text(x, y + h + 20, 'Revenue Trend', 12, C.ink, true); 
    [0, 0.5, 1].forEach((step) => pdf.line(x, y + h * step, x + w, y + h * step, C.mist, 1));
    const coords = values.map((value, index) => [x + (index * (w / Math.max(1, values.length - 1))), y + (value / max) * h] as [number, number]);
    pdf.polyline(coords, C.green, 3); 
    coords.forEach(([px, py], i) => { pdf.rect(px - 3, py - 3, 6, 6, C.white); pdf.rect(px - 2, py - 2, 4, 4, i === values.length - 1 ? C.ink : C.green); });
    pdf.text(x, y - 16, points.length ? `${points[0].date} to ${points[points.length - 1].date}` : 'No trend data', 9, C.muted);
}

function pieChart(pdf: Pdf, rows: ReportPdfInput['statusRows']) {
    const cx = 160, cy = 250, radius = 70; const palette = [C.ink, C.green, C.leaf, C.muted, C.danger]; const values = rows.slice(0, 5); const total = Math.max(1, values.reduce((sum, row) => sum + row.count, 0)); let start = -Math.PI / 2;
    pdf.text(48, cy + radius + 30, 'Outcome Distribution', 12, C.ink, true);
    values.forEach((row, index) => { const angle = (row.count / total) * Math.PI * 2; const steps = Math.max(5, Math.ceil(angle / 0.05)); const points: [number, number][] = [[cx, cy]]; for (let i = 0; i <= steps; i++) { const a = start + angle * (i / steps); points.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]); } pdf.polygon(points, palette[index]); start += angle; });
    pdf.rect(cx - 45, cy - 45, 90, 90, C.white);
    values.forEach((row, index) => { const y = cy + 40 - index * 24; pdf.rect(300, y - 4, 10, 10, palette[index]); pdf.text(320, y - 1, row.key, 10, C.ink, true); pdf.text(320, y - 14, `${number(row.count)} (${row.pct}%)`, 9, C.muted); });
}

function overviewPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.heading(input.title, 'Executive Summary');
    input.kpis.slice(0, 6).forEach((k, i) => {
        const col = i % 3; const row = Math.floor(i / 3); const x = 48 + col * 170; const y = 620 - row * 100;
        pdf.rect(x, y, 150, 80, C.white, C.line); pdf.text(x + 16, y + 58, k.label.toUpperCase(), 7, C.muted, true); pdf.text(x + 16, y + 36, k.value, 16, C.ink, true); pdf.text(x + 16, y + 18, k.note, 8, C.green);
    });
    chart(pdf, input.series, input.family === 'transactions' ? 'purchaseCount' : 'revenueMinor', input.family === 'transactions' ? 'Transaction Volume' : 'Revenue Performance', 380);
    pdf.text(48, 200, 'Reporting Note', 11, C.ink, true);
    pdf.text(48, 182, 'Figures reflect approved operational records aggregated in real-time.', 9, C.muted);
}

function coverPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.rect(0, 0, 595, 842, C.white); pdf.rect(48, 780, 48, 4, C.green);
    pdf.text(48, 620, 'BEVERLY WALLET', 10, C.green, true); pdf.text(48, 580, input.title, 36, C.ink, true); pdf.text(48, 550, 'Operations Intelligence Report', 16, C.muted);
    pdf.rect(48, 480, 200, 1, C.line); pdf.text(48, 450, 'REPORTING PERIOD', 8, C.muted, true); pdf.text(48, 430, input.period, 12, C.ink);
    pdf.text(48, 390, 'COMPILED ON', 8, C.muted, true); pdf.text(48, 370, dateStamp(), 12, C.ink);
    pdf.line(48, 120, 547, 120, C.line); pdf.text(48, 90, 'Prepared for internal decision-making strictly.', 10, C.muted); pdf.text(48, 70, `Source: ${input.generatedBy}`, 10, C.muted);
}

function insightsPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.newPage(); pdf.heading(input.title, 'Insights and Controls'); lineChart(pdf, input.series); pieChart(pdf, input.statusRows);
    pdf.text(48, 130, 'Decision Notes', 12, C.ink, true);
    input.insights.slice(0, 3).forEach((insight, index) => { const y = 100 - index * 25; pdf.rect(48, y - 4, 4, 12, C.green); pdf.text(64, y, insight, 10, C.ink); });
}

function tablePage(pdf: Pdf, input: ReportPdfInput) {
    pdf.newPage(); pdf.heading(input.title, 'Performance Breakdown');
    const rows = input.stations.slice(0, 10); const headerY = 690;
    pdf.text(48, 720, 'Top Performing Stations', 12, C.ink, true);
    ['Station Identifier', 'Transactions', 'Gross Revenue'].forEach((h, i) => pdf.text([48, 280, 420][i], headerY, h.toUpperCase(), 8, C.muted, true));
    pdf.line(48, 680, 547, 680, C.mist, 2);
    rows.forEach((row, i) => { const y = 650 - i * 32; pdf.text(48, y, row.station_id, 10, C.ink); pdf.text(280, y, number(row.count), 10, C.ink); pdf.text(420, y, input.money(row.revenueMinor), 10, C.ink, true); pdf.line(48, y - 12, 547, y - 12, C.mist, 1); });
    const statsY = 260; pdf.text(48, statsY + 60, input.family === 'audit' ? 'Activity Distribution' : 'Revenue Channels', 12, C.ink, true);
    const list = input.family === 'audit' ? input.statusRows.map((r) => ({ label: r.key, value: `${number(r.count)} events`, pct: r.pct })) : input.actorRows.map((r) => ({ label: r.key, value: input.money(r.minor), pct: r.pct }));
    list.slice(0, 5).forEach((r, i) => { const y = statsY + 20 - i * 34; pdf.text(48, y, r.label, 10, C.ink); pdf.rect(200, y - 4, 200, 6, C.mist); pdf.rect(200, y - 4, Math.max(2, 200 * r.pct / 100), 6, C.green); pdf.text(420, y, r.value, 10, C.ink, true); });
}

function dataPage(pdf: Pdf, input: ReportPdfInput) {
    pdf.newPage(); pdf.heading(input.title, 'Daily Operations Ledger');
    pdf.text(48, 720, 'Daily Time Series', 12, C.ink, true);
    const heads = ['Date', 'Revenue', 'Purchases', 'Funding', 'Refunds', 'New Users']; const xs = [48, 120, 220, 300, 390, 480];
    heads.forEach((h, i) => pdf.text(xs[i], 690, h.toUpperCase(), 8, C.muted, true)); pdf.line(48, 680, 547, 680, C.mist, 2);
    input.series.slice(-16).forEach((r, i) => { const y = 650 - i * 30; if (i % 2 === 0) pdf.rect(48, y - 10, 499, 26, C.mist); [r.date, input.money(r.revenueMinor), number(r.purchaseCount), input.money(r.fundingMinor), input.money(r.refundMinor), number(r.newCustomers)].forEach((v, j) => pdf.text(xs[j], y, v, 9, j === 1 ? C.green : C.ink, j === 1)); });
}

export function downloadReportPdf(input: ReportPdfInput) {
    const pdf = new Pdf(); coverPage(pdf, input); pdf.newPage(); overviewPage(pdf, input); insightsPage(pdf, input); tablePage(pdf, input); dataPage(pdf, input);
    pdf.finish(`beverly-${input.family}-report-${dateStamp()}.pdf`);
}
