import assert from "node:assert";
import { buildCanonicalReceiptRow, buildReceiptFilename, buildReceiptModel, buildReceiptPdfBytes, downloadReceiptPdf, receiptHtml, requiredReceiptFields, validateReceiptModel } from "../src/services/receipt-tools.mjs";
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
const html = receiptHtml(model, { theme: { primary: "#22c55e", panel: "#020617" } });
const pdfBytes = buildReceiptPdfBytes(model);
const filename = buildReceiptFilename(model, "pdf");

assert.strictEqual(model.title, "Cancel Receipt");
assert(model.fields.some((field) => field.label === "Token"));
assert(model.fields.some((field) => field.label === "Operator Note"));
assert(model.fields.some((field) => field.label === "Settlement Batch"));
assert(html.includes("<!doctype html>"));
assert(html.includes("@page { size: A4; margin: 0; }"));
assert(html.includes(".receipt::before"));
assert(html.includes(".detail-section"));
assert(html.includes(".token-box"));
assert(!html.includes('<div class="summary-grid">'));
assert(!html.includes("<span>Total Paid</span>"));
assert(html.includes("--primary: #22c55e;"));
assert(html.includes("print-color-adjust: exact"));
assert(!html.includes("fonts.googleapis.com"));
assert(filename.endsWith(".pdf"));
assert(filename.includes("Beverly_Cancel_Receipt_8311_mohammed_kaura_"));
assert.strictEqual(downloadReceiptPdf.constructor.name, "AsyncFunction");
assert.strictEqual(String.fromCharCode(...pdfBytes.slice(0, 8)), "%PDF-1.4");
assert(pdfBytes.length > 900);

const canonicalRow = buildCanonicalReceiptRow({
  row: { stationId: "TUNGA" },
  form: {
    customerId: "47005372686",
    customerName: "Mohammed Kaura",
    meterId: "47005372686",
    tariffId: "RESIDENTIAL",
    amount: 500,
    totalUnit: 1.4,
    paymentMethod: "Cash",
    purchaseWay: "paid"
  },
  response: {
    result: {
      receiptId: "1745843400000",
      token: "0021 2636 8628 4408 6688",
      createTime: "2026-04-28 09:47:55"
    }
  },
  tariff: { tariffId: "RESIDENTIAL", price: "0~0~350" },
  actor: { email: "admin@acoblighting.com" }
});
const canonicalModel = buildReceiptModel(route, canonicalRow, columnKey);
const canonicalValidation = validateReceiptModel(canonicalModel);
const canonicalHtml = receiptHtml(canonicalModel);

assert.deepStrictEqual(canonicalValidation.missing, []);
for (const label of requiredReceiptFields) {
  assert(canonicalModel.fields.some((field) => field.label === label), `${label} should exist`);
}
assert(canonicalHtml.includes("Tariff Price"));
assert(canonicalHtml.includes("Payment Method"));
assert(canonicalHtml.includes("Operator / Vendor"));
assert(canonicalHtml.includes("Support Reference"));
assert(canonicalHtml.includes("Audit Status"));

console.log(JSON.stringify({
  receiptFields: model.fields.length,
  canonicalFields: canonicalModel.fields.length,
  pdfBytes: pdfBytes.length,
  status: "receipt tools passed"
}, null, 2));
