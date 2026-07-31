const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const actionModal = fs.readFileSync(path.join(root, "src/components/ActionModalPrint.vue"), "utf8");
const modalStyles = fs.readFileSync(path.join(root, "src/styles/legacy-modals.css"), "utf8");
const receiptTools = fs.readFileSync(path.join(root, "src/services/receipt-tools.mjs"), "utf8");

const receiptToolsNormalized = receiptTools.replace(/\r\n/g, "\n");

assert(
    actionModal.includes('class="receipt-preview-frame"') &&
    !actionModal.includes('class="receipt-preview receipt-preview-standard"') &&
    !actionModal.includes('<div class="modal-body">') &&
    actionModal.includes(':srcdoc="receiptPreviewHtml"') &&
    actionModal.includes("receiptPreviewHtml()") &&
    actionModal.includes("return receiptHtml(this.receiptModel, { theme: this.receiptTheme });"),
  "Receipt modal preview should render the same receipt HTML used by PDF export."
);

assert(
    actionModal.includes("downloadReceiptPdf(this.receiptModel)") &&
    actionModal.includes('<BaseButton variant="primary" @click="printReceipt">') &&
    actionModal.includes("PDF Export") &&
    !actionModal.includes('<BaseButton @click="downloadPdf">') &&
    actionModal.includes('<BaseButton variant="danger" @click="$emit(\'close\')">Cancel</BaseButton>') &&
    actionModal.includes("receiptHtmlFor(model)") &&
    actionModal.includes("buildReceiptFilename(model, extension)"),
  "Receipt modal should feature the primary PDF Export action using downloadReceiptPdf, sharing the receipt model and HTML."
);

assert(
  !modalStyles.includes(".receipt-preview-standard") &&
    modalStyles.includes(".modal-print-receipt .receipt-preview-frame") &&
    modalStyles.includes("height: min(72vh, 700px);") &&
    modalStyles.includes("height: clamp(280px, calc(100dvh - 152px), 700px);") &&
    modalStyles.includes("@media (max-width: 340px)"),
  "Receipt preview iframe should have a stable modal viewport."
);

assert(
  receiptToolsNormalized.includes('body { \n      font-family: Inter, "Segoe UI", Arial, sans-serif;\n      margin: 0; \n      padding: 0;'),
  "Receipt preview and PDF capture should share padding-free page geometry."
);

console.log("receipt-preview-contract ok");
