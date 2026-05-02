<template>
  <div class="modal-backdrop show" role="dialog" aria-modal="true">
    <form class="modal" @submit.prevent="submit">
      <div class="modal-header">
        <h2 class="modal-title">{{ isCreateAction ? 'Create' : (action === 'Edit' ? 'Update' : title) }}</h2>
        <button class="modal-close" type="button" aria-label="Close" @click="$emit('close')">&#10005;</button>
      </div>
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

            <label v-if="remoteTaskRequiresAuthorization" class="modal-field">
              <span>Authorization Password</span>
              <input v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off">
            </label>
          </div>
          <p v-if="action === 'Add Batch Task'" class="token-helper">Batch rows: {{ remoteBatchCount }}</p>
        </div>
        <div v-else-if="isTokenFlow" class="token-flow" :class="{ 'token-flow-enterprise': isCreditToken && tokenStep === 'confirm' }">
          <div v-if="isCreditToken && tokenStep === 'confirm'" class="token-confirmation enterprise-confirmation">
            <section class="enterprise-reference-summary" aria-label="Transaction confirmation details">
              <div class="enterprise-reference-rows">
                <p v-for="field in creditConfirmationFields" :key="`${field[0]}-reference-row`" :class="{ 'total': field[0] === 'Total Paid(MMK)' }">
                  <span>{{ field[0] }}</span>
                  <strong>{{ field[1] }}</strong>
                </p>
              </div>
            </section>

            <section class="enterprise-approval" aria-label="Approval controls">
              <label class="modal-field enterprise-field">
                <span>Payment Method</span>
                <select v-model="form.paymentMethod">
                  <option v-for="method in paymentMethods" :key="method" :value="method">{{ method }}</option>
                </select>
              </label>
              <label class="modal-field enterprise-field">
                <span>Authorization Password</span>
                <input v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off" placeholder="Required for live write">
              </label>
              <div class="enterprise-approval-note">
                <strong>Approval required</strong>
                <span>{{ form.confirmationText }}</span>
              </div>
            </section>
          </div>
          <div v-else class="modal-grid">
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
            </template>
            <template v-else>
              <label v-if="isMaximumPowerToken" class="modal-field">
                <span>Maximum Power(W)</span>
                <input v-model="form.maximumPower" type="number" min="0" step="1">
              </label>
              <label v-if="!isSimpleTokenRoute" class="modal-field" :class="{ 'modal-span-two': !isMaximumPowerToken }">
                <span>Remark</span>
                <input v-model="form.remark" autocomplete="off">
              </label>
            </template>
            <label v-if="!isCreditToken && !isSimpleTokenRoute" class="modal-field">
              <span>Authorization Password</span>
              <input v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off">
            </label>
          </div>
          <p v-if="isCreditToken && tokenPriceText" class="token-helper">{{ tokenPriceText }}</p>
          <div v-if="tokenPreviewFields.length && !(isCreditToken && tokenStep === 'confirm')" class="token-result">
            <h3>Preview Result</h3>
            <dl>
              <div v-for="field in tokenPreviewFields" :key="field[0]" class="token-field-row">
                <dt>{{ field[0] }}</dt>
                <dd>{{ field[1] }}</dd>
              </div>
            </dl>
          </div>
          <div v-if="tokenFinalFields.length" class="token-result final">
            <h3>Token Result</h3>
            <dl>
              <div v-for="field in tokenFinalFields" :key="field[0]" class="token-field-row">
                <dt>{{ field[0] }}</dt>
                <dd>{{ field[1] }}</dd>
              </div>
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
        <div v-else-if="action !== 'Print'" class="modal-grid">
          <label v-for="field in fields" :key="field.name" class="modal-field">
            <span class="modal-field-label">
              <em v-if="field.required" class="req-star">*</em>{{ field.label }}
            </span>
            <select v-if="field.type === 'select'" v-model="form[field.name]" :name="field.name">
              <option value="">Please Select</option>
              <option v-for="option in fieldOptions(field)" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <div v-else-if="field.picker" class="modal-input-group">
              <input v-model="form[field.name]" :name="field.name" autocomplete="off" :readonly="true" :class="'input-readonly'">
              <button class="modal-picker-btn" type="button" @click="handlePicker(field)">...</button>
            </div>
            <input v-else v-model="form[field.name]" :name="field.name" :readonly="field.readonly" :class="{ 'input-readonly': field.readonly }" autocomplete="off">
          </label>
          <label v-if="action === 'Delete'" class="modal-field modal-span-two">
            <span>Delete Confirmation</span>
            <input v-model="form.confirmDelete" type="checkbox">
          </label>
          <label v-if="showAuthorizationField" class="modal-field">
            <span>Authorization Password</span>
            <input v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off">
          </label>
        </div>
        <p v-if="writeAction && !isTokenFlow && !isRemoteTaskFlow && action !== 'Print'" class="modal-confirmation">{{ form.confirmationText }}</p>

        <div v-if="action === 'Print'" class="receipt-preview">
          <div class="receipt-preview-container">

            <div class="receipt-card-premium">
              <div class="receipt-header">
                <div class="receipt-brand">
                  <div class="brand-mark">B</div>
                  <span class="brand-name">Beverly</span>
                </div>
                <h3 class="receipt-title">{{ receiptModel.title }}</h3>
                <p class="receipt-subtitle">{{ receiptModel.subtitle }}</p>
              </div>

              <div class="receipt-amount">
                <span class="amount-label">Amount Purchased</span>
                <span class="amount-value">{{ receiptModel.amount }}</span>
              </div>

              <div v-if="receiptModel.fields.find(f => f.isToken)" class="receipt-token-box">
                <span class="token-label">Your Token</span>
                <div class="token-value">{{ receiptModel.fields.find(f => f.isToken).value }}</div>
              </div>

              <div class="receipt-details">
                <div v-for="field in receiptModel.fields.filter(f => !f.isToken)" :key="field.label" class="detail-row">
                  <span class="detail-label">{{ field.label }}</span>
                  <span class="detail-value">{{ field.value }}</span>
                </div>
              </div>

              <div class="receipt-footer-branding">
                <span class="company-name">{{ receiptModel.brand.company }}</span>
                <div class="contact-line">{{ receiptModel.brand.email }} &bull; {{ receiptModel.brand.phone }}</div>
                <div class="contact-line">{{ receiptModel.brand.web }}</div>
              </div>
            </div>
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
        <template v-if="action === 'Print'">
          <button class="btn" type="button" @click="downloadPdf">
            <svg class="svg-icon" viewBox="0 0 1024 1024"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372zm128-448c0-4.4-3.6-8-8-8h-88v-120c0-4.4-3.6-8-8-8h-48c-4.4 0-8 3.6-8 8v120h-88c-4.4 0-8 3.6-8 8s3.6 8 8 8h88v120c0 4.4 3.6 8 8 8h48c4.4 0 8-3.6 8-8v-120h88c4.4 0 8-3.6 8-8z"></path></svg>
            PDF Export
          </button>
          <button class="btn primary" type="button" @click="printReceipt">
            <svg class="svg-icon" viewBox="0 0 1024 1024"><path d="M820 436h-40V312c0-8.8-7.2-16-16-16H260c-8.8 0-16 7.2-16 16v124h-40c-17.7 0-32 14.3-32 32v240c0 17.7 14.3 32 32 32h40v124c0 8.8 7.2 16 16 16h504c8.8 0 16-7.2 16-16V740h40c17.7 0 32-14.3 32-32V468c0-17.7-14.3-32-32-32zM308 360h408v76H308v-76zm408 536H308V684h408v212zM808 612c-13.3 0-24-10.7-24-24s10.7-24 24-24 24 10.7 24 24-10.7 24-24 24z"></path></svg>
            Browser Print
          </button>
        </template>
        <template v-else-if="isRemoteTaskFlow">
          <button class="btn primary" type="button" :disabled="tokenLoading || Boolean(remoteTaskFormError)" @click="confirmRemoteTask">Confirm</button>
        </template>
        <template v-else-if="isTokenFlow">
          <button class="btn primary" type="button" :disabled="tokenLoading || Boolean(tokenActionError)" @click="handleTokenPrimary">{{ tokenPrimaryLabel }}</button>
        </template>
        <button v-else-if="action !== 'Print'" class="btn primary" type="submit">Confirm</button>
      </div>


    </form>
    <PickerModal
      v-if="activePickerField"
      :api="activePickerField.pickerApi"
      :columns="activePickerField.pickerColumns"
      :column-labels="activePickerField.pickerColumnLabels"
      :label="activePickerField.pickerTitle"
      @close="activePickerField = null"
      @select="onPickerSelect"
    />
  </div>
