<template>
  <div class="modal-backdrop show" role="dialog" aria-modal="true">
    <form class="modal" @submit.prevent="submit">
      <h2 class="modal-title">{{ title }}</h2>
      <div class="modal-body">
        <p v-if="simpleBody && action !== 'Print'">{{ simpleBody }}</p>
        <div v-if="isRemoteTaskFlow" class="token-flow">
          <div class="modal-grid">
            <label class="modal-field">
              <span>Customer Id</span>
              <input v-model="form.customerId" :readonly="action !== 'Add Batch Task'">
            </label>
            <label class="modal-field">
              <span>Customer Name</span>
              <input v-model="form.customerName" :readonly="action !== 'Add Batch Task'">
            </label>
            <label class="modal-field">
              <span>Meter Id</span>
              <input v-model="form.meterId" :readonly="action !== 'Add Batch Task'">
            </label>
            <label class="modal-field">
              <span>Station Id</span>
              <input v-model="form.stationId" :readonly="action !== 'Add Batch Task'">
            </label>
            <label class="modal-field">
              <span>Data Item</span>
              <select v-model="form.dataItem">
                <option v-for="option in remoteDataOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label v-if="isRemoteTokenTask" class="modal-field">
              <span>Token</span>
              <input v-model="form.token" autocomplete="off">
            </label>
            <label class="modal-field" :class="{ 'modal-span-two': !isRemoteTokenTask }">
              <span>Remark</span>
              <input v-model="form.remark" autocomplete="off">
            </label>
            <label class="modal-field">
              <span>Authorization Password</span>
              <input v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off">
            </label>
          </div>
          <p v-if="action === 'Add Batch Task'" class="token-helper">Batch rows: {{ remoteBatchCount }}</p>
        </div>
        <div v-else-if="isTokenFlow" class="token-flow">
          <div class="modal-grid">
            <label class="modal-field">
              <span>Customer Id</span>
              <input v-model="form.customerId" readonly>
            </label>
            <label class="modal-field">
              <span>Customer Name</span>
              <input v-model="form.customerName" readonly>
            </label>
            <label class="modal-field">
              <span>Meter Id</span>
              <input v-model="form.meterId" readonly>
            </label>
            <label class="modal-field">
              <span>Tariff Id</span>
              <input v-model="form.tariffId" readonly>
            </label>
            <template v-if="isCreditToken">
              <label class="modal-field">
                <span>Debt Percent</span>
                <select v-model="form.payDebtPercent">
                  <option v-for="value in debtPercents" :key="value" :value="value">{{ value }}</option>
                </select>
              </label>
              <label class="modal-field">
                <span>Purchase Way</span>
                <select v-model="form.purchaseWay">
                  <option v-for="option in purchaseWays" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </label>
              <label class="modal-field">
                <span>Total Paid(MMK)</span>
                <input v-model="form.amount" type="number" min="0" step="0.01" :readonly="form.purchaseWay === 'unit'">
              </label>
              <label class="modal-field">
                <span>Total Unit(kWh)</span>
                <input v-model="form.totalUnit" type="number" min="0" step="0.1" :readonly="form.purchaseWay !== 'unit'">
              </label>
              <label class="modal-field">
                <span>Payment Method</span>
                <select v-model="form.paymentMethod">
                  <option v-for="method in paymentMethods" :key="method" :value="method">{{ method }}</option>
                </select>
              </label>
            </template>
            <template v-else>
              <label v-if="isMaximumPowerToken" class="modal-field">
                <span>Maximum Power(W)</span>
                <input v-model="form.maximumPower" type="number" min="0" step="1">
              </label>
              <label class="modal-field" :class="{ 'modal-span-two': !isMaximumPowerToken }">
                <span>Remark</span>
                <input v-model="form.remark" autocomplete="off">
              </label>
            </template>
            <label class="modal-field">
              <span>Authorization Password</span>
              <input v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off">
            </label>
          </div>
          <p v-if="isCreditToken && tokenPriceText" class="token-helper">{{ tokenPriceText }}</p>
          <div v-if="tokenPreviewFields.length" class="token-result">
            <h3>Preview Result</h3>
            <dl>
              <template v-for="field in tokenPreviewFields">
                <dt :key="`${field[0]}-preview-label`">{{ field[0] }}</dt>
                <dd :key="`${field[0]}-preview-value`">{{ field[1] }}</dd>
              </template>
            </dl>
          </div>
          <div v-if="tokenFinalFields.length" class="token-result final">
            <h3>Token Result</h3>
            <dl>
              <template v-for="field in tokenFinalFields">
                <dt :key="`${field[0]}-final-label`">{{ field[0] }}</dt>
                <dd :key="`${field[0]}-final-value`">{{ field[1] }}</dd>
              </template>
            </dl>
          </div>
        </div>
        <div v-else-if="action === 'Import'" class="modal-grid">
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
        <template v-if="isRemoteTaskFlow">
          <button class="btn primary" type="button" :disabled="tokenLoading || Boolean(remoteTaskFormError)" @click="confirmRemoteTask">Confirm</button>
        </template>
        <template v-else-if="isTokenFlow">
          <button class="btn primary" type="button" :disabled="tokenLoading || Boolean(tokenFormError)" @click="previewToken">Preview</button>
          <button class="btn primary" type="button" :disabled="tokenLoading || !tokenPreview || Boolean(tokenFormError)" @click="confirmToken">Confirm</button>
        </template>
        <button v-else class="btn primary" type="submit">Confirm</button>
      </div>
    </form>
  </div>
