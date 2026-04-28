function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    headers.join(","),
    ...rows.map((row) => headers.map((header) => `"${String(row[columnKey(header)] ?? "").replace(/"/g, "\"\"")}"`).join(","))
  ];
  return lines.join("\n");
}

export function exportExcelXml(route, rows, columnKey) {
  const headers = exportHeaders(route);
  const headerCells = headers.map((header) => `<Cell><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`).join("");
  const rowCells = rows.map((row) => `<Row>${headers.map((header) => `<Cell><Data ss:Type="String">${escapeXml(row[columnKey(header)] ?? "")}</Data></Cell>`).join("")}</Row>`).join("");
  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="${escapeXml(route.title)}">
    <Table>
      <Row>${headerCells}</Row>
      ${rowCells}
    </Table>
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
