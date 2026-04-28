import assert from "node:assert";
import { buildErrorReport, buildImportPreview, exportCsvText, exportExcelXml, validateImportRows } from "../src/services/import-export.mjs";
import { columnKey } from "../src/services/table-helpers.mjs";

const route = {
  title: "Customer",
  columns: ["Id", "Name", "Phone", "Address", "CertifiName", "CertifiNo", "Remark", "Create Time", "Update Time", "Station Id", "Actions"]
};

const rows = [
  { id: "1", name: "Ada", phone: "0800", address: "TUNGA", certifiName: "", certifiNo: "", remark: "", createTime: "2026-04-28", updateTime: "2026-04-28", stationId: "TUNGA" },
  { id: "2", name: "Bayo", phone: "0801", address: "MUSHA", certifiName: "", certifiNo: "", remark: "", createTime: "2026-04-28", updateTime: "2026-04-28", stationId: "MUSHA" }
];

const csv = exportCsvText(route, rows, columnKey);
const xml = exportExcelXml(route, rows, columnKey);
const validated = validateImportRows(route, [
  { Id: "3", Name: "Chris", Phone: "0802", Address: "KYAKALE", CertifiName: "", CertifiNo: "", Remark: "", "Create Time": "2026-04-28", "Update Time": "2026-04-28", "Station Id": "KYAKALE" },
  { Id: "", Name: "Bad", Phone: "", Address: "", CertifiName: "", CertifiNo: "", Remark: "", "Create Time": "", "Update Time": "", "Station Id": "" }
], columnKey);
const preview = buildImportPreview(rows, validated.rows.slice(0, 1));
const report = buildErrorReport(validated.errors);

assert(csv.includes("Id,Name,Phone"));
assert(xml.includes("<Workbook"));
assert.strictEqual(validated.rows.length, 2);
assert(validated.errors.length > 0);
assert.strictEqual(preview.added, 1);
assert(report.includes("Row,Field,Message"));

console.log(JSON.stringify({
  csvLines: csv.split("\n").length,
  importErrors: validated.errors.length,
  previewAdded: preview.added,
  status: "import export passed"
}, null, 2));