</template>

<script>
import { buildErrorReport, buildImportPreview, downloadTextFile, exportCsvText, exportExcelXml, parseImportFile, validateImportRows } from "../services/import-export.mjs";
import { logExportJob, logPrintJob } from "../services/local-jobs.mjs";
import { columnKey, printModelForRoute } from "../services/table-service";
import { actionEndpoint, submitRouteAction } from "../services/action-service.mjs";
import { liveWritesAllowed, postApi } from "../services/api.js";
import { downloadReceiptPdf, openBrowserPrint } from "../services/receipt-tools.mjs";
import { confirmationMessage, isWriteEndpoint, needsAuthorizationPassword } from "../services/write-helpers.mjs";
import { isFileUploadRoute, uploadAcceptValue, uploadSummary, validateUploadFile } from "../services/upload-policy.mjs";
import {
  buildTokenPayload,
  calculateTokenAmount,
  calculateTokenUnits,
  findTariff,
  isCreditTokenRoute,
  isTokenGenerateAction,
  parseTariffUnitPrice,
  paymentMethods,
  purchaseWays,
  tokenEndpoint,
  tokenResultFields,
  tokenValidationError
} from "../services/token-flow.mjs";
import {
  buildRemoteTaskPayload,
  defaultRemoteDataItem,
  isRemoteTaskAction,
  remoteTaskEndpoint,
  remoteTaskKind,
  remoteTaskOptions,
  remoteTaskTitle,
  remoteTaskValidationError
} from "../services/remote-task-flow.mjs";

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
        amount: this.row.amount || "",
        totalUnit: this.row.totalUnit || "",
        payDebtPercent: this.row.payDebtPercent || "0",
        purchaseWay: this.row.purchaseWay || "paid",
        paymentMethod: this.row.paymentMethod || "Cash",
        maximumPower: this.row.maximumPower || "",
        dataItem: this.row.dataItem || defaultRemoteDataItem(this.route),
        token: this.row.token || this.row.data || "",
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
      receiptType: "credit",
      tariffs: [],
      tokenPreview: null,
      tokenFinal: null,
      tokenLoading: false,
      debtPercents: ["0", "10", "20", "30", "50", "100"],
      purchaseWays,
      paymentMethods
    };
  },
  computed: {
    title() {
      if (this.isRemoteTaskFlow) return remoteTaskTitle(this.route, this.action);
      if (this.action === "Recharge") return "Recharge";
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
      return this.route.columns.filter((column) => !["Actions", "Status", "status", "Success Rate", "successRate"].includes(column)).slice(0, 8).map((column) => ({ name: columnKey(column), label: column }));
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
    },
    isTokenFlow() {
      return isTokenGenerateAction(this.route, this.action);
    },
    isCreditToken() {
      return isCreditTokenRoute(this.route);
    },
    isMaximumPowerToken() {
      return String(this.route.hash || "").includes("set-maximum-power-limit");
    },
    selectedTariff() {
      return findTariff(this.tariffs, this.form.tariffId);
    },
    tokenUnitPrice() {
      return parseTariffUnitPrice(this.selectedTariff?.price);
    },
    tokenPriceText() {
      if (!this.form.tariffId) return "";
      if (!this.selectedTariff) return "Tariff data is missing";
      if (!this.tokenUnitPrice) return "Tariff price is invalid";
      return `Tariff price: ${this.tokenUnitPrice} MMK/kWh`;
    },
    tokenFormError() {
      return tokenValidationError(this.route, this.form, this.selectedTariff);
    },
    tokenPreviewFields() {
      return tokenResultFields(this.tokenPreview);
    },
    tokenFinalFields() {
      return tokenResultFields(this.tokenFinal);
    },
    isRemoteTaskFlow() {
      return isRemoteTaskAction(this.route, this.action);
    },
    isRemoteTokenTask() {
      return remoteTaskKind(this.route) === "token";
    },
    remoteDataOptions() {
      return remoteTaskOptions[remoteTaskKind(this.route)];
    },
    remoteBatchCount() {
      return this.rows.filter((row) => row?.meterId).length;
    },
    remoteTaskFormError() {
      return remoteTaskValidationError(this.route, this.form);
    }
  },
  watch: {
    "form.amount"() {
      this.syncTokenCalculation("amount");
    },
    "form.totalUnit"() {
      this.syncTokenCalculation("unit");
    },
    "form.purchaseWay"() {
      this.syncTokenCalculation("mode");
    },
    tariffs() {
      this.syncTokenCalculation("tariff");
    }
  },
  created() {
    if (this.isTokenFlow) this.loadTariffs();
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
      return actionEndpoint(this.route, this.action, this.uploadMode);
    },
    normalizeRows(response) {
      const data = response?.data;
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data?.list)) return data.list;
      if (Array.isArray(response?.rows)) return response.rows;
      return [];
    },
    async loadTariffs() {
      if (!this.isCreditToken && !this.isMaximumPowerToken) return;
      try {
        const response = await postApi("/api/tariff/read", {});
        this.tariffs = this.normalizeRows(response);
      } catch (error) {
        this.error = error?.message || "Tariff data failed";
      }
    },
    syncTokenCalculation(source) {
      if (!this.isCreditToken) return;
      const tariff = this.selectedTariff;
      if (!tariff) return;
      if (this.form.purchaseWay === "unit") {
        if (source === "amount") return;
        const amount = calculateTokenAmount(this.form.totalUnit, tariff);
        if (amount !== "" && String(this.form.amount) !== amount) this.form.amount = amount;
        return;
      }
      if (source === "unit") return;
      const totalUnit = calculateTokenUnits(this.form.amount, tariff);
      if (totalUnit !== "" && String(this.form.totalUnit) !== totalUnit) this.form.totalUnit = totalUnit;
    },
    async previewToken() {
      this.error = "";
      this.result = "";
      this.tokenFinal = null;
      const validationError = this.tokenFormError;
      if (validationError) {
        this.error = validationError;
        return;
      }
      this.tokenLoading = true;
      try {
        const endpoint = tokenEndpoint(this.route, this.action);
        const payload = buildTokenPayload(this.route, this.form, { isPreview: true });
        this.requestLog = JSON.stringify({ endpoint, payload }, null, 2);
        const response = await postApi(endpoint, payload);
        this.responseLog = JSON.stringify(response, null, 2);
        this.tokenPreview = response;
      } catch (error) {
        this.error = error?.message || "Preview failed";
      } finally {
        this.tokenLoading = false;
      }
    },
    async confirmToken() {
      this.error = "";
      if (!this.tokenPreview) {
        this.error = "Preview is required";
        return;
      }
      const validationError = this.tokenFormError;
      if (validationError) {
        this.error = validationError;
        return;
      }
      if (!liveWritesAllowed()) {
        this.error = "Writes are blocked until VITE_ALLOW_LIVE_WRITES=true";
        return;
      }
      this.tokenLoading = true;
      try {
        const endpoint = tokenEndpoint(this.route, this.action);
        const payload = buildTokenPayload(this.route, this.form, { isPreview: false });
        this.requestLog = JSON.stringify({ endpoint, payload }, null, 2);
        const response = await postApi(endpoint, payload);
        this.responseLog = JSON.stringify(response, null, 2);
        this.tokenFinal = response;
        this.result = "Token generated";
      } catch (error) {
        this.error = error?.message || "Token failed";
      } finally {
        this.tokenLoading = false;
      }
    },
    async confirmRemoteTask() {
      this.error = "";
      this.result = "";
      const validationError = this.remoteTaskFormError;
      if (validationError) {
        this.error = validationError;
        return;
      }
      if (!liveWritesAllowed()) {
        this.error = "Writes are blocked until VITE_ALLOW_LIVE_WRITES=true";
        return;
      }
      this.tokenLoading = true;
      try {
        const endpoint = remoteTaskEndpoint(this.route);
        const payload = buildRemoteTaskPayload(this.route, this.action, this.form, this.rows);
        this.requestLog = JSON.stringify({ endpoint, payload }, null, 2);
        const response = await postApi(endpoint, payload);
        this.responseLog = JSON.stringify(response, null, 2);
        this.result = `${payload.length} task submitted`;
        this.$emit("done");
      } catch (error) {
        this.error = error?.message || "Task failed";
      } finally {
        this.tokenLoading = false;
      }
    },
    async submit() {
      this.error = "";
      if (this.isRemoteTaskFlow) {
        await this.confirmRemoteTask();
        return;
      }
      if (this.isTokenFlow) {
        await this.previewToken();
        return;
      }
      if (this.action === "Import" && this.importErrors.length) return;
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
      try {
        const actionResult = await submitRouteAction(this.route, this.action, this.form, {
          fields: this.fields,
          importRows: this.importRows,
          selectedFile: this.selectedFile,
          uploadMode: this.uploadMode
        });
        this.requestLog = JSON.stringify(actionResult.requestLog, null, 2);
        this.responseLog = JSON.stringify(actionResult.responseLog, null, 2);
        console.info("[write-request]", this.requestLog);
        console.info("[write-response]", this.responseLog);
        if (this.action === "Print") {
          this.result = this.receiptModel.fields.length ? this.receiptModel.fields.map((field) => `${field.label}: ${field.value}`).join(" | ") : "Print success";
        } else if (this.uploadMode) {
          this.result = `Upload submitted: ${this.form.fileName}`;
        } else if (this.action === "Import") {
          this.result = `Import submitted: ${this.importRows.length} rows`;
        } else {
          this.result = actionResult.resultText;
        }
        this.$emit("done");
      } catch (error) {
        this.error = error?.message || "Action failed";
      }
    }
  }
};
</script>
