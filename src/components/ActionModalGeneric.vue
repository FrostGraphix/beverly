<template>
  <BaseModalShell tag="form" :class="['modal', { 'modal--destructive': action === 'Delete' }]" :role="action === 'Delete' ? 'alertdialog' : 'dialog'" aria-modal="true" @submit.prevent="submit">
    <template #header>
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-action-badge" :class="actionBadgeClass">
            <span v-html="actionIcon"></span>
          </div>
          <h2 class="modal-title">{{ modalHeading }}</h2>
        </div>
        <BaseIconButton class="modal-close" aria-label="Close" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </BaseIconButton>
      </div>
    </template>

    <div class="modal-body">
      <p v-if="simpleBody">{{ simpleBody }}</p>

      <!-- Import -->
      <div v-if="action === 'Import'" class="modal-grid">
        <label class="modal-field modal-span-two">
          <span>{{ uploadMode ? "Upload File" : "Import File" }}</span>
          <BaseInput type="file" :accept="fileAccept" @change="handleImportFile" />
        </label>
        <label v-if="showAuthorizationField" class="modal-field modal-span-two">
          <span>Authorization Password</span>
          <BaseInput v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off" />
        </label>
      </div>

      <!-- Generic field grid (Add, Edit, Delete, Export, etc.) -->
      <div v-else-if="action !== 'Export'" class="modal-grid">
        <div v-for="field in fields" :key="field.name" class="modal-field" :class="{ 'modal-field-full': field.name === 'remark' || field.type === 'password' || field.type === 'permissions' }">
          <span class="modal-field-label">
            <em v-if="field.required" class="req-star">*</em>{{ field.label }}
          </span>
          <!-- Station select -->
          <BaseSelect v-if="field.type === 'select'" v-model="form[field.name]" :name="field.name">
            <option value="">Please Select</option>
            <option v-for="option in fieldOptions(field)" :key="option.value" :value="option.value">{{ option.label }}</option>
          </BaseSelect>
          <!-- Role select (live from API) -->
          <BaseSelect v-else-if="field.type === 'role-select'" v-model="form[field.name]" :name="field.name">
            <option value="">{{ rolesLoading ? 'Loading roles...' : 'Select Role' }}</option>
            <option v-for="r in roles" :key="r.value" :value="r.value">{{ r.label }}</option>
          </BaseSelect>
          <!-- Permissions multi-select picker -->
          <div v-else-if="field.type === 'permissions'" class="perm-picker-wrap">
            <div class="perm-trigger" @click="permOpen = !permOpen">
              <span class="perm-trigger-label">
                <span v-if="permSelectedCount === 0" class="perm-placeholder">Click to select permissions…</span>
                <span v-else class="perm-count-badge">{{ permSelectedCount }} selected</span>
              </span>
              <svg class="perm-chevron" :class="{ open: permOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div v-if="permSelectedCount" class="perm-tags">
              <span v-for="val in permissionsSelected" :key="val" class="perm-tag">
                {{ val.split('.')[1] || val }}
                <BaseIconButton class="perm-tag-del" aria-label="Remove permission" @click.stop="togglePerm(val)">&times;</BaseIconButton>
              </span>
            </div>
            <div v-show="permOpen" class="perm-panel">
              <div class="perm-panel-header">
                <span class="perm-count-info">{{ permSelectedCount }} / {{ rolePermissions.flatMap(g => g.items).length }} selected</span>
                <div class="perm-panel-actions">
                  <BaseButton class="perm-link" size="sm" variant="ghost" @click="selectAllPerms">All</BaseButton>
                  <BaseButton class="perm-link danger" size="sm" variant="danger" @click="clearPerms">Clear</BaseButton>
                </div>
              </div>
              <div class="perm-groups">
                <div v-for="group in rolePermissions" :key="group.group" class="perm-group">
                  <div class="perm-group-label">{{ group.group }}</div>
                  <div class="perm-items">
                    <label v-for="item in group.items" :key="item.value" class="perm-item" :class="{ checked: isPermSelected(item.value) }" @click.prevent="togglePerm(item.value)">
                      <span class="perm-check" :class="{ checked: isPermSelected(item.value) }">
                        <svg v-if="isPermSelected(item.value)" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      </span>
                      {{ item.label }}
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- Password with strength meter -->
          <div v-else-if="field.type === 'password'" class="pw-field-wrap">
            <div class="pw-input-row">
              <BaseInput
                v-model="form[field.name]"
                :type="showPwField ? 'text' : 'password'"
                :name="field.name"
                autocomplete="new-password"
                placeholder="Min 8 characters"
                class="pw-input"
              />
              <BaseIconButton class="pw-eye" aria-label="Toggle password visibility" @click="showPwField = !showPwField">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </BaseIconButton>
            </div>
            <div v-if="form[field.name]" class="pw-strength-row">
              <div class="pw-bars">
                <div v-for="i in 4" :key="i" class="pw-bar" :class="{ filled: pwStrength >= i, strong: pwStrength === 4, medium: pwStrength === 3 }"></div>
              </div>
              <span class="pw-strength-label">{{ pwLabel }}</span>
            </div>
          </div>
          <!-- Picker -->
          <div v-else-if="field.picker" class="modal-input-group">
            <BaseInput v-model="form[field.name]" :name="field.name" autocomplete="off" :readonly="true" class="input-readonly" />
            <BaseButton class="modal-picker-btn" size="sm" @click="handlePicker(field)">...</BaseButton>
          </div>
          <!-- Default text input -->
          <BaseInput v-else v-model="form[field.name]" :name="field.name" :readonly="field.readonly" :class="{ 'input-readonly': field.readonly }" autocomplete="off" />
        </div>
        <label v-if="action === 'Delete'" class="modal-field modal-span-two">
          <span>Delete Confirmation</span>
          <BaseCheckbox v-model="form.confirmDelete">Confirm deletion</BaseCheckbox>
        </label>
        <label v-if="showAuthorizationField" class="modal-field">
          <span>Authorization Password</span>
          <BaseInput v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off" />
        </label>
      </div>

      <p v-if="writeAction" class="modal-confirmation">{{ form.confirmationText }}</p>
      <div v-if="importPreview" class="modal-result">{{ importPreview }}</div>
      <div v-if="preflightRunning" class="modal-result">Validating rows against the live API…</div>
      <div v-else-if="preflight" class="preflight-panel" :class="{ 'has-blocking': preflightBlocking.length }">
        <div class="preflight-head">
          <span class="preflight-title">Live API pre-check</span>
          <span class="preflight-summary">{{ preflightSummaryText }}</span>
        </div>
        <ul v-if="preflightBlocking.length" class="preflight-issues">
          <li v-for="entry in preflightBlocking.slice(0, 5)" :key="`blocking-${entry.line}`">
            <strong>Line {{ entry.line }}</strong> — {{ entry.issue.message }}
          </li>
          <li v-if="preflightBlocking.length > 5" class="preflight-more">
            +{{ preflightBlocking.length - 5 }} more — download the report for the full list
          </li>
        </ul>
        <label v-if="preflightFixes.length" class="preflight-fix">
          <BaseCheckbox v-model="applyMeterStationFix">
            Move {{ preflightFixes.length }} meter(s) to their customer's station first (live change to the meter record)
          </BaseCheckbox>
        </label>
        <label v-if="preflightMissingCustomers.length" class="preflight-fix">
          <BaseCheckbox v-model="createMissingCustomers">
            Create {{ preflightMissingCustomers.length }} missing customer(s) upstream first, then validate and import their accounts
          </BaseCheckbox>
        </label>
        <div class="preflight-actions">
          <BaseButton size="sm" variant="ghost" type="button" @click="downloadPreflightReport">Download report</BaseButton>
        </div>
      </div>
      <div v-if="error" class="modal-error">{{ error }}</div>
      <div v-if="result" class="modal-result">{{ result }}</div>
    </div>

    <template #footer>
      <div class="modal-actions">
        <BaseButton variant="danger" @click="$emit('close')">Cancel</BaseButton>
        <BaseButton :variant="action === 'Delete' ? 'danger' : 'primary'" native-type="submit">{{ action === 'Delete' ? 'Delete' : 'Confirm' }}</BaseButton>
      </div>
    </template>
  </BaseModalShell>
  <PickerModal
    v-if="activePickerField"
    :api="activePickerField.pickerApi"
    :columns="activePickerField.pickerColumns"
    :column-labels="activePickerField.pickerColumnLabels"
    :label="activePickerField.pickerTitle"
    @close="activePickerField = null"
    @select="onPickerSelect"
  />
