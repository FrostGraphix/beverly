import assert from "node:assert";
import { buildErrorReport, buildImportPreview, exportCsvText, exportExcelXml, exportReportCsvText, exportReportExcelXml, exportReportPdfText, importErrorMessage, validateImportRows } from "../src/services/import-export.mjs";
import { columnKey } from "../src/services/table-helpers.mjs";

const route = {
  title: "Customer",
  columns: ["Id", "Name", "Phone", "Address", "CertifiName", "CertifiNo", "Remark", "Create Time", "Update Time", "Station Id", "Actions"]
};

const rows = [
  { id: "1", name: "Ada", phone: "0800", address: "TUNGA", certifiName: "", certifiNo: "", remark: "", createTime: "2026-04-28", updateTime: "2026-04-28", stationId: "TUNGA" },
  { id: "2", name: "Bayo", phone: "0801", address: "MUSHA", certifiName: "", certifiNo: "", remark: "=unsafe", createTime: "2026-04-28", updateTime: "2026-04-28", stationId: "MUSHA" }
];

const csv = exportCsvText(route, rows, columnKey);
const xml = exportExcelXml(route, rows, columnKey);
const reportCsv = exportReportCsvText("Risk Report", [{ label: "Name", key: "name" }, { label: "Risk", key: "risk" }], [{ name: "Ada", risk: 12 }], [["Station", "TUNGA"]]);
const reportXml = exportReportExcelXml("Risk Report", [{ label: "Name", key: "name" }, { label: "Risk", key: "risk" }], [{ name: "Ada", risk: 12 }], [["Station", "TUNGA"]]);
const reportPdf = exportReportPdfText("Risk Report", [{ label: "Name", key: "name" }, { label: "Risk", key: "risk" }], [{ name: "Ada", risk: 12 }], [["Station", "TUNGA"]]);
const validated = validateImportRows(route, [
  { Id: "3", Name: "Chris", Phone: "0802", Address: "KYAKALE", CertifiName: "", CertifiNo: "", Remark: "", "Create Time": "2026-04-28", "Update Time": "2026-04-28", "Station Id": "KYAKALE" },
  { Id: "", Name: "Bad", Phone: "", Address: "", CertifiName: "", CertifiNo: "", Remark: "", "Create Time": "", "Update Time": "", "Station Id": "" }
], columnKey);
const customerImportRoute = {
  hash: "#/management/customer",
  title: "Customer",
  columns: ["id", "name", "phone", "address", "certifiName", "certifiNo", "remark", "createDate", "updateDate", "stationId", "Actions"]
};
const customerTemplateValidated = validateImportRows(customerImportRoute, [{
  Id: "47005349023", Name: "VICTORIA ODEGBILE", Phone: "", Address: "BONDU", CertifiName: "", CertifiNo: "P_1", Remark: "", "Create Time": "", "Update Time": "", "Station Id": "BONDU"
}], columnKey);
const preview = buildImportPreview(rows, validated.rows.slice(0, 1));
const report = buildErrorReport(validated.errors);

assert(csv.includes("\"Id\",\"Name\",\"Phone\""));
assert(csv.includes("\"Report\",\"Customer\""));
assert(csv.includes("'=unsafe"));
assert(xml.includes("<Workbook"));
assert(xml.includes("ss:StyleID=\"Header\""));
assert(reportCsv.includes("Risk Report"));
assert(reportCsv.includes("\"Station\",\"TUNGA\""));
assert(reportCsv.includes("\"Risk\",\"Total\",\"12\""));
assert(reportXml.includes("<Workbook"));
assert(reportXml.includes("Summary"));
assert(reportPdf.startsWith("%PDF-1.4"));
assert(reportPdf.includes("Beverly Energy Operations"));
assert.strictEqual(validated.rows.length, 2);
assert(validated.errors.length > 0);
assert.strictEqual(customerTemplateValidated.errors.length, 0);

const duplicateCustomerValidated = validateImportRows(customerImportRoute, [
  { Id: "47005356697", Name: "MOSES ABIOUDUN", Address: "BONDU", CertifiNo: "P_12A", "Station Id": "BONDU" },
  { Id: "47005356697", Name: "MOSES ABIODUN", Address: "BONDU", CertifiNo: "P_12A4", "Station Id": "BONDU" }
], columnKey);
assert.strictEqual(importErrorMessage(duplicateCustomerValidated.errors), "Duplicate Customer IDs: 47005356697");

const accountImportRoute = {
  hash: "#/management/account",
  title: "Account",
  columns: ["customerId", "meterId", "tariffId", "communicationWay", "ctRatio", "remark", "createDate", "updateDate", "stationId", "Actions"]
};
const accountTemplateValidated = validateImportRows(accountImportRoute, [{ "Customer Id": "CUS-001", "Meter Id": "MTR-1001", "Tariff Id": "TAR-01", "CT Ratio": "200/5", Remark: "Primary feeder account", "Station Id": "ST-01" }], columnKey);
assert.strictEqual(accountTemplateValidated.errors.length, 0);

const duplicateImportCases = [
  ["#/management/gateway", ["id"], "Duplicate Gateway IDs"],
  ["#/management/tariff", ["id"], "Duplicate Tariff IDs"],
  ["#/management/account", ["customerId", "meterId"], "Duplicate Accounts"],
  ["#/admin/user", ["userId"], "Duplicate User IDs"],
  ["#/admin/meter", ["meterId"], "Duplicate Meter IDs"],
  ["#/protocol/dlms", ["id"], "Duplicate DLMS IDs"]
];
for (const [hash, fields, summary] of duplicateImportCases) {
  const duplicateRows = fields.reduce((row, field) => ({ ...row, [field]: `${field}-001` }), {});
  const result = validateImportRows({ hash, title: hash, columns: [...fields, "Actions"] }, [duplicateRows, duplicateRows], columnKey);
  assert.strictEqual(result.errors.at(-1).message, `${summary}: ${fields.map((field) => `${field}-001`).join(" / ")} (first: row 2)`);
}
assert.strictEqual(preview.added, 1);
assert(report.includes("Row,Field,Message"));

console.log(JSON.stringify({
  csvLines: csv.split("\n").length,
  importErrors: validated.errors.length,
  previewAdded: preview.added,
  status: "import export passed"
}, null, 2));
