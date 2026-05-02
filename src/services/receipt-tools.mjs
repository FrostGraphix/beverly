function stringValue(value) {
  if (value === null || typeof value === "undefined") return "";
  return String(value);
}

const brand = {
  name: "Beverly",
  company: "ACOB Lighting Technology Limited",
  email: "support@acoblighting.com",
  phone: "+234 800 BEVERLY",
  web: "www.acoblighting.com"
};

export function buildReceiptModel(route, row, columnKey, receiptType = "") {
  const totalPaid = stringValue(row[columnKey("Total Paid")] || row.totalPaid);
  
  // Auto-derive receipt title from the route title
  // e.g. "Credit Token Record" -> "Credit Token Receipt"
  const title = receiptType === "cancel"
    ? "Cancel Receipt"
    : route?.title
      ? route.title.replace(/ Record| Table| Task/g, "") + " Receipt"
      : "Transaction Receipt";

  const model = {
    title,
    subtitle: "Energy Operations & Management System",
    amount: totalPaid,
    fields: [
      { label: "Receipt Id", value: stringValue(row[columnKey("Receipt Id")] || row.receiptId || row.id) },
      { label: "Customer Id", value: stringValue(row[columnKey("Customer Id")] || row.customerId) },
      { label: "Customer Name", value: stringValue(row[columnKey("Customer Name")] || row.customerName) },
      { label: "Meter Id", value: stringValue(row[columnKey("Meter Id")] || row.meterId) },
      { label: "Token", value: stringValue(row[columnKey("Token")] || row[columnKey("Token(Recharge)")] || row.token), isToken: true },
      { label: "Total Paid", value: totalPaid },
      { label: "Total Unit", value: stringValue(row[columnKey("Total Unit")] || row.totalUnit) },
      { label: "Maximum Power(W)", value: stringValue(row[columnKey("Maximum Power(W)")] || row.maximumPower) },
      { label: "Station Id", value: stringValue(row[columnKey("Station Id")] || row.stationId) },
      { label: "Time", value: stringValue(row[columnKey("Time")] || row[columnKey("Create Time")] || row.createDate || row.createTime || row.time) }
    ].filter((field) => field.value),
    brand: brand
  };
  return model;
}


