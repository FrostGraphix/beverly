function stringValue(value) {
  if (value === null || typeof value === "undefined") return "";
  return String(value);
}

function receiptTypeLabel(receiptType) {
  if (receiptType === "cancel") return "Cancel Receipt";
  if (receiptType === "clear-credit") return "Clear Credit Receipt";
  if (receiptType === "clear-tamper") return "Clear Tamper Receipt";
  return "Credit Token Receipt";
}

function inferReceiptType(route, explicitType = "") {
  if (explicitType) return explicitType;
  if (route.hash.includes("clear-tamper")) return "clear-tamper";
  if (route.hash.includes("clear-credit")) return "clear-credit";
  return "credit";
}

export function buildReceiptModel(route, row, columnKey, explicitType = "") {
  const receiptType = inferReceiptType(route, explicitType);
  const model = {
    receiptType,
    title: receiptTypeLabel(receiptType),
    subtitle: route.title,
    fields: [
      { label: "Receipt Id", value: stringValue(row[columnKey("Receipt Id")] || row.receiptId || row.id) },
      { label: "Customer Id", value: stringValue(row[columnKey("Customer Id")] || row.customerId) },
      { label: "Customer Name", value: stringValue(row[columnKey("Customer Name")] || row.customerName) },
      { label: "Meter Id", value: stringValue(row[columnKey("Meter Id")] || row.meterId) },
      { label: "Token", value: stringValue(row[columnKey("Token")] || row[columnKey("Token(Recharge)")] || row.token) },
      { label: "Total Paid", value: stringValue(row[columnKey("Total Paid")] || row.totalPaid) },
      { label: "Total Unit", value: stringValue(row[columnKey("Total Unit")] || row.totalUnit) },
      { label: "Maximum Power(W)", value: stringValue(row[columnKey("Maximum Power(W)")] || row.maximumPower) },
      { label: "Station Id", value: stringValue(row[columnKey("Station Id")] || row.stationId) },
      { label: "Time", value: stringValue(row[columnKey("Time")] || row[columnKey("Create Time")] || row.createTime || row.time) }
    ].filter((field) => field.value),
    footer: "Beverly by ACOB"
  };
  return model;
}

export function receiptHtml(model) {
  const rows = model.fields.map((field) => `<tr><td>${field.label}</td><td>${field.value}</td></tr>`).join("");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${model.title}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #222; }
    .receipt { width: 720px; max-width: 100%; margin: 0 auto; border: 1px solid #d7dbe3; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 0 0 18px; color: #666; }
    table { width: 100%; border-collapse: collapse; }
    td { border-bottom: 1px solid #eceff5; padding: 10px 0; font-size: 14px; }
    td:first-child { width: 220px; color: #666; }
    .footer { margin-top: 18px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <section class="receipt">
    <h1>${model.title}</h1>
    <p>${model.subtitle}</p>
    <table>${rows}</table>
    <div class="footer">${model.footer}</div>
  </section>
</body>
</html>`;
}

export function buildReceiptPdfBytes(model) {
  const textLines = [model.title, model.subtitle, ...model.fields.map((field) => `${field.label}: ${field.value}`), model.footer];
  const content = [
    "BT",
    "/F1 18 Tf",
    "50 770 Td",
    ...textLines.flatMap((line, index) => (index === 0
      ? [`(${String(line).replace(/[()\\]/g, "\\$&")}) Tj`]
      : ["0 -22 Td", `(${String(line).replace(/[()\\]/g, "\\$&")}) Tj`])),
    "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
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
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function downloadReceiptPdf(model) {
  const bytes = buildReceiptPdfBytes(model);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${model.title}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function openBrowserPrint(model) {
  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(receiptHtml(model));
  popup.document.close();
  popup.focus();
  popup.print();
  return true;
}