</template>

<script>
import PickerModal from "./PickerModal.vue";
import { buildErrorReport, buildImportPreview, downloadTextFile, exportCsvText, exportExcelXml, parseImportFile, validateImportRows } from "../services/import-export.mjs";
import { logExportJob, logPrintJob } from "../services/local-jobs.mjs";
import { columnKey, printModelForRoute, tableSiteOptions } from "../services/table-service";
import { actionEndpoint, submitRouteAction } from "../services/action-service.mjs";
import { liveWritesAllowed, postApi } from "../services/api.js";
import { managementFields, managementFormSeed } from "../services/management-forms.mjs";
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
  remoteTaskNeedsAuthorization,
  remoteTaskEndpoint,
  remoteTaskKind,
  remoteTaskOptions,
  remoteTaskTitle,
  remoteTaskValidationError
} from "../services/remote-task-flow.mjs";
import { toastBus, toastSuccess, toastError, toastWarn } from "../services/toast.js";

export default {
  name: "ActionModal",
  components: { PickerModal },
  props: {
    action: { type: String, required: true },
    route: { type: Object, required: true },
    row: { type: Object, default: () => ({}) },
    rows: { type: Array, default: () => [] }
  },
  data() {
    const remoteOptions = remoteTaskOptions[remoteTaskKind(this.route)] || [];
    const rowDataItem = remoteOptions.some((option) => option.value === this.row.dataItem) ? this.row.dataItem : "";
    return {
      form: {
        ...this.row,
        ...managementFormSeed(this.route, this.action, this.row),
        authorizationPassword: "",
        confirmDelete: false,
        amount: this.row.amount || "",
        totalUnit: this.row.totalUnit || "",
        payDebtPercent: this.row.payDebtPercent || "0",
        purchaseWay: this.row.purchaseWay || "paid",
        paymentMethod: this.row.paymentMethod || "Cash",
        maximumPower: this.row.maximumPower || "",
        dataItem: rowDataItem || defaultRemoteDataItem(this.route),
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
      stations: [],
      tariffs: [],
      tokenPreview: null,
      tokenFinal: null,
      tokenStep: "form",
      tokenLoading: false,
      debtPercents: ["0", "10", "20", "30", "50", "100"],
      purchaseWays,
      paymentMethods,
      activePickerField: null
    };
  },
  computed: {
    title() {
      if (this.isRemoteTaskFlow) return remoteTaskTitle(this.route, this.action);
      if (this.isCreditToken && this.tokenStep === "confirm") return "Transaction Confirmation";
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
      const exactManagementFields = managementFields(this.route, this.action);
      if (exactManagementFields.length) return exactManagementFields;
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
      return needsAuthorizationPassword(this.action, this.route);
    },
    importPreview() {
      if (this.uploadMode) return this.uploadPreview;
      if (this.action !== "Import" || !this.importRows.length) return "";
      const preview = buildImportPreview(this.rows, this.importRows);
      return `Preview: ${preview.imported} rows, ${preview.added} new, ${preview.unchanged} unchanged`;
    },
    receiptModel() {
      return printModelForRoute(this.route, this.row);
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
    isSimpleTokenRoute() {
      const hash = String(this.route.hash || "");
      return hash.includes("clear-tamper") || hash.includes("clear-credit") || hash.includes("set-maximum-power-limit");
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
      return tokenValidationError(this.route, this.form, this.selectedTariff, { requireAuthorization: !this.isSimpleTokenRoute });
    },
    tokenPreviewError() {
      return tokenValidationError(this.route, this.form, this.selectedTariff, { requireAuthorization: !this.isCreditToken && !this.isSimpleTokenRoute });
    },
    tokenActionError() {
      if (this.isCreditToken && this.tokenStep === "form") return this.tokenPreviewError;
      if (!this.tokenPreview) return this.tokenPreviewError;
      return this.tokenFormError;
    },
    tokenPrimaryLabel() {
      return this.tokenLoading ? "Processing..." : "Confirm";
    },
    creditConfirmationFields() {
      return [
        ["Customer Id", this.form.customerId],
        ["Customer Name", this.form.customerName],
        ["Meter Id", this.form.meterId],
        ["Pay Debt(MMK)", this.form.payDebtPercent || "0"],
        ["Monthly Charge(MMK)", this.form.monthlyCharge || "0"],
        ["Total Unit(kWh)", this.form.totalUnit],
        ["Total Paid(MMK)", this.form.amount]
      ].filter((field) => field[1] !== undefined && field[1] !== null && field[1] !== "");
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
    isCreateAction() {
      return this.action === "Add" || this.action === "Add Batch Task";
    },
    remoteDataOptions() {
      return remoteTaskOptions[remoteTaskKind(this.route)];
    },
    remoteBatchCount() {
      return this.rows.filter((row) => row?.meterId).length;
    },
    remoteTaskFormError() {
      return remoteTaskValidationError(this.route, this.form, { action: this.action, rows: this.rows });
    },
    remoteTaskRequiresAuthorization() {
      return remoteTaskNeedsAuthorization(this.route);
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
  async created() {
    if (this.fields.some(f => f.name === "stationId")) {
      try {
        const response = await postApi("/api/station/read", { pageNumber: 1, pageSize: 500 });
        const rows = response?.result?.data || response?.data?.data || response?.data || [];
        if (Array.isArray(rows)) {
          this.stations = rows.map(s => ({
            value: String(s.stationId || s.id || s.name || "").toUpperCase(),
            label: s.name || s.stationId || s.id || ""
          }));
        }
        // Ensure the current row's stationId is always in the list
        const currentValue = String(this.form.stationId || "").toUpperCase();
        if (currentValue && !this.stations.some(s => s.value === currentValue)) {
          this.stations.push({ value: currentValue, label: currentValue });
        }
      } catch (error) {
        console.error("ActionModal: Failed to fetch stations", error);
      }
    }
    if (this.isTokenFlow) this.loadTariffs();
  },
  methods: {
    makeFields(labels) {
      return labels.map((label) => ({ name: columnKey(label), label }));
    },
    fieldOptions(field) {
      if (field.name === "stationId") {
        const staticSites = tableSiteOptions.filter(opt => opt.value !== "");
        const combined = [...staticSites];
        for (const station of this.stations) {
          if (!combined.some(s => s.value === station.value)) {
            combined.push(station);
          }
        }
        return combined;
      }
      return [];
    },
    handlePicker(field) {
      this.activePickerField = field;
    },
    onPickerSelect(row) {
      if (!this.activePickerField) return;
      const field = this.activePickerField;
      // Use pickerValueKey if specified, otherwise use the first pickerColumn, then fallback to 'id'
      const valueKey = field.pickerValueKey || field.pickerColumns?.[0] || "id";
      // Find the value using case-insensitive key matching
      let value = row[valueKey];
      if (value === undefined) {
        const actualKey = Object.keys(row).find(k => k.toLowerCase() === valueKey.toLowerCase());
        value = actualKey ? row[actualKey] : undefined;
      }
      // Last resort: try the field name itself
      if (value === undefined) {
        const actualKey = Object.keys(row).find(k => k.toLowerCase() === field.name.toLowerCase());
        value = actualKey ? row[actualKey] : row.id;
      }
      this.form[field.name] = value ?? "";
      
      // Store stationId for cross-validation on the account form
      const rowStationId = row.stationId || row.siteId || row.StationId || "";
      if (field.name === "customerId") {
        this.form.customerStationId = rowStationId;
      } else if (field.name === "meterId") {
        this.form.meterStationId = rowStationId;
      }
      
      this.activePickerField = null;
    },
    formatMoney(value) {
      return Number(value || 0).toLocaleString(undefined, {
        maximumFractionDigits: 2
      });
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
      await logPrintJob(this.route, this.receiptModel, "browser");
      this.result = "Browser print opened";
    },
    async downloadPdf() {
      downloadReceiptPdf(this.receiptModel);
      await logPrintJob(this.route, this.receiptModel, "pdf");
      this.result = "PDF export ready";
    },
    endpoint() {
      return actionEndpoint(this.route, this.action, this.uploadMode);
    },
    normalizeRows(response) {
      const data = response?.data;
      const result = response?.result;
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data?.list)) return data.list;
      if (Array.isArray(result)) return result;
      if (Array.isArray(result?.data)) return result.data;
      if (Array.isArray(result?.list)) return result.list;
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
      this.tokenPreview = null;
      this.tokenFinal = null;
      this.tokenStep = "form";
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
    async handleTokenPrimary() {
      if (this.isCreditToken && this.tokenStep === "form") {
        await this.previewToken();
        return;
      }
      if (!this.tokenPreview) {
        await this.previewToken();
        return;
      }
      await this.confirmToken();
    },
    async previewToken() {
      this.error = "";
      this.result = "";
      this.tokenFinal = null;
      const validationError = this.tokenPreviewError;
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
        if (this.isCreditToken) this.tokenStep = "confirm";
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
      const receiptPopup = typeof window !== "undefined" ? window.open("", "_blank", "width=900,height=700") : null;
      try {
        const endpoint = tokenEndpoint(this.route, this.action);
        const payload = buildTokenPayload(this.route, this.form, { isPreview: false });
        this.requestLog = JSON.stringify({ endpoint, payload }, null, 2);
        const response = await postApi(endpoint, payload);
        this.responseLog = JSON.stringify(response, null, 2);
        this.tokenFinal = response;
        const receiptRow = this.buildTokenReceiptRow(response);
        const receiptModel = printModelForRoute(this.route, receiptRow);
        openBrowserPrint(receiptModel, receiptPopup);
        await logPrintJob(this.route, receiptModel, "auto-token");
        this.result = "Token generated. Receipt opened";
        toastSuccess("Token generated. Receipt opened.");
        this.$emit("done");
      } catch (error) {
        if (receiptPopup && !receiptPopup.closed) receiptPopup.close();
        this.error = error?.message || "Token failed";
        toastError(error?.message || "Token failed");
      } finally {
        this.tokenLoading = false;
      }
    },
    buildTokenReceiptRow(response) {
      const data = response?.data || response?.result || {};
      return {
        ...this.row,
        ...this.form,
        ...data,
        receiptId: data.receiptId || this.form.receiptId || this.row.receiptId || "",
        customerId: this.form.customerId || this.row.customerId || "",
        customerName: this.form.customerName || this.row.customerName || "",
        meterId: this.form.meterId || this.row.meterId || "",
        stationId: this.form.stationId || this.row.stationId || "",
        totalPaid: this.form.amount || data.totalPaid || this.row.totalPaid || "",
        totalUnit: this.form.totalUnit || data.totalUnit || this.row.totalUnit || "",
        token: data.token || this.form.token || this.row.token || "",
        time: data.createTime || data.time || new Date().toISOString().replace("T", " ").slice(0, 19)
      };
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
        // Fallback path: proxy returned 200 but live backend was unavailable
        if (response?.data?.queued === true) {
          this.error = response?.data?.note || "Live backend unavailable — task was not sent to the meter.";
          toastWarn("Meter unreachable. Task was not delivered.");
          return;
        }
        this.result = `${payload.length} task${payload.length > 1 ? "s" : ""} submitted`;
        toastSuccess(`${payload.length} task${payload.length > 1 ? "s" : ""} submitted successfully`);
        this.$emit("done");
      } catch (error) {
        this.error = error?.message || "Task failed";
        toastError(error?.message || "Task failed");
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
        const timestamp = new Date().toISOString().split("T")[0];
        const baseFilename = `Beverly_${this.route.title.replace(/\s+/g, "_")}_${timestamp}`;
        const csvText = exportCsvText(this.route, this.rows, columnKey);
        const excelXml = exportExcelXml(this.route, this.rows, columnKey);
        downloadTextFile(`${baseFilename}.csv`, csvText, "text/csv;charset=utf-8");
        downloadTextFile(`${baseFilename}.xls`, excelXml, "application/vnd.ms-excel");
        await logExportJob(this.route, this.rows, "csv");
        await logExportJob(this.route, this.rows, "xls");
        this.result = `Export ready: ${this.rows.length} rows`;
        toastSuccess(`Export ready — ${this.rows.length} rows downloaded`);
        return;
      }

      try {
        if (this.route.hash.includes("management/account") && (this.action === "Add" || this.action === "Edit")) {
          const customerStation = this.form.customerStationId || "";
          const meterStation = this.form.meterStationId || "";
          if (customerStation && meterStation && customerStation !== meterStation) {
            const msg = `Mismatch: Customer is in ${customerStation}, Meter is in ${meterStation}`;
            this.error = msg;
            toastError(msg);
            return;
          }
        }

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
          toastSuccess(`Upload submitted: ${this.form.fileName}`);
        } else if (this.action === "Import") {
          this.result = `Import submitted: ${this.importRows.length} rows`;
          toastSuccess(`Import submitted — ${this.importRows.length} rows`);
        } else {
          this.result = actionResult.resultText;
          toastSuccess(actionResult.resultText || `${this.action} completed successfully.`);
        }
        this.$emit("done");
      } catch (error) {
        this.error = error?.message || "Action failed";
        toastError(error?.message || "Action failed");
      }
    }
  }
};
</script>
