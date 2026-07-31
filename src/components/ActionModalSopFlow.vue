<template>
  <BaseModalShell tag="form" class="modal modal-sop" @submit.prevent="submit">
    <template #header>
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-action-badge" :class="actionBadgeClass">
            <span v-html="actionIcon"></span>
          </div>
          <h2 class="modal-title">{{ sopStepTitle }}</h2>
        </div>
        <BaseIconButton class="modal-close" aria-label="Close" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </BaseIconButton>
      </div>
    </template>

    <div class="sop-stepper">
      <div class="sop-step" :class="{ active: sopStep === 1, done: sopStep > 1 }">
        <div class="sop-step-dot"><span v-if="sopStep > 1">&#10003;</span><span v-else>1</span></div>
        <span>Details</span>
      </div>
      <div class="sop-step-line" :class="{ done: sopStep > 1 }"></div>
      <div class="sop-step" :class="{ active: sopStep === 2 }">
        <div class="sop-step-dot">2</div>
        <span>Review</span>
      </div>
    </div>

    <div class="modal-body">
      <!-- Step 2: review -->
      <div v-if="sopStep === 2" class="sop-review">
        <div class="sop-review-title">Review your details</div>
        <div class="sop-review-grid">
          <div v-for="field in fields" :key="field.name" class="sop-review-row">
            <span class="sop-review-label">{{ field.label }}</span>
            <span class="sop-review-value">{{ sopReviewValue(field) }}</span>
          </div>
        </div>
      </div>

      <!-- Step 1: field form (same grid as generic) -->
      <div v-else class="modal-grid">
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
        <label v-if="showAuthorizationField" class="modal-field">
          <span>Authorization Password</span>
          <BaseInput v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off" />
        </label>
      </div>

      <div v-if="error" class="modal-error">{{ error }}</div>
      <div v-if="result" class="modal-result">{{ result }}</div>
    </div>

    <template #footer>
      <div class="modal-actions">
        <BaseButton :variant="sopStep === 2 ? 'secondary' : 'danger'" @click="sopStep === 2 ? sopStep = 1 : $emit('close')">
          {{ sopStep === 2 ? 'Back' : 'Cancel' }}
        </BaseButton>
        <BaseButton v-if="sopStep === 1" variant="primary" @click="sopNext">Continue &rarr;</BaseButton>
        <BaseButton v-else variant="primary" native-type="submit">Confirm</BaseButton>
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
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseModalShell from "./base/BaseModalShell.vue";
import BaseSelect from "./base/BaseSelect.vue";
import { managementFields, managementFormSeed, ROLE_PERMISSIONS } from "../services/management-forms.mjs";
import { tableSiteOptions } from "../services/table-service";
import { needsAuthorizationPassword } from "../services/write-helpers.mjs";
import { submitRouteAction } from "../services/action-service.mjs";
import { postApi } from "../services/api.js";
import { userFacingError } from "../services/guarded-write.mjs";
import { toastSuccess, toastError } from "../services/toast.js";

export default {
  name: "ActionModalSopFlow",
  components: { BaseButton, BaseIconButton, BaseInput, BaseModalShell, BaseSelect, PickerModal },
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
        authorizationPassword: ""
      },
      sopStep: 1,
      stations: [],
      roles: [],
      rolesLoading: false,
      showPwField: false,
      permOpen: false,
      activePickerField: null,
      error: "",
      result: ""
    };
  },
  computed: {
    sopStepTitle() {
      const base = this.action === "Add" ? `Create ${this.route.title}` : `Edit ${this.route.title}`;
      return this.sopStep === 1 ? base : "Review & Confirm";
    },
    actionBadgeClass() {
      if (this.action === "Edit") return "badge-warning";
      return "badge-primary";
    },
    actionIcon() {
      if (this.action === "Edit") return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';
    },
    fields() { return managementFields(this.route, this.action); },
    showAuthorizationField() { return needsAuthorizationPassword(this.action, this.route); },
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
        console.error("ActionModalSopFlow: Failed to fetch stations", error);
      }
    }
    if (this.fields.some(f => f.type === "role-select")) this.loadRoles();
  },
  methods: {
    sopNext() {
      const required = this.fields.filter(f => f.required);
      for (const f of required) {
        if (!String(this.form[f.name] || "").trim()) {
          this.error = `${f.label} is required`;
          return;
        }
      }
      this.error = "";
      this.sopStep = 2;
    },
    sopReviewValue(field) {
      if (field.type === "password") return "••••••••";
      if (field.name === "status" && this.route?.hash === "#/admin/user") {
        return String(this.form.status).toLowerCase() === "false" ? "Inactive" : "Active";
      }
      return this.form[field.name] || "—";
    },
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
        console.error("ActionModalSopFlow: Failed to fetch roles", e);
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
    async submit() {
      this.error = "";
      try {
        const actionResult = await submitRouteAction(this.route, this.action, this.form, { fields: this.fields });
        this.result = actionResult.resultText;
        toastSuccess(actionResult.resultText || `${this.action} completed successfully.`);
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
