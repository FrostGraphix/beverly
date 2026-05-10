import assert from "node:assert";
import { buildReceiptModel, buildReceiptPdfBytes, downloadReceiptPdf, receiptHtml } from "../src/services/receipt-tools.mjs";
import { columnKey } from "../src/services/table-helpers.mjs";

const route = {
  title: "Credit Token Record",
  hash: "#/token-record/credit-token-record",
  columns: ["Receipt Id", "Customer Id", "Customer Name", "Meter Id", "Total Paid", "Total Unit", "Token(Recharge)", "Station Id", "Time", "Operator Note", "Actions"]
};

const row = {
  receiptId: "8311",
  customerId: "47005372686",
  customerName: "Mohammed Kaura",
  meterId: "47005372686",
  totalPaid: 500,
  totalUnit: 1.4,
  token: "0021 2636 8628 4408 6688",
  stationId: "TUNGA",
  time: "2026-04-28 10:29:23",
  operatorNote: "Paid at field desk",
  settlementBatch: "BATCH-42"
};

const model = buildReceiptModel(route, row, columnKey, "cancel");
const html = receiptHtml(model);
const pdfBytes = buildReceiptPdfBytes(model);

assert.strictEqual(model.title, "Cancel Receipt");
assert(model.fields.some((field) => field.label === "Token"));
assert(model.fields.some((field) => field.label === "Operator Note"));
assert(model.fields.some((field) => field.label === "Settlement Batch"));
assert(html.includes("<!doctype html>"));
assert(html.includes("@page { size: A4; margin: 0; }"));
assert(html.includes(".receipt::before"));
assert(html.includes(".detail-section"));
assert(html.includes(".token-box"));
assert(html.includes("print-color-adjust: exact"));
assert(!html.includes("fonts.googleapis.com"));
assert.strictEqual(downloadReceiptPdf.constructor.name, "AsyncFunction");
assert.strictEqual(String.fromCharCode(...pdfBytes.slice(0, 8)), "%PDF-1.4");
assert(pdfBytes.length > 900);

console.log(JSON.stringify({
  receiptFields: model.fields.length,
  pdfBytes: pdfBytes.length,
  status: "receipt tools passed"
}, null, 2));
