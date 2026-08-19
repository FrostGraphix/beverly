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

function safeCssValue(value, fallback) {
  const text = stringValue(value).trim();
  if (!text || /[;{}<>]/.test(text)) return fallback;
  return text;
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

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function receiptDataFromResponse(response = {}) {
  if (!response || typeof response !== "object") return {};
  return response.data || response.result || response;
}

function tariffUnitPrice(tariff = {}) {
  const raw = firstValue(tariff.effectivePrice, tariff.unitPrice, tariff.price);
  const parts = String(raw ?? "").split("~").map((part) => Number(part)).filter((value) => Number.isFinite(value));
  if (parts.length >= 3) return parts[2] > 0 ? parts[2] : "";
  return parts[0] > 0 ? parts[0] : raw;
}

function purchaseWayLabel(value) {
  return String(value || "paid") === "unit" ? "Vend By Total Unit" : "Vend By Total Paid";
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

const excludedReceiptLabels = new Set([
  "customer id",
  "meter phase mode",
  "require three phase",
  "is three phase"
]);

function appendField(fields, seenLabels, label, value, options = {}) {
  const normalizedLabel = humanizeKey(label);
  const normalizedValue = stringValue(value);
  if (!normalizedLabel || !normalizedValue) return;
  const key = normalizedLabel.toLowerCase();
  if (excludedReceiptLabels.has(key)) return;
  if (seenLabels.has(key)) return;
  seenLabels.add(key);
  fields.push(field(normalizedLabel, value, {
    section: options.section || sectionForLabel(normalizedLabel),
    isToken: options.isToken || /token/i.test(normalizedLabel),
    emphasis: options.emphasis || /receipt id|customer name|meter id|total paid|amount|token/i.test(normalizedLabel),
    raw: options.raw
  }));
}

export const brand = {
  name: "Beverly",
  company: "ACOB Lighting Technology Limited",
  email: "info@acoblighting.com",
  phone: "+234 704 920 2634 / +234 803 290 2825",
  web: "www.acoblighting.com",
  address: "Plot 2, Block 14 Extension, Setraco Gate, Gwarinpa, FCT, Nigeria"
};

export const requiredReceiptFields = [
  "Receipt Id",
  "Token",
  "Meter Id",
  "Customer Name",
  "Total Paid",
  "Total Unit",
  "Tariff Id",
  "Tariff Price",
  "Tax",
  "Payment Method",
  "Purchase Way",
  "Vend Status",
  "Time",
  "Operator / Vendor",
  "Support Reference",
  "Audit Status"
];

export function validateReceiptModel(model = {}) {
  const fields = Array.isArray(model.fields) ? model.fields : [];
  const fieldMap = new Map(fields.map((item) => [String(item.label || "").toLowerCase(), stringValue(item.value).trim()]));
  const missing = requiredReceiptFields.filter((label) => !fieldMap.get(label.toLowerCase()));
  return {
    ok: missing.length === 0,
    missing
  };
}

export function buildCanonicalReceiptRow(context = {}) {
  const form = context.form || {};
  const row = context.row || {};
  const responseData = receiptDataFromResponse(context.response);
  const tariff = context.tariff || {};
  const actor = context.actor || {};
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const receiptId = firstValue(responseData.receiptId, responseData.id, form.receiptId, row.receiptId, row.id, `RCPT-${Date.now()}`);
  const token = firstValue(responseData.token, responseData.tokenFirst, responseData.tokenValue, form.token, row.token);
  const totalPaid = firstValue(form.amount, responseData.totalPaid, responseData.amount, row.totalPaid, row.amount);
  const totalUnit = firstValue(form.totalUnit, responseData.totalUnit, responseData.unit, row.totalUnit);
  const tariffId = firstValue(form.tariffId, responseData.tariffId, row.tariffId, tariff.tariffId, tariff.id);
  const stationId = firstValue(form.stationId, responseData.stationId, row.stationId);
  const auditStatus = firstValue(responseData.auditStatus, responseData.status === false ? "Failed" : responseData.status === true ? "Success" : "", responseData.reason, "Success");
  return {
    ...row,
    ...form,
    ...responseData,
    receiptId,
    token,
    meterId: firstValue(form.meterId, responseData.meterId, row.meterId),
    customerId: firstValue(form.customerId, responseData.customerId, row.customerId),
    customerName: firstValue(form.customerName, responseData.customerName, row.customerName, row.name),
    totalPaid,
    totalUnit,
    tariffId,
    tariffPrice: firstValue(responseData.tariffPrice, form.tariffPrice, row.tariffPrice, tariffUnitPrice(tariff)),
    tax: firstValue(responseData.tax, responseData.vat, form.tax, form.vat, row.tax, "0"),
    paymentMethod: firstValue(form.paymentMethod, responseData.paymentMethod, row.paymentMethod, "Cash"),
    purchaseWay: firstValue(responseData.purchaseWay, form.purchaseWayLabel, purchaseWayLabel(form.purchaseWay || row.purchaseWay)),
    vend: firstValue(responseData.vend, responseData.vendStatus, row.vend, responseData.status === false ? "Failed" : "Generated"),
    stationId,
    operatorVendor: firstValue(actor.name, actor.email, form.operatorVendor, row.operatorVendor, "Beverly Operator"),
    supportReference: firstValue(responseData.supportReference, responseData.reference, form.supportReference, row.supportReference, `SUP-${receiptId}`),
    auditStatus,
    time: firstValue(responseData.createTime, responseData.createDate, responseData.time, row.time, row.createDate, now)
  };
}

export function buildReceiptFilename(model, extension = "pdf") {
  const receiptId = receiptFieldValue(model, ["Receipt Id", "Id"]) || model.receiptId || "no-id";
  const customerName = receiptFieldValue(model, ["Customer Name"]) || receiptFieldValue(model, ["Customer Id"]) || "customer";
  const safeName = safeFilenamePart(customerName, "customer").toLowerCase();
  const safeTitle = safeFilenamePart(model.title, "receipt");
  const safeReceiptId = safeFilenamePart(receiptId, "no-id");
  const timestamp = new Date().toISOString().split("T")[0];
  return `${safeFilenamePart(model.brand.name, "Beverly")}_${safeTitle}_${safeReceiptId}_${safeName}_${timestamp}.${extension}`;
}

export function buildReceiptThemeFromDocument(targetDocument = typeof document !== "undefined" ? document : null) {
  void targetDocument;
  return buildReceiptPdfTheme();
}

function buildReceiptPdfTheme() {
  return {
    primary: "#16a34a",
    primaryDeep: "#166534",
    ink: "#102a1b",
    textMain: "#1f3d2b",
    textMuted: "#5f6f65",
    panel: "#ffffff",
    panelSoft: "#f3fbf5",
    border: "rgba(22, 163, 74, .28)"
  };
}

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
    ["Customer Name", findRowValue(row, columnKey, ["Customer Name"], ["customerName", "name"]), { section: "customer", emphasis: true }],
    ["Meter Id", findRowValue(row, columnKey, ["Meter Id"], ["meterId"]), { section: "meter", emphasis: true }],
    ["Meter Type", findRowValue(row, columnKey, ["Meter Type"], ["meterType"]), { section: "meter" }],
    ["Tariff Id", findRowValue(row, columnKey, ["Tariff Id"], ["tariffId"]), { section: "meter" }],
    ["Token", token, { section: "transaction", isToken: true, emphasis: true, raw: true }],
    ["Total Paid", totalPaid, { section: "transaction", emphasis: true }],
    ["Total Unit", totalUnit, { section: "transaction" }],
    ["Tariff Price", findRowValue(row, columnKey, ["Tariff Price"], ["tariffPrice", "unitPrice", "price"]), { section: "transaction" }],
    ["Tax", findRowValue(row, columnKey, ["Tax"], ["tax"]), { section: "transaction" }],
    ["Payment Method", findRowValue(row, columnKey, ["Payment Method"], ["paymentMethod"]), { section: "transaction" }],
    ["Purchase Way", findRowValue(row, columnKey, ["Purchase Way"], ["purchaseWay"]), { section: "transaction" }],
    ["Vend Status", findRowValue(row, columnKey, ["Vend"], ["vend"]), { section: "transaction" }],
    ["Maximum Power(W)", findRowValue(row, columnKey, ["Maximum Power(W)"], ["maximumPower"]), { section: "transaction" }],
    ["Operator / Vendor", findRowValue(row, columnKey, ["Operator / Vendor"], ["operatorVendor", "operator", "vendorName", "actorId"]), { section: "site" }],
    ["Support Reference", findRowValue(row, columnKey, ["Support Reference"], ["supportReference", "reference"]), { section: "site" }],
    ["Audit Status", findRowValue(row, columnKey, ["Audit Status"], ["auditStatus"]), { section: "site" }],
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
    subtitle: "",
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

function receiptFieldValue(model, labels = []) {
  const wanted = new Set(labels.map((label) => String(label).toLowerCase()));
  return model.fields.find((field) => wanted.has(String(field.label).toLowerCase()))?.value || "";
}

function receiptTime(model) {
  return receiptFieldValue(model, ["Time", "Create Date", "Create Time", "Update Date", "Update Time"]) || model.generatedAt || "";
}

export function receiptHtml(model, options = {}) {
  const tokenField = model.fields.find(f => f.isToken);
  const receiptId = receiptFieldValue(model, ["Receipt Id", "Id"]);
  const customerName = receiptFieldValue(model, ["Customer Name"]);
  const meterId = receiptFieldValue(model, ["Meter Id"]);
  const stationId = receiptFieldValue(model, ["Station Id"]);
  const totalUnit = receiptFieldValue(model, ["Total Unit"]);
  const displayTime = receiptTime(model);
  const amountLabel = model.subject || "Amount";
  const filename = buildReceiptFilename(model, "pdf");
  const pageTitle = filename.replace(/\.pdf$/i, "");
  const theme = options.theme || {};
  const primary = safeCssValue(theme.primary, "#16a34a");
  const primaryDeep = safeCssValue(theme.primaryDeep, "#166534");
  const ink = safeCssValue(theme.ink, "#102a1b");
  const textMain = safeCssValue(theme.textMain, "#1f3d2b");
  const textMuted = safeCssValue(theme.textMuted, "#5f6f65");
  const panel = safeCssValue(theme.panel, "#ffffff");
  const panelSoft = safeCssValue(theme.panelSoft, "#f3fbf5");
  const border = safeCssValue(theme.border, "rgba(22, 163, 74, .28)");
  const pageBackground = "#ffffff";
  const bodyBackground = "#ffffff";
  const receiptBackground = "linear-gradient(180deg, #ffffff, #f8fdf9)";
  const tokenBackground = "#ffffff";
  const summaryBackground = "rgba(22,163,74,.035)";
  const detailBackground = "rgba(22,163,74,.025)";
  const summaryBorder = "rgba(22,163,74,.24)";
  const detailBorder = "rgba(22,163,74,.18)";
  const receiptShadow = "0 18px 46px rgba(16, 42, 27, .10), 0 0 0 6px rgba(22,163,74,.035)";

  const isDarkTheme = Boolean(theme.isDark || theme.dark || (theme.panel && theme.panel.toLowerCase() !== "#ffffff"));
  const logoSrc = isDarkTheme ? "/brand/beverly-lockup-light.png" : "/brand/beverly-lockup.png";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(pageTitle)}</title>

  <style>
    :root {
      --primary: ${primary};
      --primary-deep: ${primaryDeep};
      --ink: ${ink};
      --text-main: ${textMain};
      --text-muted: ${textMuted};
      --panel: ${panel};
      --panel-soft: ${panelSoft};
      --panel-glow: rgba(22, 163, 74, .10);
      --border: ${border};
    }
    * { box-sizing: border-box; }
    @page { size: A4; margin: 0; }
    html {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: ${pageBackground};
    }
    body { 
      font-family: Inter, "Segoe UI", Arial, sans-serif;
      margin: 0; 
      padding: 0;
      background: ${bodyBackground};
      color: var(--text-main);
    }
    .receipt {
      width: 148mm;
      min-height: auto;
      margin: 0 auto;
      background: ${receiptBackground};
      padding: 12mm;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--border);
      border-radius: 24px;
      box-shadow: ${receiptShadow};
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
        width: 148mm;
        min-height: auto;
        max-width: none; 
        box-shadow: none; 
        border-radius: 18px; 
        border: 1px solid var(--border);
        padding: 10mm;
      }
    }
    .receipt::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 5px;
      background: linear-gradient(90deg, var(--primary-deep), var(--primary), #bbf7d0);
    }
    .header {
      margin-bottom: 18px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .brand-logo-img {
      height: 38px;
      width: auto;
      max-width: 220px;
      object-fit: contain;
    }
    .receipt-time {
      min-width: 0;
      min-height: 40px;
      padding: 7px 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: rgba(22,163,74,.08);
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--ink);
      font-weight: 750;
      margin-top: 10px;
    }
    .receipt-time span {
      color: var(--primary);
      text-transform: uppercase;
      letter-spacing: .08em;
      font-size: 9px;
      flex: 0 0 auto;
    }
    .receipt-time strong {
      min-width: 0;
      color: var(--ink);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .title {
      font-size: 21px;
      font-weight: 850;
      margin: 0;
      color: var(--ink);
    }
    .subtitle {
      font-size: 12px;
      color: var(--text-muted);
      margin: 3px 0 0;
    }
    .hero {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      margin-bottom: 14px;
    }
    .amount-display {
      padding: 18px;
      background: linear-gradient(135deg, var(--panel-glow), rgba(22,163,74,.03));
      border-radius: 18px;
      border: 1px solid var(--border);
      text-align: center;
    }
    .amount-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: var(--primary);
      display: block;
      margin-bottom: 7px;
      font-weight: 850;
    }
    .amount-value {
      font-size: 36px;
      font-weight: 900;
      color: var(--primary);
      line-height: 1;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .summary-box {
      padding: 11px 12px;
      border: 1px solid ${summaryBorder};
      border-radius: 14px;
      background: ${summaryBackground};
    }
    .summary-box span {
      display: block;
      color: var(--text-muted);
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: 4px;
    }
    .summary-box strong {
      display: block;
      color: var(--ink);
      font-size: 11px;
      word-break: break-word;
    }
    .token-box {
      background: ${tokenBackground};
      border: 1px solid var(--border);
      padding: 14px 10px;
      border-radius: 16px;
      text-align: center;
      margin-bottom: 14px;
    }
    .token-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .12em;
      color: #000000;
      font-weight: 850;
      margin-bottom: 8px;
      display: block;
    }
    .token-value {
      font-family: "Cascadia Code", "Fira Code", "Courier New", monospace;
      font-size: clamp(14px, 4.5vw, 22px);
      font-weight: 900;
      letter-spacing: 2px;
      color: var(--primary, #16a34a);
      white-space: nowrap;
      word-break: keep-all;
      overflow: hidden;
      text-overflow: clip;
      line-height: 1.2;
      text-align: center;
      margin: 0 auto;
    }
    .detail-section {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 14px;
    }
    .receipt-status {
      width: fit-content;
      margin: 0 0 14px;
      padding: 7px 11px;
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--primary-deep);
      font-size: 10px;
      font-weight: 850;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .detail-item {
      padding: 9px 10px;
      border: 1px solid ${detailBorder};
      border-radius: 12px;
      background: ${detailBackground};
      min-width: 0;
    }
    .detail-item.wide {
      grid-column: 1 / -1;
    }
    .detail-item span {
      display: block;
      color: var(--text-muted);
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: 4px;
    }
    .detail-item strong {
      display: block;
      color: var(--text-main);
      font-size: 10px;
      word-break: break-word;
      line-height: 1.35;
    }
    .footer {
      text-align: center;
      padding-top: 14px;
      border-top: 1px solid var(--border);
    }
    .company-name {
      font-size: 12px;
      font-weight: 800;
      margin-bottom: 6px;
      display: block;
      color: var(--ink);
    }
    .contact-info {
      font-size: 10px;
      color: var(--text-muted);
      line-height: 1.6;
    }
    @media print {
      body { background: white; padding: 0; }
      .receipt { box-shadow: none; width: 148mm; max-width: 148mm; }
      .token-box, .amount-display, .summary-box { break-inside: avoid; }
    }
    @media (max-width: 720px) {
      .receipt { width: 100%; padding: 20px; min-height: 100vh; }
      .summary-grid { grid-template-columns: 1fr; }
      .detail-section { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 360px) {
      .detail-section { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="brand">
        <img class="brand-logo-img" src="${logoSrc}" alt="Beverly Logo" />
      </div>
      <h1 class="title">${escapeHtml(model.title)}</h1>
      ${model.subtitle ? `<p class="subtitle">${escapeHtml(model.subtitle)}</p>` : ''}
      <div class="receipt-time"><span>Time</span><strong>${escapeHtml(displayTime)}</strong></div>
    </div>

    <div class="hero">
      <div class="amount-display">
        <span class="amount-label">${escapeHtml(amountLabel)}</span>
        <span class="amount-value">${escapeHtml(model.amount || "0.00")}</span>
      </div>
    </div>

    ${model.status ? `<div class="receipt-status">${escapeHtml(model.status)}</div>` : ''}

    ${tokenField ? `
    <div class="token-box">
      <span class="token-label">Your Token</span>
      <div class="token-value">${escapeHtml(tokenField.value)}</div>
    </div>
    ` : ''}

    <div class="detail-section">
      ${model.fields
        .filter((field) => !field.isToken && !["total paid", "amount"].includes(String(field.label).toLowerCase()))
        .slice(0, 24)
        .map((field) => {
          const wideField = /^(receipt id|reference|memo|created|actor)$/i.test(String(field.label));
          return `
      <div class="detail-item${wideField ? ' wide' : ''}">
        <span>${escapeHtml(field.label)}</span>
        <strong>${escapeHtml(field.value)}</strong>
      </div>`;
        })
        .join("")}
    </div>

    <div class="footer">
      <span class="company-name">${escapeHtml(model.brand.company)}</span>
      <div class="contact-info">
        ${escapeHtml(model.brand.email)} &bull; ${escapeHtml(model.brand.phone)}<br>
        ${escapeHtml(model.brand.web)}<br>
        ${escapeHtml(model.brand.address)}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function buildReceiptPdfBytes(model) {
  const tokenField = model.fields.find(f => f.isToken || f.token);
  const receiptId = receiptFieldValue(model, ["Receipt Id", "Id"]) || model.receiptId || "Pending";
  const displayTime = receiptTime(model) || model.issuedAt || new Date().toLocaleString('en-GB');
  const amountVal = model.amount || (model.amountMinor != null ? `NGN ${(model.amountMinor / 100).toFixed(2)}` : '0.00');

  const pdfEscape = (str) => String(str ?? '').replace(/[()\\]/g, '\\$&');

  // Filter out token field from detail items
  const detailItems = model.fields.filter(f => !f.isToken && !f.token);

  let stream = [];

  // 1) Top Green Accent Bar (A4 page width = 595pt, height = 842pt)
  stream.push("0.086 0.639 0.29 rg 0 836 595 6 re f");

  // 2) Brand Logo Badge (Green Box + White 'B')
  stream.push("0.086 0.639 0.29 rg 40 774 36 36 re f");
  stream.push("BT 1 1 1 rg /F1 22 Tf 51 785 Td (B) Tj ET");

  // 3) Brand Title & Subtitle
  stream.push(`BT 0.062 0.165 0.106 rg /F1 18 Tf 86 794 Td (${pdfEscape(model.brand?.name || 'Beverly')}) Tj ET`);
  stream.push(`BT 0.37 0.43 0.39 rg /F2 8.5 Tf 86 778 Td (${pdfEscape(model.brand?.company || 'ACOB Lighting Technology Limited')} - Energy System) Tj ET`);

  // 4) Receipt ID Box (Right Aligned)
  stream.push("0.086 0.639 0.29 RG 420 774 135 36 re S");
  stream.push(`BT 0.086 0.639 0.29 rg /F1 11 Tf 430 792 Td (#${pdfEscape(receiptId)}) Tj ET`);
  stream.push(`BT 0.37 0.43 0.39 rg /F2 7.5 Tf 430 780 Td (RECEIPT ID · ${pdfEscape(displayTime.slice(0, 16))}) Tj ET`);

  let currentY = 745;

  // 5) Amount Card
  stream.push(`0.95 0.98 0.96 rg 40 ${currentY - 55} 515 55 re f`);
  stream.push(`0.086 0.639 0.29 RG 40 ${currentY - 55} 515 55 re S`);
  stream.push(`BT 0.086 0.639 0.29 rg /F1 8.5 Tf 55 ${currentY - 18} Td (${pdfEscape((model.subject || 'AMOUNT PURCHASED').toUpperCase())}) Tj ET`);
  stream.push(`BT 0.086 0.639 0.29 rg /F1 24 Tf 55 ${currentY - 45} Td (${pdfEscape(amountVal)}) Tj ET`);
  currentY -= 68;

  // 6) Token Card (if token field present)
  if (tokenField && tokenField.value) {
    stream.push(`0.94 0.97 0.95 rg 40 ${currentY - 55} 515 55 re f`);
    stream.push(`0.086 0.639 0.29 RG 40 ${currentY - 55} 515 55 re S`);
    stream.push(`BT 0 0 0 rg /F1 8.5 Tf 55 ${currentY - 18} Td (YOUR TOKEN) Tj ET`);
    stream.push(`BT 0.086 0.639 0.29 rg /F1 18 Tf 55 ${currentY - 44} Td (${pdfEscape(String(tokenField.value))}) Tj ET`);
    currentY -= 68;
  }

  // 7) Grid Items (2 Columns of Detail Boxes)
  const colWidth = 250;
  const rowHeight = 32;
  for (let i = 0; i < detailItems.length; i += 2) {
    const leftItem = detailItems[i];
    const rightItem = detailItems[i + 1];

    if (currentY < 120) break; // Ensure footer fits

    // Left Column Box
    if (leftItem) {
      stream.push(`0.97 0.98 0.97 rg 40 ${currentY - rowHeight} ${colWidth} ${rowHeight} re f`);
      stream.push(`0.88 0.92 0.89 RG 40 ${currentY - rowHeight} ${colWidth} ${rowHeight} re S`);
      stream.push(`BT 0.45 0.50 0.47 rg /F2 7.5 Tf 48 ${currentY - 12} Td (${pdfEscape(String(leftItem.label).toUpperCase())}) Tj ET`);
      stream.push(`BT 0.06 0.16 0.10 rg /F1 9.5 Tf 48 ${currentY - 25} Td (${pdfEscape(String(leftItem.value ?? '-'))}) Tj ET`);
    }

    // Right Column Box
    if (rightItem) {
      stream.push(`0.97 0.98 0.97 rg 305 ${currentY - rowHeight} ${colWidth} ${rowHeight} re f`);
      stream.push(`0.88 0.92 0.89 RG 305 ${currentY - rowHeight} ${colWidth} ${rowHeight} re S`);
      stream.push(`BT 0.45 0.50 0.47 rg /F2 7.5 Tf 313 ${currentY - 12} Td (${pdfEscape(String(rightItem.label).toUpperCase())}) Tj ET`);
      stream.push(`BT 0.06 0.16 0.10 rg /F1 9.5 Tf 313 ${currentY - 25} Td (${pdfEscape(String(rightItem.value ?? '-'))}) Tj ET`);
    }

    currentY -= (rowHeight + 6);
  }

  // 8) Footer
  stream.push("0.85 0.90 0.86 RG 40 70 515 0.5 re S");
  stream.push(`BT 0.06 0.16 0.10 rg /F1 9.5 Tf 175 52 Td (${pdfEscape(model.brand?.company || 'ACOB Lighting Technology Limited')}) Tj ET`);
  stream.push(`BT 0.40 0.45 0.42 rg /F2 8 Tf 155 38 Td (support@acoblighting.com  |  +234 800 BEVERLY  |  www.acoblighting.com) Tj ET`);

  const content = stream.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
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
    pdf += `${String(offsets[index]).padStart(10, "0")} 0000 n \n`;
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

export async function validatePdfBlob(blob) {
  const contentType = String(blob?.type || "").toLowerCase();
  if (!/^application\/pdf(?:;|$)/.test(contentType)) {
    throw new Error(`receipt-pdf endpoint returned invalid content type: ${contentType || "unknown"}`);
  }
  const signature = new TextDecoder("ascii").decode(await blob.slice(0, 5).arrayBuffer());
  if (signature !== "%PDF-") throw new Error("receipt-pdf endpoint returned an invalid PDF body");
  return blob;
}

async function downloadServerReceiptPdf(model, filename) {
  const controller = new AbortController();
  // A cold serverless render downloads and unpacks Chromium before the first byte, which
  // routinely takes longer than 20s. Aborting earlier than the function's own 60s ceiling
  // just pushes every first receipt of the day onto the plain-text fallback PDF.
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch("/api/receipt-pdf", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`receipt-pdf endpoint returned ${response.status}`);
    const blob = await validatePdfBlob(await response.blob());
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadReceiptPdf(model) {
  const filename = buildReceiptFilename(model, "pdf");

  try {
    await downloadServerReceiptPdf(model, filename);
    return { ok: true, mode: "server", filename };
  } catch (error) {
    console.warn("Server receipt PDF render failed. Using fallback PDF.", error);
    downloadPdfFallback(model, filename);
    return { ok: false, mode: "fallback", filename, error };
  }
}



export function openBrowserPrint(model, popupWindow = null) {
  const popup = popupWindow || window.open("", "_blank", "width=900,height=700");
  if (!popup) return false;
  const theme = buildReceiptThemeFromDocument();
  popup.document.open();
  popup.document.write(receiptHtml(model, { theme }));
  popup.document.close();
  popup.focus();
  waitForDocumentReady(popup).then(() => {
    setTimeout(() => {
      if (!popup.closed) popup.print();
    }, 120);
  });
  return true;
}
