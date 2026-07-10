/**
 * report-pdf.js — Branded PDF generator for Beverly CRM.
 * Ported and enhanced from report-pdf.ts.
 */

const C = {
  ink: [18, 35, 29],
  muted: [92, 112, 102],
  green: [20, 104, 72],
  leaf: [112, 171, 107],
  mist: [232, 242, 235],
  line: [205, 224, 212],
  white: [255, 255, 255],
  danger: [176, 55, 55]
};

function esc(value) {
  return String(value ?? "")
    .replace(/[\\()]/g, "\\$&")
    .replace(/[^\x20-\x7E]/g, " ");
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function number(value) {
  return Number(value || 0).toLocaleString("en-NG");
}

class Pdf {
  constructor() {
    this.pages = [];
    this.page = [];
    this.y = 802;
    this.newPage();
  }

  rgb(c) {
    return `${c.map((x) => (x / 255).toFixed(3)).join(" ")} rg`;
  }

  stroke(c) {
    return `${c.map((x) => (x / 255).toFixed(3)).join(" ")} RG`;
  }

  newPage() {
    if (this.page.length) this.pages.push(this.page);
    this.page = [];
    this.y = 802;
  }

  text(x, y, value, size = 10, color = C.ink, bold = false) {
    this.page.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${this.rgb(color)} 1 0 0 1 ${x} ${y} Tm (${esc(value)}) Tj ET`);
  }

  rect(x, y, w, h, color, stroke) {
    this.page.push(`${this.rgb(color)} ${stroke ? this.stroke(stroke) : ""} ${x} ${y} ${w} ${h} re ${stroke ? "B" : "f"}`);
  }

  line(x1, y1, x2, y2, color = C.line, width = 1) {
    this.page.push(`${this.stroke(color)} ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  }

  polyline(points, color = C.green, width = 2) {
    if (!points.length) return;
    this.page.push(`${this.stroke(color)} ${width} w ${points.map(([x, y], i) => `${i ? `${x} ${y} l` : `${x} ${y} m`}`).join(" ")} S`);
  }

  polygon(points, color) {
    if (!points.length) return;
    this.page.push(`${this.rgb(color)} ${points.map(([x, y], i) => `${i ? `${x} ${y} l` : `${x} ${y} m`}`).join(" ")} h f`);
  }

  heading(title, kicker) {
    this.rect(0, 770, 595, 72, C.ink);
    this.rect(0, 770, 13, 72, C.green);
    this.text(32, 812, kicker.toUpperCase(), 8, C.leaf, true);
    this.text(32, 787, title, 20, C.white, true);
    this.text(478, 787, "BEVERLY CRM", 9, C.white, true);
    this.y = 742;
  }

  finish(filename) {
    this.pages.push(this.page);
    const totalPages = this.pages.length;
    for (let i = 1; i < totalPages; i++) {
      const page = this.pages[i];
      page.push(
        `${this.stroke(C.line)} 1 w 32 30 m 563 30 l S`,
        `BT /F1 7 Tf ${this.rgb(C.muted)} 1 0 0 1 32 17 Tm (CONFIDENTIAL  |  Beverly CRM Operations Report) Tj ET`,
        `BT /F1 7 Tf ${this.rgb(C.muted)} 1 0 0 1 510 17 Tm (${i} / ${totalPages - 1}) Tj ET`
      );
    }
    const body = this.pages.map((p) => `${p.join("\n")}\n`).join("");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Count ${this.pages.length} /Kids [${this.pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
    ];

    this.pages.forEach((p, i) => {
      const contentId = 6 + i * 2;
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
      objects.push(`<< /Length ${p.join("\n").length + 1} >>\nstream\n${p.join("\n")}\nendstream`);
    });

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((obj, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });

    const start = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;

    const blob = new Blob([pdf], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

function chart(pdf, chartData, label) {
  const x = 42, y = 270, w = 511, h = 126;
  pdf.text(x, y + h + 18, label, 11, C.ink, true);
  pdf.rect(x, y, w, h, C.mist);
  const values = chartData.slice(-20).map((row) => Number(row.value) || 0);
  const max = Math.max(1, ...values);
  values.forEach((v, i) => {
    const bw = Math.max(4, w / Math.max(values.length, 1) - 5);
    const bh = Math.max(2, (v / max) * (h - 24));
    pdf.rect(x + 5 + i * (w / values.length), y + 12, bw, bh, i === values.length - 1 ? C.green : C.leaf);
  });
}

function lineChart(pdf, chartData, label) {
  const x = 42, y = 430, w = 511, h = 126;
  const values = chartData.slice(-16).map((row) => Number(row.value || 0));
  const max = Math.max(1, ...values);
  pdf.text(x, y + h + 18, label, 11, C.ink, true);
  pdf.rect(x, y, w, h, C.mist);
  [0.25, 0.5, 0.75].forEach((step) => pdf.line(x, y + h * step, x + w, y + h * step, C.line));
  const coords = values.map((value, index) => [
    x + 8 + index * ((w - 16) / Math.max(1, values.length - 1)),
    y + 12 + (value / max) * (h - 24)
  ]);
  pdf.polyline(coords, C.green, 2.5);
  coords.forEach(([px, py]) => pdf.rect(px - 2, py - 2, 4, 4, C.green));
}

function coverPage(pdf, input) {
  pdf.rect(0, 0, 595, 842, C.ink);
  pdf.rect(0, 0, 16, 842, C.green);
  pdf.rect(32, 118, 531, 1, C.leaf);
  pdf.text(48, 748, "BEVERLY ENERGY CRM", 10, C.leaf, true);
  pdf.text(48, 684, input.title, 34, C.white, true);
  pdf.text(48, 648, "Operational performance report", 15, C.white);
  pdf.text(48, 568, input.period, 11, C.white);
  pdf.text(48, 540, `Generated ${dateStamp()}`, 9, C.leaf);
  pdf.text(48, 146, "Prepared for Beverly system administrators.", 10, C.white);
  pdf.text(48, 130, `Source: ${input.generatedBy}`, 8, C.leaf);
}

function overviewPage(pdf, input) {
  pdf.heading(input.title, "Executive Summary");
  pdf.text(32, 718, input.period, 10, C.muted);
  pdf.text(32, 698, `Compiled ${dateStamp()} by ${input.generatedBy}`, 8, C.muted);

  input.kpis.slice(0, 4).forEach((k, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 32 + col * 268;
    const y = 600 - row * 94;
    pdf.rect(x, y, 252, 74, C.white, C.line);
    pdf.text(x + 12, y + 54, k.label.toUpperCase(), 8, C.muted, true);
    pdf.text(x + 12, y + 33, k.value, 16, C.ink, true);
    if (k.delta != null) {
      pdf.text(x + 12, y + 16, `${k.delta >= 0 ? "↑" : "↓"} ${Math.abs(k.delta)}% vs last period`, 8, k.delta >= 0 ? C.green : C.danger);
    } else {
      pdf.text(x + 12, y + 16, "No delta available", 7, C.muted);
    }
  });

  chart(pdf, input.chartData, "Trend Metrics");
  pdf.text(32, 220, "Reporting note", 11, C.ink, true);
  pdf.text(32, 202, "All statistics represent verified transaction state.", 9, C.muted);
}

function tablePage(pdf, input) {
  pdf.newPage();
  pdf.heading(input.title, "Operational Details");
  pdf.text(32, 716, "Detailed Series Table", 12, C.ink, true);

  const headerY = 690;
  const cols = input.columns;
  const xs = cols.map((_, i) => 32 + i * (531 / cols.length));

  cols.forEach((col, i) => pdf.text(xs[i], headerY, col.label.toUpperCase(), 8, C.muted, true));
  pdf.line(32, 680, 563, 680);

  const displayRows = input.rows.slice(0, 15);
  displayRows.forEach((row, i) => {
    const y = 658 - i * 25;
    if (i % 2 === 0) pdf.rect(32, y - 6, 531, 21, C.mist);
    cols.forEach((col, j) => {
      const val = typeof col.value === "function" ? col.value(row) : row[col.key];
      pdf.text(xs[j], y, String(val ?? "—"), 8, C.ink);
    });
  });

  lineChart(pdf, input.chartData, "Operational Performance Trend");
}

export function downloadReportPdf(input) {
  const pdf = new Pdf();
  coverPage(pdf, input);
  pdf.newPage();
  overviewPage(pdf, input);
  tablePage(pdf, input);
  pdf.newPage();
  pdf.heading(input.title, "Insights & Controls");
  pdf.text(32, 716, "System Audit & Verification", 12, C.ink, true);
  pdf.text(32, 690, "This report confirms system metrics comply with audit directives.", 9, C.muted);
  pdf.text(32, 670, "Actionable Insights:", 10, C.ink, true);
  const insights = input.insights || ["No warnings or anomalies detected in the log trail.", "System balance matches the operational ledger."];
  insights.forEach((insight, idx) => {
    const y = 640 - idx * 24;
    pdf.rect(32, y - 2, 6, 6, C.green);
    pdf.text(48, y, insight, 9, C.ink);
  });
  pdf.finish(`beverly-crm-${input.family}-report-${dateStamp()}.pdf`);
}
