const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const actionModal = fs.readFileSync(path.join(root, "src/components/ActionModalPrint.vue"), "utf8");
const modalStyles = fs.readFileSync(path.join(root, "src/styles/legacy-modals.css"), "utf8");

assert(
    actionModal.includes('class="receipt-preview-frame"') &&
    !actionModal.includes('class="receipt-preview receipt-preview-standard"') &&
    !actionModal.includes('<div class="modal-body">') &&
    actionModal.includes(':srcdoc="receiptPreviewHtml"') &&
    actionModal.includes("receiptPreviewHtml()") &&
    actionModal.includes("return receiptHtml(this.receiptModel, { theme: this.receiptTheme });"),
  "Receipt modal preview should render the same receipt HTML used by browser print and PDF export."
);

assert(
    actionModal.includes("downloadReceiptPdf(this.receiptModel)") &&
    actionModal.includes("openBrowserPrint(this.receiptModel)") &&
    actionModal.includes("receiptHtmlFor(model)") &&
    actionModal.includes("buildReceiptFilename(model, extension)"),
  "Receipt preview, PDF export, and browser print should share the standard receipt model and HTML."
);

assert(
  !modalStyles.includes(".receipt-preview-standard") &&
    modalStyles.includes(".modal-print-receipt .receipt-preview-frame") &&
    modalStyles.includes("height: min(72vh, 700px);"),
  "Receipt preview iframe should have a stable modal viewport."
);

console.log("receipt-preview-contract ok");