export function receiptHtml(model) {
  const fields = model.fields.filter(f => !f.isToken);
  const tokenField = model.fields.find(f => f.isToken);
  
  const receiptId = model.fields.find(f => f.label === "Receipt Id")?.value || "";
  const customerName = model.fields.find(f => f.label === "Customer Name")?.value || "";
  const pageTitle = `${model.title} #${receiptId} - ${customerName} | ${model.brand.name}`;
  
  const fieldRows = fields.map((field) => `
    <div class="field-row">
      <span class="field-label">${field.label}</span>
      <span class="field-value">${field.value}</span>
    </div>
  `).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${pageTitle}</title>

  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #3b82f6;
      --text-main: #374151;
      --text-muted: #6b7280;
      --bg-light: #f9fafb;
      --border: #e5e7eb;
    }
    * { box-sizing: border-box; }
    body { 
      font-family: 'Poppins', sans-serif; 
      margin: 0; 
      padding: 0; 
      background: white;
      color: var(--text-main);
    }
    .receipt { 
      width: 210mm; /* Full A4 width */
      min-height: 297mm; /* Full A4 height */
      margin: 0 auto;
      background: white; 
      padding: 20mm; 
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    @media print {
      .receipt { 
        width: 100%; 
        min-height: 100vh;
        max-width: none; 
        box-shadow: none; 
        border-radius: 0; 
        padding: 15mm; 
      }
    }



    .receipt::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 6px;
      background: linear-gradient(90deg, var(--primary), #60a5fa);
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 24px;
    }
    .brand-mark {
      width: 32px;
      height: 32px;
      background: var(--primary);
      color: white;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
    }
    .brand-name {
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.5px;
    }
    .amount-display {
      margin: 24px 0;
      padding: 20px;
      background: var(--bg-light);
      border-radius: 16px;
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
      font-size: 32px;
      font-weight: 700;
      color: var(--primary);
      display: block;
    }
    .title {
      font-size: 18px;
      font-weight: 600;
      margin: 0;
    }
    .subtitle {
      font-size: 14px;
      color: var(--text-muted);
      margin: 4px 0 0;
    }
    .details {
      margin-bottom: 32px;
    }
    .field-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px dashed var(--border);
    }
    .field-row:last-child { border-bottom: none; }
    .field-label {
      font-size: 13px;
      color: var(--text-muted);
    }
    .field-value {
      font-size: 13px;
      font-weight: 600;
      text-align: right;
    }
    .token-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 20px;
      border-radius: 16px;
      text-align: center;
      margin-bottom: 32px;
    }
    .token-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #3b82f6;
      font-weight: 600;
      margin-bottom: 8px;
      display: block;
    }
    .token-value {
      font-family: monospace;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 2px;
      color: #1e40af;
      word-break: break-all;
    }
    .footer {
      margin-top: auto;
      text-align: center;
      padding-top: 24px;
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
      .receipt { box-shadow: none; border: 1px solid var(--border); width: 100%; max-width: 100%; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="brand">
        <div class="brand-mark">B</div>
        <div class="brand-name">${model.brand.name}</div>
      </div>
      <h1 class="title">${model.title}</h1>
      <p class="subtitle">${model.subtitle}</p>
    </div>

    <div class="amount-display">
      <span class="amount-label">Amount Purchased</span>
      <span class="amount-value">${model.amount}</span>
    </div>

    ${tokenField ? `
    <div class="token-box">
      <span class="token-label">Your Token</span>
      <div class="token-value">${tokenField.value}</div>
    </div>
    ` : ''}

    <div class="details">
      ${fieldRows}
    </div>

    <div class="footer">
      <span class="company-name">${model.brand.company}</span>
      <div class="contact-info">
        ${model.brand.email} &bull; ${model.brand.phone}<br>
        ${model.brand.web}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function buildReceiptPdfBytes(model) {
  // We'll keep the PDF generator simple for now as it's a separate stream-based generator,
  // but we'll update it to include the basic brand info.
  const textLines = [
    model.brand.name.toUpperCase(),
    model.title,
    "--------------------------------",
    `AMOUNT: ${model.amount}`,
    "--------------------------------",
    ...model.fields.map((field) => `${field.label}: ${field.value}`),
    "--------------------------------",
    model.brand.company,
    model.brand.email,
    model.brand.phone
  ];
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 770 Td",
    ...textLines.flatMap((line, index) => (index === 0
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

export function downloadReceiptPdf(model) {
  const receiptId = model.fields.find(f => f.label === "Receipt Id")?.value || "no-id";
  const customerName = model.fields.find(f => f.label === "Customer Name")?.value || "customer";
  const safeName = String(customerName).replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `${model.brand.name}_${model.title.replace(/\s+/g, "_")}_${receiptId}_${safeName}_${timestamp}.pdf`;

  const performExport = () => {
    const opt = {
      margin: 0,
      filename: filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 3, useCORS: true, letterRendering: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    };

    const html = receiptHtml(model);
    window.html2pdf().set(opt).from(html).save().catch(err => {
      console.error("PDF Export failed, using fallback:", err);
      // Fallback
      const bytes = buildReceiptPdfBytes(model);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };


  // Check if html2pdf is already loaded, otherwise load it
  if (window.html2pdf) {
    performExport();
  } else {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.onload = performExport;
    script.onerror = () => {
      console.error("Failed to load html2pdf.js from CDN. Using basic PDF fallback.");
      const bytes = buildReceiptPdfBytes(model);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(element);
    };
    document.head.appendChild(script);
  }
}



export function openBrowserPrint(model, popupWindow = null) {
  const popup = popupWindow || window.open("", "_blank", "width=900,height=700");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(receiptHtml(model));
  popup.document.close();
  popup.focus();
  // Wait for fonts to load before printing
  setTimeout(() => {
    popup.print();
  }, 500);
  return true;
}
