<template>
  <div class="modal-backdrop show" role="dialog" aria-modal="true">
    <form class="modal" @submit.prevent="submit">
      <h2 class="modal-title">{{ title }}</h2>
      <div class="modal-body">
        <p v-if="simpleBody && action !== 'Print'">{{ simpleBody }}</p>
        <div v-if="action === 'Import'" class="modal-grid">
          <label class="modal-field modal-span-two">
            <span>{{ uploadMode ? "Upload File" : "Import File" }}</span>
            <input type="file" :accept="fileAccept" @change="handleImportFile">
          </label>
          <label v-if="showAuthorizationField" class="modal-field modal-span-two">
            <span>Authorization Password</span>
            <input v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off">
          </label>
        </div>
        <div v-else class="modal-grid">
          <label v-for="field in fields" :key="field.name" class="modal-field">
            <span>{{ field.label }}</span>
            <input v-model="form[field.name]" :name="field.name" autocomplete="off">
          </label>
          <label v-if="showAuthorizationField" class="modal-field">
            <span>Authorization Password</span>
            <input v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off">
          </label>
        </div>
        <p v-if="writeAction" class="modal-confirmation">{{ form.confirmationText }}</p>
        <div v-if="action === 'Print'" class="receipt-preview">
          <div class="receipt-toolbar">
            <select v-model="receiptType" class="sort-select">
              <option value="credit">Credit Receipt</option>
              <option value="clear-credit">Clear Credit Receipt</option>
              <option value="clear-tamper">Clear Tamper Receipt</option>
              <option value="cancel">Cancel Receipt</option>
            </select>
            <button class="btn" type="button" @click="downloadPdf">PDF Export</button>
            <button class="btn primary" type="button" @click="printReceipt">Browser Print</button>
          </div>
          <div class="receipt-card">
            <h3>{{ receiptModel.title }}</h3>
            <p>{{ receiptModel.subtitle }}</p>
            <table class="receipt-table">
              <tr v-for="field in receiptModel.fields" :key="field.label">
                <td>{{ field.label }}</td>
                <td>{{ field.value }}</td>
              </tr>
            </table>
            <div class="receipt-footer">{{ receiptModel.footer }}</div>
          </div>
        </div>
        <div v-if="importPreview" class="modal-result">{{ importPreview }}</div>
        <div v-if="error" class="modal-error">{{ error }}</div>
        <div v-if="result" class="modal-result">{{ result }}</div>
        <pre v-if="requestLog" class="modal-log">{{ requestLog }}</pre>
        <pre v-if="responseLog" class="modal-log">{{ responseLog }}</pre>
      </div>
      <div class="modal-actions">
        <button class="btn" type="button" @click="$emit('close')">Cancel</button>
        <button class="btn primary" type="submit">Confirm</button>
      </div>
    </form>
  </div>
</template>

<script>
import { liveWritesAllowed, postApi, uploadApi } from "../services/api";
import { buildErrorReport, buildImportPreview, downloadTextFile, exportCsvText, exportExcelXml, parseImportFile, validateImportRows } from "../services/import-export.mjs";
import { logExportJob, logPrintJob } from "../services/local-jobs.mjs";
import { columnKey, printModelForRoute } from "../services/table-service";
import { normalizeActionResult } from "../services/response-normalizers.mjs";
import { downloadReceiptPdf, openBrowserPrint } from "../services/receipt-tools.mjs";
import { buildWritePayload, confirmationMessage, isWriteEndpoint, needsAuthorizationPassword, validateWriteForm } from "../services/write-helpers.mjs";
import { isFileUploadRoute, uploadAcceptValue, uploadSummary, validateUploadFile } from "../services/upload-policy.mjs";

