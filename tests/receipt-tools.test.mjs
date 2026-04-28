import assert from "node:assert";
import { buildReceiptModel, buildReceiptPdfBytes, receiptHtml } from "../src/services/receipt-tools.mjs";
import { columnKey } from "../src/services/table-helpers.mjs";

const route = {
  title: "Credit Token Record",
  hash: "#/token-record/credit-token-record",
  columns: ["Receipt Id", "Customer Id", "Customer Name", "Meter Id", "Total Paid", "Total Unit", "Token(Recharge)", "Station Id", "Time", "Actions"]
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
  time: "2026-04-28 10:29:23"
};

const model = buildReceiptModel(route, row, columnKey, "cancel");
const html = receiptHtml(model);
const pdfBytes = buildReceiptPdfBytes(model);

assert.strictEqual(model.title, "Cancel Receipt");
assert(model.fields.some((field) => field.label === "Token"));
assert(html.includes("<!doctype html>"));
assert.strictEqual(String.fromCharCode(...pdfBytes.slice(0, 8)), "%PDF-1.4");

console.log(JSON.stringify({
  receiptFields: model.fields.length,
  pdfBytes: pdfBytes.length,
  status: "receipt tools passed"
}, null, 2));