</template>

<script>
import PickerModal from "./PickerModal.vue";
import BaseButton from "./base/BaseButton.vue";
import BaseCheckbox from "./base/BaseCheckbox.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseModalShell from "./base/BaseModalShell.vue";
import BaseSelect from "./base/BaseSelect.vue";
import { buildErrorReport, buildImportPreview, downloadTextFile, exportCsvText, exportExcelXml, importErrorMessage, parseImportFile, validateImportRows } from "../services/import-export.mjs";
import { alignMeterStations, preflightAccountImport, preflightReportCsv, preflightSummary, provisionAndRecheckAccountImport } from "../services/account-import-preflight.mjs";
import { logExportJob } from "../services/local-jobs.mjs";
import { columnKey, tableSiteOptions } from "../services/table-service";
import { actionEndpoint, submitRouteAction } from "../services/action-service.mjs";
import { postApi } from "../services/api.js";
import { managementFields, managementFormSeed, ROLE_PERMISSIONS } from "../services/management-forms.mjs";
import { confirmationMessage, isWriteEndpoint, needsAuthorizationPassword } from "../services/write-helpers.mjs";
import { userFacingError } from "../services/guarded-write.mjs";
import { isFileUploadRoute, uploadAcceptValue, uploadSummary, validateUploadFile } from "../services/upload-policy.mjs";
import { toastSuccess, toastError } from "../services/toast.js";

