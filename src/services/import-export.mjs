function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeSheetName(value) {
  return String(value || "Export")
    .replace(/[\[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "Export";
}

function exportDateStamp(now = new Date()) {
  return now.toISOString().replace("T", " ").slice(0, 19);
}

function sanitizeCell(value) {
  const text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) return `'${text}`;
  return text;
}

function csvCell(value) {
  return `"${sanitizeCell(value).replace(/"/g, "\"\"")}"`;
}

function valueForHeader(row, header, columnKey) {
  const key = columnKey(header);
  if (row[key] !== undefined && row[key] !== null) return row[key];
  const exactKey = Object.keys(row).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  if (exactKey) return row[exactKey];
  return "";
}

function exportMetadata(route, rows) {
  return [
    ["Report", route?.title || "Export"],
    ["Route", route?.hash || ""],
    ["Generated At", exportDateStamp()],
    ["Rows", rows.length],
    ["System", "Beverly Energy Operations"],
    []
  ];
}

function numericSummaryRows(columns, rows) {
  return columns
    .map((column) => {
      const key = column.key || column;
      const label = column.label || column.key || column;
      const values = rows
        .map((row) => Number(typeof column.value === "function" ? column.value(row) : row[key]))
        .filter((value) => Number.isFinite(value));
      if (!values.length) return null;
      const total = values.reduce((sum, value) => sum + value, 0);
      return [label, "Total", total.toLocaleString(undefined, { maximumFractionDigits: 3 })];
    })
    .filter(Boolean);
}

function inferExcelType(value) {
  const text = String(value ?? "").trim();
  if (!text) return "String";
  if (/^-?\d+(\.\d+)?$/.test(text) && !/^0\d+/.test(text)) return "Number";
  return "String";
}

function excelCell(value, styleId = "") {
  const safeValue = sanitizeCell(value);
  const type = inferExcelType(safeValue);
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  return `<Cell${style}><Data ss:Type="${type}">${escapeXml(safeValue)}</Data></Cell>`;
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsText(file);
  });
}

export function exportHeaders(route) {
  return route.columns.filter((column) => column !== "Actions");
}

export function exportCsvText(route, rows, columnKey) {
  const headers = exportHeaders(route);
  const lines = [
    ...exportMetadata(route, rows).map((line) => line.map(csvCell).join(",")),
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(valueForHeader(row, header, columnKey))).join(","))
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function exportExcelXml(route, rows, columnKey) {
  const headers = exportHeaders(route);
  const metadataRows = exportMetadata(route, rows)
    .map((line) => `<Row>${line.map((value, index) => excelCell(value, index === 0 ? "MetaLabel" : "MetaValue")).join("")}</Row>`)
    .join("");
  const headerCells = headers.map((header) => excelCell(header, "Header")).join("");
  const rowCells = rows.map((row, index) => `<Row ss:AutoFitHeight="1">${headers.map((header) => excelCell(valueForHeader(row, header, columnKey), index % 2 ? "DataAlt" : "Data")).join("")}</Row>`).join("");
  const columnWidths = headers.map(() => `<Column ss:AutoFitWidth="0" ss:Width="132"/>`).join("");
  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#059669" ss:Pattern="Solid"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/></Borders>
    </Style>
    <Style ss:ID="Data">
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1FAE5"/></Borders>
    </Style>
    <Style ss:ID="DataAlt">
      <Interior ss:Color="#F0FDF4" ss:Pattern="Solid"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1FAE5"/></Borders>
    </Style>
    <Style ss:ID="MetaLabel"><Font ss:Bold="1" ss:Color="#0F172A"/></Style>
    <Style ss:ID="MetaValue"><Font ss:Color="#334155"/></Style>
  </Styles>
  <Worksheet ss:Name="${escapeXml(safeSheetName(route.title))}">
    <Table>
      ${columnWidths}
      ${metadataRows}
      <Row>${headerCells}</Row>
      ${rowCells}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <FreezePanes/>
      <FrozenNoSplit/>
      <SplitHorizontal>${exportMetadata(route, rows).length + 1}</SplitHorizontal>
      <TopRowBottomPane>${exportMetadata(route, rows).length + 1}</TopRowBottomPane>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;
}

export function exportReportCsvText(title, columns, rows, metadata = []) {
  const route = { title, hash: metadata.find((item) => item[0] === "Route")?.[1] || "" };
  const summaryRows = numericSummaryRows(columns, rows);
  const metaRows = [
    ...exportMetadata(route, rows),
    ...metadata.filter((line) => Array.isArray(line) && line.length),
    ...(summaryRows.length ? [["Summary", ""] , ...summaryRows] : [])
  ];
  const header = columns.map((column) => csvCell(column.label || column.key || column)).join(",");
  const body = rows.map((row) => columns
    .map((column) => {
      const key = column.key || column;
      return csvCell(typeof column.value === "function" ? column.value(row) : row[key]);
    })
    .join(","));
  return `\uFEFF${[...metaRows.map((line) => line.map(csvCell).join(",")), header, ...body].join("\r\n")}`;
}