export default {
  name: "ActionModal",
  props: {
    action: { type: String, required: true },
    route: { type: Object, required: true },
    row: { type: Object, default: () => ({}) },
    rows: { type: Array, default: () => [] }
  },
  data() {
    return {
      form: {
        ...this.row,
        authorizationPassword: "",
        confirmationText: confirmationMessage(this.action, this.route.title)
      },
      result: "",
      error: "",
      requestLog: "",
      responseLog: "",
      importRows: [],
      importErrors: [],
      selectedFile: null,
      uploadPreview: "",
      receiptType: "credit"
    };
  },
  computed: {
    title() {
      if (this.action === "Recharge") return "Transaction Confirmation";
      if (this.action === "Generate Token") return `Generate Token (${this.route.title.replace(" Token", "")})`;
      return `${this.action} ${this.route.title}`;
    },
    simpleBody() {
      if (this.action === "Delete") return `Delete ${this.route.title} record`;
      if (this.action === "Export") return `Export ${this.rows.length || this.route.title.length} records`;
      if (this.action === "Print") return `Print ${this.route.title} receipt`;
      if (this.action === "Close") return `Close ${this.route.title} detail`;
      return "";
    },
    fields() {
      if (this.action === "Import") return this.makeFields(["File Name", "Remark"]);
      if (this.action === "Recharge") return this.makeFields(["Customer Id", "Meter Id", "Amount", "Total Unit"]);
      if (this.action === "Generate Token") return this.makeFields(["Customer Id", "Meter Id", "Remark"]);
      if (this.action === "Add Task" || this.action === "Add Batch Task") return this.makeFields(["Meter Id", "Data Item", "Station Id", "Remark"]);
      return this.route.columns.filter((column) => !["Actions", "Status", "Success Rate"].includes(column)).slice(0, 8).map((column) => ({ name: columnKey(column), label: column }));
    },
    writeAction() {
      return isWriteEndpoint(this.endpoint());
    },
    uploadMode() {
      return this.action === "Import" && isFileUploadRoute(this.route);
    },
    fileAccept() {
      return this.uploadMode ? uploadAcceptValue() : ".csv,.tsv,.txt,.xml,.xls";
    },
    showAuthorizationField() {
      return needsAuthorizationPassword(this.action);
    },
    importPreview() {
      if (this.uploadMode) return this.uploadPreview;
      if (this.action !== "Import" || !this.importRows.length) return "";
      const preview = buildImportPreview(this.rows, this.importRows);
      return `Preview: ${preview.imported} rows, ${preview.added} new, ${preview.unchanged} unchanged`;
    },
    receiptModel() {
      return printModelForRoute(this.route, this.form, this.receiptType);
    }
  },
  methods: {
    makeFields(labels) {
      return labels.map((label) => ({ name: columnKey(label), label }));
    },
    async handleImportFile(event) {
      this.error = "";
      const file = event.target.files?.[0];
      if (!file) return;
      this.form.fileName = file.name;
      this.selectedFile = file;
      if (this.uploadMode) {
        const validationError = validateUploadFile(file);
        if (validationError) {
          this.error = validationError;
          this.uploadPreview = "";
          return;
        }
        this.uploadPreview = uploadSummary(file);
        return;
      }
      const importedRows = await parseImportFile(file);
      const validated = validateImportRows(this.route, importedRows, columnKey);
      this.importRows = validated.rows;
      this.importErrors = validated.errors;
      if (this.importErrors.length) {
        const report = buildErrorReport(this.importErrors);
        downloadTextFile(`${this.route.title}-import-errors.csv`, report, "text/csv;charset=utf-8");
        this.error = `Import has ${this.importErrors.length} validation errors`;
      }
    },
    async printReceipt() {
      openBrowserPrint(this.receiptModel);
      await logPrintJob(this.route, this.receiptModel, "browser", this.receiptType);
      this.result = "Browser print opened";
    },
    async downloadPdf() {
      downloadReceiptPdf(this.receiptModel);
      await logPrintJob(this.route, this.receiptModel, "pdf", this.receiptType);
      this.result = "PDF export ready";
    },
    endpoint() {
      if (this.uploadMode) return "/API/File/Upload";
      if (this.action === "Recharge") return "/api/token/creditToken/generate";
      if (this.action === "Generate Token" && this.route.hash.includes("clear-credit")) return "/api/token/clearCreditToken/generate";
      if (this.action === "Generate Token" && this.route.hash.includes("clear-tamper")) return "/api/token/clearTamperToken/generate";
      if (this.action === "Generate Token" && this.route.hash.includes("set-maximum-power-limit")) return "/api/token/setMaximumPowerLimitToken/generate";
      if ((this.action === "Add Task" || this.action === "Add Batch Task") && this.route.hash.includes("remote-meter-reading")) return "/api/remoteMeterTask/createReadingTask";
      if ((this.action === "Add Task" || this.action === "Add Batch Task") && this.route.hash.includes("remote-meter-control")) return "/api/remoteMeterTask/createControlTask";
      if ((this.action === "Add Task" || this.action === "Add Batch Task") && this.route.hash.includes("remote-meter-token")) return "/api/remoteMeterTask/createTokenTask";
      const moduleName = this.route.hash.includes("gateway") ? "gateway" : this.route.hash.includes("customer") ? "customer" : this.route.hash.includes("tariff") ? "tariff" : this.route.hash.includes("account") ? "account" : "";
      if (!moduleName) return "";
      if (this.action === "Add") return `/api/${moduleName}/create`;
      if (this.action === "Edit") return `/api/${moduleName}/update`;
      if (this.action === "Delete") return `/api/${moduleName}/delete`;
      if (this.action === "Import") return `/api/${moduleName}/import`;
      return "";
    },
    async submit() {
      const endpoint = this.endpoint();
      this.error = "";
      const validationError = this.writeAction ? validateWriteForm(this.action, this.form, this.fields) : "";
      if (validationError) {
        this.error = validationError;
        return;
      }
      if (this.action === "Import" && this.importErrors.length) return;
      if (this.uploadMode && validateUploadFile(this.selectedFile)) {
        this.error = validateUploadFile(this.selectedFile);
        return;
      }
      if (this.action === "Import" && !this.uploadMode && !this.importRows.length) {
        this.error = "Import file is required";
        return;
      }
      if (this.writeAction && !liveWritesAllowed()) {
        this.error = "Writes are blocked until VITE_ALLOW_LIVE_WRITES=true";
        return;
      }
      if (this.action === "Export") {
        const csvText = exportCsvText(this.route, this.rows, columnKey);
        const excelXml = exportExcelXml(this.route, this.rows, columnKey);
        downloadTextFile(`${this.route.title}.csv`, csvText, "text/csv;charset=utf-8");
        downloadTextFile(`${this.route.title}.xls`, excelXml, "application/vnd.ms-excel");
        await logExportJob(this.route, this.rows, "csv");
        await logExportJob(this.route, this.rows, "xls");
        this.result = `Export ready: ${this.rows.length} rows`;
        return;
      }
      const auditMeta = {
        routeHash: this.route.hash,
        action: this.action,
        confirmationText: this.form.confirmationText,
        authorizationProvided: Boolean(this.form.authorizationPassword)
      };
      const payload = this.action === "Import"
        ? buildWritePayload(endpoint, { ...this.form, ...auditMeta, rows: this.importRows, items: this.importRows })
        : this.writeAction ? buildWritePayload(endpoint, { ...this.form, ...auditMeta }) : this.form;
      this.requestLog = endpoint ? JSON.stringify({ endpoint, payload: this.uploadMode ? { ...auditMeta, fileName: this.form.fileName, fileSize: this.selectedFile?.size || 0 } : payload }, null, 2) : "";
      let response = { data: {} };
      if (this.uploadMode) {
        const formData = new FormData();
        formData.append("file", this.selectedFile);
        formData.append("routeHash", this.route.hash);
        formData.append("action", this.action);
        formData.append("confirmationText", this.form.confirmationText);
        formData.append("authorizationProvided", String(Boolean(this.form.authorizationPassword)));
        response = await uploadApi(endpoint, formData);
      } else if (endpoint) {
        response = await postApi(endpoint, payload);
      }
      this.responseLog = JSON.stringify(response, null, 2);
      console.info("[write-request]", this.requestLog);
      console.info("[write-response]", this.responseLog);
      const actionResult = normalizeActionResult(response);
      if (this.action === "Print") {
        this.result = this.receiptModel.fields.length ? this.receiptModel.fields.map((field) => `${field.label}: ${field.value}`).join(" | ") : "Print success";
      } else if (this.uploadMode) {
        this.result = `Upload submitted: ${this.form.fileName}`;
      } else if (this.action === "Import") {
        this.result = `Import submitted: ${this.importRows.length} rows`;
      } else {
        this.result = actionResult.token ? `Token: ${actionResult.token}` : `${this.action} success`;
      }
      this.$emit("done");
    }
  }
};
</script>