export default {
  name: "ActionModalGeneric",
  components: { BaseButton, BaseCheckbox, BaseIconButton, BaseInput, BaseModalShell, BaseSelect, PickerModal },
  props: {
    action: { type: String, required: true },
    route: { type: Object, required: true },
    row: { type: Object, default: () => ({}) },
    rows: { type: Array, default: () => [] }
  },
  emits: ["close", "done"],
  data() {
    return {
      form: {
        ...this.row,
        ...managementFormSeed(this.route, this.action, this.row),
        authorizationPassword: "",
        confirmDelete: false,
        confirmationText: confirmationMessage(this.action, this.route.title)
      },
      result: "",
      error: "",
      requestLog: "",
      responseLog: "",
      importRows: [],
      importErrors: [],
      preflight: null,
      preflightRunning: false,
      applyMeterStationFix: false,
      createMissingCustomers: false,
      selectedFile: null,
      uploadPreview: "",
      stations: [],
      roles: [],
      rolesLoading: false,
      showPwField: false,
      permOpen: false,
      activePickerField: null
    };
  },
  computed: {
    title() {
      if (this.action === "Recharge") return "Recharge";
      return `${this.action} ${this.route.title}`;
    },
    modalHeading() {
      if (this.action === "Add") return "Create";
      if (this.action === "Edit") return "Update";
      return this.title;
    },
    actionBadgeClass() {
      if (this.action === "Delete") return "badge-danger";
      if (this.action === "Edit") return "badge-warning";
      return "badge-primary";
    },
    actionIcon() {
      if (this.action === "Delete") return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
      if (this.action === "Edit")   return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';
    },
    simpleBody() {
      if (this.action === "Delete") return `Delete ${this.route.title} record`;
      if (this.action === "Export") return `Export ${this.rows.length || this.route.title.length} records`;
      if (this.action === "Close") return `Close ${this.route.title} detail`;
      return "";
    },
    fields() {
      if (this.action === "Import") return this.makeFields(["File Name", "Remark"]);
      if (this.action === "Recharge") return this.makeFields(["Customer Id", "Meter Id", "Amount", "Total Unit"]);
      if (this.action === "Generate Token") return this.makeFields(["Customer Id", "Meter Id", "Remark"]);
      const exactManagementFields = managementFields(this.route, this.action);
      if (exactManagementFields.length) return exactManagementFields;
      return this.route.columns.filter((column) => !["Actions", "Status", "status", "Success Rate", "successRate"].includes(column)).slice(0, 8).map((column) => ({ name: columnKey(column), label: column }));
    },
    writeAction() { return isWriteEndpoint(this.endpoint()); },
    uploadMode() { return this.action === "Import" && isFileUploadRoute(this.route); },
    fileAccept() { return this.uploadMode ? uploadAcceptValue() : ".csv,.tsv,.txt,.xml,.xls"; },
    showAuthorizationField() { return needsAuthorizationPassword(this.action, this.route); },
    importPreview() {
      if (this.uploadMode) return this.uploadPreview;
      if (this.action !== "Import" || !this.importRows.length) return "";
      const preview = buildImportPreview(this.rows, this.importRows);
      return `Preview: ${preview.imported} rows, ${preview.added} new, ${preview.unchanged} unchanged`;
    },
    pwStrength() {
      const p = String(this.form.password || "");
      if (!p) return 0;
      let s = 0;
      if (p.length >= 8) s++;
      if (/[A-Z]/.test(p)) s++;
      if (/[0-9]/.test(p)) s++;
      if (/[^A-Za-z0-9]/.test(p)) s++;
      return s;
    },
    pwLabel() { return ["", "Weak", "Fair", "Good", "Strong"][this.pwStrength]; },
    isAccountRoute() { return String(this.route?.hash || "").includes("management/account"); },
    preflightBlocking() { return this.preflight?.blocking || []; },
    preflightFixes() { return this.preflight?.fixes || []; },
    preflightMissingCustomers() { return this.preflight?.missingCustomers || []; },
    preflightSummaryText() { return preflightSummary(this.preflight || {}); },
    rolePermissions() { return ROLE_PERMISSIONS; },
    permissionsSelected() {
      const raw = String(this.form.remark || "");
      return raw ? raw.split(",").map(v => v.trim()).filter(Boolean) : [];
    },
    permSelectedCount() { return this.permissionsSelected.length; }
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
        const currentValue = String(this.form.stationId || "").toUpperCase();
        if (currentValue && !this.stations.some(s => s.value === currentValue)) {
          this.stations.push({ value: currentValue, label: currentValue });
        }
      } catch (error) {
        console.error("ActionModalGeneric: Failed to fetch stations", error);
      }
    }
    if (this.fields.some(f => f.type === "role-select")) this.loadRoles();
  },
  methods: {
    endpoint() { return actionEndpoint(this.route, this.action, this.uploadMode); },
    makeFields(labels) { return labels.map((label) => ({ name: columnKey(label), label })); },
    fieldOptions(field) {
      if (field.name === "stationId") {
        const staticSites = tableSiteOptions.filter(opt => opt.value !== "");
        const combined = [...staticSites];
        for (const station of this.stations) {
          if (!combined.some(s => s.value.toUpperCase() === station.value.toUpperCase())) combined.push(station);
        }
        return combined;
      }
      if (Array.isArray(field.options) && field.options.length) return field.options;
      return [];
    },
    async loadRoles() {
      this.rolesLoading = true;
      try {
        const response = await postApi("/api/role/read", { pageNumber: 1, pageSize: 200 });
        const rows = response?.result?.data || response?.data?.data || response?.data || [];
        if (Array.isArray(rows)) {
          this.roles = rows.map(r => ({
            value: String(r.roleId || r.id || ""),
            label: r.name ? `${r.roleId || r.id} — ${r.name}` : String(r.roleId || r.id || "")
          })).filter(r => r.value);
        }
      } catch (e) {
        console.error("ActionModalGeneric: Failed to fetch roles", e);
      } finally {
        this.rolesLoading = false;
      }
    },
    togglePerm(value) {
      const current = [...this.permissionsSelected];
      const idx = current.indexOf(value);
      if (idx === -1) current.push(value);
      else current.splice(idx, 1);
      this.form.remark = current.join(",");
    },
    isPermSelected(value) { return this.permissionsSelected.includes(value); },
    clearPerms() { this.form.remark = ""; },
    selectAllPerms() {
      const all = ROLE_PERMISSIONS.flatMap(g => g.items.map(i => i.value));
      this.form.remark = all.join(",");
    },
    handlePicker(field) { this.activePickerField = field; },
    onPickerSelect(row) {
      if (!this.activePickerField) return;
      const field = this.activePickerField;
      const valueKey = field.pickerValueKey || field.pickerColumns?.[0] || "id";
      let value = row[valueKey];
      if (value === undefined) {
        const actualKey = Object.keys(row).find(k => k.toLowerCase() === valueKey.toLowerCase());
        value = actualKey ? row[actualKey] : undefined;
      }
      if (value === undefined) {
        const actualKey = Object.keys(row).find(k => k.toLowerCase() === field.name.toLowerCase());
        value = actualKey ? row[actualKey] : row.id;
      }
      this.form[field.name] = value ?? "";
      const rowStationId = row.stationId || row.siteId || row.StationId || "";
      if (field.name === "customerId") {
        this.form.customerStationId = rowStationId;
        if (!this.form.stationId && rowStationId) this.form.stationId = String(rowStationId).toUpperCase();
      } else if (field.name === "meterId") {
        this.form.meterStationId = rowStationId;
        if (rowStationId) this.form.stationId = String(rowStationId).toUpperCase();
        if (row.protocolVersion && !this.form.protocolVersion) this.form.protocolVersion = row.protocolVersion;
      }
      this.activePickerField = null;
    },
    async handleImportFile(event) {
      this.error = "";
      const file = event.target.files?.[0];
      if (!file) return;
      this.form.fileName = file.name;
      this.selectedFile = file;
      if (this.uploadMode) {
        const validationError = validateUploadFile(file);
        if (validationError) { this.error = validationError; this.uploadPreview = ""; return; }
        this.uploadPreview = uploadSummary(file);
        return;
      }
      const importedRows = await parseImportFile(file);
      const validated = validateImportRows(this.route, importedRows, columnKey);
      this.importRows = validated.rows;
      this.importErrors = validated.errors;
      this.preflight = null;
      this.applyMeterStationFix = false;
      this.createMissingCustomers = false;
      if (this.importErrors.length) {
        const report = buildErrorReport(this.importErrors);
        downloadTextFile(`${this.route.title}-import-errors.csv`, report, "text/csv;charset=utf-8");
        this.error = importErrorMessage(this.importErrors);
        return;
      }
      if (this.isAccountRoute) await this.runAccountPreflight();
    },
    async runAccountPreflight() {
      this.preflightRunning = true;
      try {
        this.preflight = await preflightAccountImport(this.importRows);
        if (this.preflightBlocking.length) {
          this.error = `${this.preflightBlocking.length} row(s) will be rejected by the API. Fix them or import the rest.`;
        } else {
          this.error = "";
        }
      } catch (error) {
        this.preflight = null;
        this.error = userFacingError(error, "Could not validate rows against the live API");
      } finally {
        this.preflightRunning = false;
      }
    },
    downloadPreflightReport() {
      if (!this.preflight) return;
      downloadTextFile(`${this.route.title}-import-precheck.csv`, preflightReportCsv(this.preflight), "text/csv;charset=utf-8");
    },
    async submit() {
      if (this.action === "Import" && this.importErrors.length) {
        this.error = importErrorMessage(this.importErrors);
        return;
      }
      this.error = "";
      if (this.action === "Export") {
        const timestamp = new Date().toISOString().split("T")[0];
        const baseFilename = `Beverly_${this.route.title.replace(/\s+/g, "_")}_${timestamp}`;
        const csvText = exportCsvText(this.route, this.rows, columnKey);
        const excelXml = exportExcelXml(this.route, this.rows, columnKey);
        downloadTextFile(`${baseFilename}.csv`, csvText, "text/csv;charset=utf-8");
        downloadTextFile(`${baseFilename}.xls`, excelXml, "application/vnd.ms-excel");
        await logExportJob(this.route, this.rows, "csv", {
          fileName: `${baseFilename}.csv`,
          content: csvText,
          contentType: "text/csv;charset=utf-8"
        });
        await logExportJob(this.route, this.rows, "xls", {
          fileName: `${baseFilename}.xls`,
          content: excelXml,
          contentType: "application/vnd.ms-excel"
        });
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
        let importRows = this.importRows;
        if (this.action === "Import" && this.isAccountRoute) {
          if (this.createMissingCustomers && this.preflightMissingCustomers.length) {
            const workflow = await provisionAndRecheckAccountImport(this.importRows, this.preflight);
            this.preflight = workflow.report;
          }
          if (this.applyMeterStationFix && this.preflightFixes.length) {
            const fixResults = await alignMeterStations(this.preflightFixes);
            const failedFixes = fixResults.filter((fix) => !fix.ok);
            if (failedFixes.length) {
              const msg = `Could not move ${failedFixes.length} meter(s): ${failedFixes[0].error}`;
              this.error = msg;
              toastError(msg);
              return;
            }
            await this.runAccountPreflight();
          }
          if (!this.preflight) await this.runAccountPreflight();
          importRows = this.preflight?.ready || [];
          if (!importRows.length) {
            const msg = "No rows can be imported — every row was rejected by the pre-check.";
            this.error = msg;
            toastError(msg);
            return;
          }
        }
        const actionResult = await submitRouteAction(this.route, this.action, this.form, {
          fields: this.fields,
          importRows,
          selectedFile: this.selectedFile,
          uploadMode: this.uploadMode
        });
        this.requestLog = JSON.stringify(actionResult.requestLog, null, 2);
        this.responseLog = JSON.stringify(actionResult.responseLog, null, 2);
        if (this.uploadMode) {
          this.result = `Upload submitted: ${this.form.fileName}`;
          toastSuccess(`Upload submitted: ${this.form.fileName}`);
        } else if (this.action === "Import") {
          const skipped = this.importRows.length - importRows.length;
          const skippedNote = skipped > 0 ? ` · ${skipped} skipped by pre-check` : "";
          if (actionResult.queued || actionResult.partial) {
            this.result = `${actionResult.resultText}${skippedNote}`;
            toastError(actionResult.resultText);
          } else {
            this.result = `Imported ${importRows.length} row(s) to the live API${skippedNote}`;
            toastSuccess(`Imported ${importRows.length} row(s) to the live API`);
          }
        } else if (actionResult.queued) {
          this.result = actionResult.resultText;
          toastError(actionResult.resultText);
        } else {
          this.result = actionResult.resultText;
          toastSuccess(actionResult.resultText || `${this.action} completed successfully.`);
        }
        this.$emit("done", actionResult);
      } catch (error) {
        const msg = userFacingError(error, "Action failed");
        this.error = msg;
        toastError(msg);
      }
    }
  }
};
</script>
