<template>
  <div class="export-toolbar" ref="toolbarRef">
    <BaseButton
      class="export-trigger"
      size="sm"
      :disabled="disabled || !rows.length"
      @click="open = !open"
      :aria-expanded="String(open)"
      aria-haspopup="menu"
    >
      <svg class="export-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span v-if="successFeedback" class="export-check">✓</span>
      <span v-else>Export</span>
    </BaseButton>

    <transition name="export-drop">
      <div v-show="open" class="export-menu" role="menu" aria-label="Export formats">
        <button
          v-for="fmt in formats"
          :key="fmt.id"
          type="button"
          class="export-option"
          role="menuitem"
          :disabled="exporting"
          @click="doExport(fmt.id)"
        >
          <span class="export-option-icon" v-html="fmt.icon"></span>
          <span class="export-option-label">{{ fmt.label }}</span>
          <span class="export-option-ext">{{ fmt.ext }}</span>
        </button>
      </div>
    </transition>
  </div>
</template>

<script>
import BaseButton from "./BaseButton.vue";
import {
  exportReportCsvText,
  exportReportExcelXml,
  exportReportPdfText,
  downloadTextFile
} from "../../services/import-export.mjs";

export default {
  name: "ExportToolbar",
  components: { BaseButton },
  props: {
    rows: { type: Array, required: true },
    columns: { type: Array, required: true },
    title: { type: String, default: "Export" },
    filename: { type: String, default: "beverly-export" },
    disabled: { type: Boolean, default: false }
  },
  data() {
    return {
      open: false,
      exporting: false,
      successFeedback: false,
      formats: [
        { id: "csv", label: "CSV", ext: ".csv", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
        { id: "excel", label: "Excel", ext: ".xls", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>' },
        { id: "pdf", label: "PDF", ext: ".pdf", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
        { id: "json", label: "JSON", ext: ".json", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>' },
        { id: "print", label: "Print", ext: "", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>' }
      ]
    };
  },
  mounted() {
    document.addEventListener("pointerdown", this.handleOutside, true);
    document.addEventListener("keydown", this.handleEsc);
  },
  beforeUnmount() {
    document.removeEventListener("pointerdown", this.handleOutside, true);
    document.removeEventListener("keydown", this.handleEsc);
  },
  methods: {
    handleOutside(e) {
      if (this.open && this.$refs.toolbarRef && !this.$refs.toolbarRef.contains(e.target)) {
        this.open = false;
      }
    },
    handleEsc(e) {
      if (e.key === "Escape" && this.open) this.open = false;
    },
    async doExport(format) {
      if (!this.rows.length) return;
      this.exporting = true;
      this.open = false;

      try {
        const stamp = new Date().toISOString().slice(0, 10);
        const base = `${this.filename}_${stamp}`;

        if (format === "csv") {
          const text = exportReportCsvText(this.title, this.columns, this.rows);
          downloadTextFile(`${base}.csv`, text, "text/csv;charset=utf-8");
        } else if (format === "excel") {
          const xml = exportReportExcelXml(this.title, this.columns, this.rows);
          downloadTextFile(`${base}.xls`, xml, "application/vnd.ms-excel");
        } else if (format === "pdf") {
          const pdf = exportReportPdfText(this.title, this.columns, this.rows);
          downloadTextFile(`${base}.pdf`, pdf, "application/pdf");
        } else if (format === "json") {
          const json = JSON.stringify(this.rows, null, 2);
          downloadTextFile(`${base}.json`, json, "application/json");
        } else if (format === "print") {
          this.printTable();
        }

        this.showSuccess();
      } catch (err) {
        console.error("Export failed:", err);
      } finally {
        this.exporting = false;
      }
    },
    printTable() {
      const headers = this.columns.map((c) => `<th>${c.label || c.key || c}</th>`).join("");
      const body = this.rows
        .map((row) => {
          const cells = this.columns
            .map((col) => {
              const key = col.key || col;
              const val = typeof col.value === "function" ? col.value(row) : row[key];
              return `<td>${val ?? ""}</td>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      const html = `<!DOCTYPE html><html><head><title>${this.title} — Beverly</title><style>
        body{font-family:Inter,system-ui,sans-serif;padding:24px;color:#1e293b}
        h1{font-size:18px;margin:0 0 4px}
        p{font-size:12px;color:#64748b;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th{background:#059669;color:#fff;padding:8px 12px;text-align:left;font-weight:700;text-transform:uppercase;letter-spacing:.04em;font-size:10px}
        td{padding:8px 12px;border-bottom:1px solid #e2e8f0}
        tr:nth-child(even){background:#f8fafc}
        @media print{body{padding:0}}
      </style></head><body>
        <h1>${this.title}</h1>
        <p>Beverly Energy Operations — Generated ${new Date().toLocaleString()}</p>
        <table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>
      </body></html>`;
      const win = window.open("", "_blank", "width=900,height=600");
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
      }
    },
    showSuccess() {
      this.successFeedback = true;
      setTimeout(() => { this.successFeedback = false; }, 2000);
    }
  }
};
</script>

<style scoped>
.export-toolbar { position: relative; display: inline-flex; }

.export-trigger { display: inline-flex; align-items: center; gap: 6px; }
.export-icon { width: 14px; height: 14px; flex-shrink: 0; }
.export-check { color: var(--bev-color-green-600, #059669); font-weight: 700; }

.export-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 120;
  min-width: 180px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: var(--bev-radius-lg, 12px);
  box-shadow: var(--bev-shadow-lg, 0 8px 24px rgba(0,0,0,0.12));
  padding: 4px;
  display: flex;
  flex-direction: column;
}

.export-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: none;
  background: transparent;
  color: var(--text-main, #1e293b);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  border-radius: var(--bev-radius-sm, 6px);
  transition: background 0.15s;
  text-align: left;
  width: 100%;
}
.export-option:hover { background: var(--primary-light, rgba(34,197,94,0.08)); }
.export-option:disabled { opacity: 0.5; cursor: not-allowed; }

.export-option-icon { width: 16px; height: 16px; flex-shrink: 0; color: var(--text-muted, #64748b); }
.export-option-icon svg { width: 100%; height: 100%; }
.export-option-label { flex: 1; font-weight: 500; }
.export-option-ext { font-size: 11px; color: var(--text-muted, #64748b); font-family: var(--bev-font-mono, monospace); }

.export-drop-enter-active, .export-drop-leave-active { transition: opacity 0.15s, transform 0.15s; }
.export-drop-enter-from, .export-drop-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