export function exportReportExcelXml(title, columns, rows, metadata = []) {
  const route = { title, hash: metadata.find((item) => item[0] === "Route")?.[1] || "" };
  const metaRows = [
    ...exportMetadata(route, rows),
    ...metadata.filter((line) => Array.isArray(line) && line.length)
  ];
  const summaryRows = numericSummaryRows(columns, rows);
  const headerCells = columns.map((column) => excelCell(column.label || column.key || column, "Header")).join("");
  const bodyRows = rows.map((row, index) => `<Row ss:AutoFitHeight="1">${columns.map((column) => {
    const key = column.key || column;
    return excelCell(typeof column.value === "function" ? column.value(row) : row[key], index % 2 ? "DataAlt" : "Data");
  }).join("")}</Row>`).join("");
  const metadataRows = metaRows
    .map((line) => `<Row>${line.map((value, index) => excelCell(value, index === 0 ? "MetaLabel" : "MetaValue")).join("")}</Row>`)
    .join("");
  const summaryXml = summaryRows.length
    ? `<Row>${excelCell("Summary", "MetaLabel")}</Row>${summaryRows.map((line) => `<Row>${line.map((value, index) => excelCell(value, index === 0 ? "MetaLabel" : "MetaValue")).join("")}</Row>`).join("")}`
    : "";
  const columnWidths = columns.map(() => `<Column ss:AutoFitWidth="0" ss:Width="132"/>`).join("");
  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#059669" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Data"><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1FAE5"/></Borders></Style>
    <Style ss:ID="DataAlt"><Interior ss:Color="#F0FDF4" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1FAE5"/></Borders></Style>
    <Style ss:ID="MetaLabel"><Font ss:Bold="1" ss:Color="#0F172A"/></Style>
    <Style ss:ID="MetaValue"><Font ss:Color="#334155"/></Style>
  </Styles>
  <Worksheet ss:Name="${escapeXml(safeSheetName(title))}">
    <Table>
      ${columnWidths}
      ${metadataRows}
      ${summaryXml}
      <Row>${headerCells}</Row>
      ${bodyRows}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <FreezePanes/>
      <FrozenNoSplit/>
      <SplitHorizontal>${metaRows.length + summaryRows.length + 2}</SplitHorizontal>
      <TopRowBottomPane>${metaRows.length + summaryRows.length + 2}</TopRowBottomPane>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;
}

export function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function importTemplateFields(route, columnKey) {
  return exportHeaders(route)
    .filter((header) => !["Status", "Success Rate"].includes(header))
    .map((header) => ({ header, key: columnKey(header) }));
}

function parseDelimitedRows(text, delimiter) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(delimiter).map((value) => value.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((value) => value.trim().replace(/^"|"$/g, "").replace(/""/g, "\""));
    return headers.reduce((row, header, index) => ({ ...row, [header]: values[index] || "" }), {});
  });
}

function parseSpreadsheetXmlRows(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const rows = Array.from(xml.getElementsByTagName("Row"));
  if (rows.length < 2) return [];
  const headers = Array.from(rows[0].getElementsByTagName("Cell")).map((cell) => cell.textContent.trim());
  return rows.slice(1).map((row) => {
    const cells = Array.from(row.getElementsByTagName("Cell")).map((cell) => cell.textContent.trim());
    return headers.reduce((mapped, header, index) => ({ ...mapped, [header]: cells[index] || "" }), {});
  });
}

export async function parseImportFile(file) {
  const text = await readFileText(file);
  const lowerName = String(file.name || "").toLowerCase();
  if (lowerName.endsWith(".csv")) return parseDelimitedRows(text, ",");
  if (lowerName.endsWith(".tsv") || lowerName.endsWith(".txt")) return parseDelimitedRows(text, "\t");
  if (lowerName.endsWith(".xml") || lowerName.endsWith(".xls")) return parseSpreadsheetXmlRows(text);
  return parseDelimitedRows(text, ",");
}

export function validateImportRows(route, importedRows, columnKey) {
  const template = importTemplateFields(route, columnKey);
  const errors = [];
  const rows = importedRows.map((sourceRow, index) => {
    const mapped = {};
    for (const field of template) {
      mapped[field.key] = String(sourceRow[field.header] ?? "").trim();
    }
    const requiredFields = template.filter((field) => !["remark", "phone", "address", "certifiName", "certifiNo"].includes(field.key));
    for (const field of requiredFields) {
      if (!mapped[field.key]) errors.push({ row: index + 2, field: field.header, message: `${field.header} is required` });
    }
    return mapped;
  });
  return { rows, errors };
}

export function buildImportPreview(existingRows, importedRows) {
  const existingKeys = new Set(existingRows.map((row) => Object.values(row).join("|")));
  let added = 0;
  let unchanged = 0;
  for (const row of importedRows) {
    if (existingKeys.has(Object.values(row).join("|"))) unchanged += 1;
    else added += 1;
  }
  return {
    imported: importedRows.length,
    added,
    unchanged
  };
}

export function buildErrorReport(errors) {
  const header = "Row,Field,Message";
  const rows = errors.map((error) => `${error.row},${error.field},${error.message}`);
  return [header, ...rows].join("\n");
}
