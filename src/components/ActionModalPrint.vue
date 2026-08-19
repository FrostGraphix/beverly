<template>
  <BaseModalShell tag="form" class="modal modal-print-receipt" @submit.prevent>
    <template #header>
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-action-badge badge-primary">
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/></svg></span>
          </div>
          <h2 class="modal-title">{{ title }}</h2>
        </div>
        <BaseIconButton class="modal-close" aria-label="Close" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </BaseIconButton>
      </div>
    </template>
    <iframe class="receipt-preview-frame" title="Receipt preview" :srcdoc="receiptPreviewHtml"></iframe>
    <p v-if="result" class="modal-result">{{ result }}</p>
    <template #footer>
      <div class="modal-actions">
        <BaseButton variant="primary" @click="printReceipt">
          <svg class="svg-icon" viewBox="0 0 1024 1024"><path d="M880 300H744V128c0-17.7-14.3-32-32-32H312c-17.7 0-32 14.3-32 32v172H144c-17.7 0-32 14.3-32 32v400c0 17.7 14.3 32 32 32h136v112c0 17.7 14.3 32 32 32h400c17.7 0 32-14.3 32-32V764h136c17.7 0 32-14.3 32-32V332c0-17.7-14.3-32-32-32zM352 168h320v132H352V168zm320 688H352V640h320v216zm144-168H744v-64c0-17.7-14.3-32-32-32H312c-17.7 0-32 14.3-32 32v64H144V372h736v316z"></path></svg>
          Print
        </BaseButton>
        <BaseButton @click="downloadPdf">
          <svg class="svg-icon" viewBox="0 0 1024 1024"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372zm128-448c0-4.4-3.6-8-8-8h-88v-120c0-4.4-3.6-8-8-8h-48c-4.4 0-8 3.6-8 8v120h-88c-4.4 0-8 3.6-8 8s3.6 8 8 8h88v120c0 4.4 3.6 8 8 8h48c4.4 0 8-3.6 8-8v-120h88c4.4 0 8-3.6 8-8z"></path></svg>
          PDF Export
        </BaseButton>
        <BaseButton variant="danger" @click="$emit('close')">Cancel</BaseButton>
      </div>
    </template>
  </BaseModalShell>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseModalShell from "./base/BaseModalShell.vue";
import { printModelForRoute } from "../services/table-service";
import { buildReceiptFilename, buildReceiptThemeFromDocument, downloadReceiptPdf, openBrowserPrint, receiptHtml } from "../services/receipt-tools.mjs";
import { logPrintJob } from "../services/local-jobs.mjs";

export default {
  name: "ActionModalPrint",
  components: { BaseButton, BaseIconButton, BaseModalShell },
  props: {
    action: { type: String, required: true },
    route: { type: Object, required: true },
    row: { type: Object, default: () => ({}) },
    rows: { type: Array, default: () => [] }
  },
  emits: ["close", "done"],
  data() {
    return {
      result: "",
      receiptTheme: {},
      receiptThemeObserver: null
    };
  },
  computed: {
    title() { return `${this.action} ${this.receiptModel.title}`; },
    receiptModel() { return printModelForRoute(this.route, this.row); },
    receiptPreviewHtml() { return receiptHtml(this.receiptModel, { theme: this.receiptTheme }); }
  },
  mounted() {
    this.syncReceiptTheme();
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.documentElement) {
      this.receiptThemeObserver = new MutationObserver(() => this.syncReceiptTheme());
      this.receiptThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    }
  },
  beforeUnmount() {
    if (this.receiptThemeObserver) this.receiptThemeObserver.disconnect();
  },
  methods: {
    syncReceiptTheme() { this.receiptTheme = buildReceiptThemeFromDocument(); },
    receiptHtmlFor(model) { return receiptHtml(model, { theme: this.receiptTheme }); },
    buildReceiptFilename(model, extension) { return buildReceiptFilename(model, extension); },
    receiptFilename(model, extension = "html") { return buildReceiptFilename(model, extension); },
    printReceipt() {
      const opened = openBrowserPrint(this.receiptModel);
      this.result = opened ? `Browser print window opened.` : `Browser blocked print window.`;
    },
    async downloadPdf() {
      const result = await downloadReceiptPdf(this.receiptModel);
      await logPrintJob(this.route, this.receiptModel, "pdf", "credit", {
        fileName: this.receiptFilename(this.receiptModel, "pdf"),
        content: this.receiptHtmlFor(this.receiptModel),
        contentType: "text/html;charset=utf-8",
        format: "pdf"
      });
      if (result?.mode === "fallback") {
        this.result = `PDF saved: ${result.filename} (basic format).`;
      } else {
        this.result = `✓ PDF saved automatically: ${result.filename}`;
      }
    }
  }
};
</script>
