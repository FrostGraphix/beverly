function stringValue(value) {
  if (value === null || typeof value === "undefined") return "";
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeFilenamePart(value, fallback = "receipt") {
  const cleaned = stringValue(value)
    .replace(/[^a-z0-9._-]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);
  return cleaned || fallback;
}

function normalizeMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return stringValue(value);
  return number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeUnit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return stringValue(value);
  return number.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function humanizeKey(key) {
  return String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeFieldValue(label, value) {
  if (/paid|amount|price|charge|tax|revenue|cost/i.test(label)) return normalizeMoney(value);
  if (/unit|kwh|energy|power|usage|balance|demand/i.test(label)) return normalizeUnit(value);
  return stringValue(value);
}

function sectionForLabel(label) {
  if (/receipt|id$|^id$/i.test(label)) return "identity";
  if (/customer|name|phone|address|certifi/i.test(label)) return "customer";
  if (/meter|tariff|communication|protocol|obis|class|version/i.test(label)) return "meter";
  if (/token|paid|unit|tax|vat|vend|price|amount|charge|power/i.test(label)) return "transaction";
  if (/station|site|remark|time|date|status|relay|battery|magnetic|terminal|current|data|gateway/i.test(label)) return "site";
  return "system";
}

function findRowValue(row, columnKey, labels, fallbackKeys = []) {
  for (const label of labels) {
    const key = columnKey(label);
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  for (const key of fallbackKeys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return "";
}

function field(label, value, options = {}) {
  return {
    label,
    value: options.raw ? stringValue(value) : normalizeFieldValue(label, value),
    section: options.section || "transaction",
    isToken: Boolean(options.isToken),
    emphasis: Boolean(options.emphasis)
  };
}

function appendField(fields, seenLabels, label, value, options = {}) {
  const normalizedLabel = humanizeKey(label);
  const normalizedValue = stringValue(value);
  if (!normalizedLabel || !normalizedValue) return;
  const key = normalizedLabel.toLowerCase();
  if (seenLabels.has(key)) return;
  seenLabels.add(key);
  fields.push(field(normalizedLabel, value, {
    section: options.section || sectionForLabel(normalizedLabel),
    isToken: options.isToken || /token/i.test(normalizedLabel),
    emphasis: options.emphasis || /receipt id|customer name|meter id|total paid|amount|token/i.test(normalizedLabel),
    raw: options.raw
  }));
}

const brand = {
  name: "Beverly",
  company: "ACOB Lighting Technology Limited",
  email: "support@acoblighting.com",
  phone: "+234 800 BEVERLY",
  web: "www.acoblighting.com"
};

export function buildReceiptModel(route, row, columnKey, receiptType = "") {
  const totalPaid = findRowValue(row, columnKey, ["Total Paid", "Total Paid(MMK)"], ["totalPaid", "amount"]);
  const totalUnit = findRowValue(row, columnKey, ["Total Unit", "Total Unit(kWh)"], ["totalUnit"]);
  const token = findRowValue(row, columnKey, ["Token", "Token(Recharge)"], ["token"]);
  const receiptId = findRowValue(row, columnKey, ["Receipt Id", "Id"], ["receiptId", "id"]);
  const now = new Date();
  
  const title = receiptType === "cancel"
    ? "Cancel Receipt"
    : route?.title
      ? route.title.replace(/ Record| Table| Task/g, "") + " Receipt"
      : "Transaction Receipt";

  const seenLabels = new Set();
  const fields = [];
  [
    ["Receipt Id", receiptId, { section: "identity", emphasis: true }],
    ["Customer Id", findRowValue(row, columnKey, ["Customer Id"], ["customerId"]), { section: "customer" }],
    ["Customer Name", findRowValue(row, columnKey, ["Customer Name"], ["customerName", "name"]), { section: "customer", emphasis: true }],
    ["Meter Id", findRowValue(row, columnKey, ["Meter Id"], ["meterId"]), { section: "meter", emphasis: true }],
    ["Meter Type", findRowValue(row, columnKey, ["Meter Type"], ["meterType"]), { section: "meter" }],
    ["Tariff Id", findRowValue(row, columnKey, ["Tariff Id"], ["tariffId"]), { section: "meter" }],
    ["Token", token, { section: "transaction", isToken: true, emphasis: true, raw: true }],
    ["Total Paid", totalPaid, { section: "transaction", emphasis: true }],
    ["Total Unit", totalUnit, { section: "transaction" }],
    ["Tax / VAT", findRowValue(row, columnKey, ["VAT Charge"], ["tax"]), { section: "transaction" }],
    ["Vend Status", findRowValue(row, columnKey, ["Vend"], ["vend"]), { section: "transaction" }],
    ["Maximum Power(W)", findRowValue(row, columnKey, ["Maximum Power(W)"], ["maximumPower"]), { section: "transaction" }],
    ["Station Id", findRowValue(row, columnKey, ["Station Id"], ["stationId"]), { section: "site" }],
    ["Remark", findRowValue(row, columnKey, ["Remark"], ["remark"]), { section: "site" }],
    ["Time", findRowValue(row, columnKey, ["Time", "Create Time", "Update Time"], ["createDate", "createTime", "updateDate", "time"]), { section: "site" }]
  ].forEach(([label, value, options]) => appendField(fields, seenLabels, label, value, options));

  for (const column of route?.columns || []) {
    if (column === "Actions") continue;
    const key = columnKey(column);
    appendField(fields, seenLabels, column, row?.[key], { section: sectionForLabel(column) });
  }

  for (const [key, value] of Object.entries(row || {})) {
    if (value && typeof value === "object") continue;
    appendField(fields, seenLabels, humanizeKey(key), value, { section: sectionForLabel(key) });
  }

  const model = {
    title,
    subtitle: "Energy Operations & Management System",
    amount: totalPaid ? normalizeMoney(totalPaid) : "",
    generatedAt: now.toISOString().replace("T", " ").slice(0, 19),
    routeTitle: route?.title || "",
    hash: route?.hash || "",
    receiptId: stringValue(receiptId || `${now.getTime()}`),
    fields,
    brand,
    audit: {
      generatedAt: now.toISOString(),
      source: route?.hash || route?.title || "manual",
      rowCount: 1
    }
  };
  return model;
}


export function receiptHtml(model) {
  const tokenField = model.fields.find(f => f.isToken);
  const receiptId = model.fields.find(f => f.label === "Receipt Id")?.value || "";
  const customerName = model.fields.find(f => f.label === "Customer Name")?.value || "";
  const meterId = model.fields.find(f => f.label === "Meter Id")?.value || "";
  const pageTitle = `${model.title} #${receiptId} - ${customerName} | ${model.brand.name}`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(pageTitle)}</title>

  <style>
    :root {
      --primary: #059669;
      --primary-deep: #065f46;
      --primary-soft: #ecfdf5;
      --ink: #0f172a;
      --text-main: #334155;
      --text-muted: #64748b;
      --bg-light: #f0fdf4;
      --bg-soft: #f8fafc;
      --border: #d1fae5;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; }
    @page { size: A4; margin: 0; }
    html {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #e5e7eb;
    }
    body { 
      font-family: Inter, "Segoe UI", Arial, sans-serif;
      margin: 0; 
      padding: 24px;
      background: #e5e7eb;
      color: var(--text-main);
    }
    .receipt {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: white;
      padding: 16mm;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--border);
      box-shadow: 0 24px 60px rgba(15, 23, 42, .14);
    }
    @media print {
      html,
      body {
        width: 210mm;
        min-height: 297mm;
        margin: 0;
        padding: 0;
        background: white;
      }
      .receipt { 
        width: 210mm;
        min-height: 297mm;
        max-width: none; 
        box-shadow: none; 
        border-radius: 0; 
        border: 0;
        padding: 14mm;
      }
    }
    .receipt::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 8px;
      background: linear-gradient(90deg, var(--primary-deep), var(--primary));
    }
    .header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 20px;
      align-items: start;
      margin-bottom: 22px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 18px;
    }
    .brand-mark {
      width: 42px;
      height: 42px;
      background: linear-gradient(135deg, var(--primary), #10b981);
      color: white;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 22px;
    }
    .brand-name {
      font-size: 22px;
      font-weight: 700;
      color: var(--ink);
    }
    .header-meta {
      min-width: 190px;
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: linear-gradient(180deg, var(--primary-soft), var(--bg-soft));
      text-align: right;
      font-size: 11px;
      color: var(--text-muted);
    }
    .header-meta strong {
      display: block;
      color: var(--ink);
      font-size: 13px;
      margin-bottom: 4px;
    }
    .hero {
      display: grid;
      grid-template-columns: 1fr 190px;
      gap: 18px;
      margin-bottom: 20px;
    }
    .amount-display,
    .summary-box {
      padding: 18px;
      background: linear-gradient(135deg, var(--primary-soft), white);
      border-radius: 18px;
      border: 1px solid var(--border);
    }
    .amount-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      display: block;
      margin-bottom: 4px;
    }
    .amount-value {
      font-size: 34px;
      font-weight: 700;
      color: var(--primary);
      display: block;
    }
    .summary-box span {
      display: block;
      color: var(--text-muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: 4px;
    }
    .summary-box strong {
      display: block;
      color: var(--ink);
      font-size: 12px;
      word-break: break-word;
    }
    .summary-box + .summary-box { margin-top: 10px; }
    .title {
      font-size: 26px;
      font-weight: 700;
      margin: 0;
      color: var(--ink);
    }
    .subtitle {
      font-size: 14px;
      color: var(--text-muted);
      margin: 4px 0 0;
    }
    .details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 22px;
    }
    .detail-section {
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      background: white;
      break-inside: avoid;
    }
    .detail-section h2 {
      margin: 0;
      padding: 10px 14px;
      background: linear-gradient(180deg, var(--primary-soft), var(--bg-soft));
      border-bottom: 1px solid var(--border);
      color: var(--ink);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .field-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 9px 14px;
      border-bottom: 1px dashed var(--border);
    }
    .field-row:last-child { border-bottom: none; }
    .field-row--emphasis .field-value { color: var(--primary-deep); }
    .field-label {
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
    }
    .field-value {
      font-size: 12px;
      font-weight: 700;
      text-align: right;
      color: var(--ink);
      word-break: break-word;
    }
    .token-box {
      background: linear-gradient(135deg, var(--primary-soft), white);
      border: 1px solid #a7f3d0;
      padding: 18px;
      border-radius: 16px;
      text-align: center;
      margin-bottom: 24px;
    }
    .token-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--primary);
      font-weight: 600;
      margin-bottom: 8px;
      display: block;
    }
    .token-value {
      font-family: monospace;
      font-size: 21px;
      font-weight: 700;
      letter-spacing: 2px;
      color: var(--primary-deep);
      word-break: break-all;
    }
    .audit-strip {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: auto;
      margin-bottom: 16px;
    }
    .audit-item {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px;
      background: linear-gradient(180deg, var(--bg-soft), white);
      min-height: 54px;
    }
    .audit-item span {
      display: block;
      color: var(--text-muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .audit-item strong {
      display: block;
      margin-top: 4px;
      color: var(--ink);
      font-size: 11px;
      word-break: break-word;
    }
    .footer {
      text-align: center;
      padding-top: 18px;
      border-top: 1px solid var(--border);
    }
    .company-name {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      display: block;
    }
    .contact-info {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.6;
    }
    @media print {
      body { background: white; padding: 0; }
      .receipt { box-shadow: none; width: 210mm; max-width: 210mm; border-radius: 0; }
      .detail-section, .token-box, .amount-display, .summary-box, .audit-item { break-inside: avoid; }
    }
    @media (max-width: 720px) {
      .receipt { width: 100%; padding: 20px; min-height: 100vh; }
      .header, .hero, .details, .audit-strip { grid-template-columns: 1fr; }
      .header-meta { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div>
        <div class="brand">
          <div class="brand-mark">B</div>
          <div class="brand-name">${escapeHtml(model.brand.name)}</div>
        </div>
        <h1 class="title">${escapeHtml(model.title)}</h1>
        <p class="subtitle">${escapeHtml(model.subtitle)}</p>
      </div>
      <div class="header-meta">
        <strong>${escapeHtml(model.receiptId || receiptId || "Pending")}</strong>
        <span>${escapeHtml(model.generatedAt || "")}</span>
      </div>
    </div>

    <div class="hero">
      <div class="amount-display">
        <span class="amount-label">Amount Purchased</span>
        <span class="amount-value">${escapeHtml(model.amount || "0.00")}</span>
      </div>
      <div>
        <div class="summary-box">
          <span>Customer</span>
          <strong>${escapeHtml(customerName || "Not supplied")}</strong>
        </div>
        <div class="summary-box">
          <span>Meter</span>
          <strong>${escapeHtml(meterId || "Not supplied")}</strong>
        </div>
      </div>
    </div>

    ${tokenField ? `
    <div class="token-box">
      <span class="token-label">Your Token</span>
      <div class="token-value">${escapeHtml(tokenField.value)}</div>
    </div>
    ` : ''}

    <div class="audit-strip">
      <div class="audit-item">
        <span>Source</span>
        <strong>${escapeHtml(model.routeTitle || model.hash || "Transaction")}</strong>
      </div>
      <div class="audit-item">
        <span>Generated</span>
        <strong>${escapeHtml(model.generatedAt || "")}</strong>
      </div>
      <div class="audit-item">
        <span>Record Count</span>
        <strong>${escapeHtml(model.audit?.rowCount || 1)}</strong>
      </div>
    </div>

    <div class="footer">
      <span class="company-name">${escapeHtml(model.brand.company)}</span>
      <div class="contact-info">
        ${escapeHtml(model.brand.email)} &bull; ${escapeHtml(model.brand.phone)}<br>
        ${escapeHtml(model.brand.web)}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function buildReceiptPdfBytes(model) {
  const textLines = [
    model.brand.name.toUpperCase(),
    model.brand.company,
    model.title,
    model.subtitle,
    `Receipt: ${model.receiptId || "Pending"}`,
    `Generated: ${model.generatedAt || ""}`,
    `Amount Purchased: ${model.amount || "0.00"}`,
    "----------------------------------------",
    ...model.fields.map((field) => `${field.label}: ${field.value}`),
    "----------------------------------------",
    model.brand.email,
    model.brand.phone,
    model.brand.web
  ].filter(Boolean);
  const printableLines = textLines.flatMap((line) => {
    const text = stringValue(line);
    if (text.length <= 86) return [text];
    return text.match(/.{1,86}/g) || [text];
  }).slice(0, 38);
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 770 Td",
    ...printableLines.flatMap((line, index) => (index === 0
      ? [`(${String(line).replace(/[()\\]/g, "\\$&")}) Tj`]
      : ["0 -18 Td", `(${String(line).replace(/[()\\]/g, "\\$&")}) Tj`])),
    "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function downloadPdfFallback(model, filename) {
  const bytes = buildReceiptPdfBytes(model);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function loadHtml2Pdf() {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-receipt-pdf-loader='html2pdf']");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.html2pdf), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.async = true;
    script.dataset.receiptPdfLoader = "html2pdf";
    script.onload = () => resolve(window.html2pdf);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function mountReceiptFrame(model) {
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Receipt PDF Renderer");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "794px";
  frame.style.height = "1123px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  doc.open();
  doc.write(receiptHtml(model));
  doc.close();

  await new Promise((resolve) => setTimeout(resolve, 80));
  if (doc.fonts?.ready) await doc.fonts.ready.catch(() => {});
  return frame;
}

function waitForDocumentReady(targetWindow) {
  const targetDocument = targetWindow?.document;
  if (!targetDocument) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      if (targetDocument.fonts?.ready) {
        targetDocument.fonts.ready.then(resolve).catch(resolve);
        return;
      }
      resolve();
    };
    if (targetDocument.readyState === "complete") {
      finish();
      return;
    }
    targetWindow.addEventListener("load", finish, { once: true });
    setTimeout(finish, 350);
  });
}

export async function downloadReceiptPdf(model) {
  const receiptId = model.fields.find(f => f.label === "Receipt Id")?.value || "no-id";
  const customerName = model.fields.find(f => f.label === "Customer Name")?.value || "customer";
  const safeName = safeFilenamePart(customerName, "customer").toLowerCase();
  const safeTitle = safeFilenamePart(model.title, "receipt");
  const safeReceiptId = safeFilenamePart(receiptId, "no-id");
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `${safeFilenamePart(model.brand.name, "Beverly")}_${safeTitle}_${safeReceiptId}_${safeName}_${timestamp}.pdf`;

  let frame = null;
  try {
    const html2pdf = await loadHtml2Pdf();
    frame = await mountReceiptFrame(model);
    const receiptElement = frame.contentDocument.querySelector(".receipt");
    if (!receiptElement) throw new Error("Receipt renderer did not mount");
    const opt = {
      margin: 0,
      filename: filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: 794,
        windowHeight: 1123,
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] }
    };

    await html2pdf().set(opt).from(receiptElement).save();
    return { ok: true, mode: "html2pdf", filename };
  } catch (error) {
    console.error("Receipt PDF export failed. Using fallback PDF.", error);
    downloadPdfFallback(model, filename);
    return { ok: false, mode: "fallback", filename, error };
  } finally {
    if (frame?.parentNode) frame.parentNode.removeChild(frame);
  }
}



export function openBrowserPrint(model, popupWindow = null) {
  const popup = popupWindow || window.open("", "_blank", "width=900,height=700");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(receiptHtml(model));
  popup.document.close();
  popup.focus();
  waitForDocumentReady(popup).then(() => {
    setTimeout(() => {
      if (!popup.closed) popup.print();
    }, 120);
  });
  return true;
}
