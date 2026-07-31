<template>
  <BaseModalShell tag="form" class="modal modal-token-flow" @submit.prevent="handleSubmit">
    <template #header>
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-action-badge badge-primary">
            <span><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg></span>
          </div>
          <h2 class="modal-title">{{ modalHeading }}</h2>
        </div>
        <BaseIconButton class="modal-close" aria-label="Close" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </BaseIconButton>
      </div>
    </template>

    <div v-if="isRemoteBatchFlow" class="token-stepper" aria-label="Batch task progress">
      <div v-for="step in remoteBatchSteps" :key="step.id" class="token-step" :class="{ active: remoteBatchStep === step.id, done: remoteBatchStepDone(step.id) }">
        <span class="token-step-dot">
          <span v-if="remoteBatchStepDone(step.id)">&#10003;</span>
          <span v-else>{{ step.number }}</span>
        </span>
        <span>{{ step.label }}</span>
      </div>
    </div>

    <div class="modal-body">
      <div class="token-flow">
        <template v-if="isRemoteBatchFlow && remoteBatchStep === 'review'">
          <div class="modal-grid">
            <label class="modal-field">
              <span>Selected Meter</span>
              <BaseInput :value="String(remoteBatchSelectedMeterCount)" readonly />
            </label>
            <label class="modal-field">
              <span>Station Count</span>
              <BaseInput :value="String(remoteBatchStationCount)" readonly />
            </label>
            <label class="modal-field modal-span-two">
              <span>Data Item</span>
              <BaseInput :value="remoteBatchSelectedDataItems.join(', ')" readonly />
            </label>
          </div>
          <section class="batch-task-preview" aria-label="Selected meters preview">
            <div class="batch-task-preview-head">
              <div>
                <span class="batch-task-eyebrow">Batch preview</span>
                <strong>{{ remoteBatchSummaryText }}</strong>
              </div>
              <span class="batch-task-badge">{{ remoteBatchSelectedMeterCount }} meters</span>
            </div>
            <div class="batch-task-list">
              <article v-for="row in remoteBatchPreviewRows" :key="`${row.meterId}-${row.customerId || row.customerName || row.stationId}`" class="batch-task-card">
                <span>{{ row.stationId || 'No station' }}</span>
                <strong>{{ row.customerName || row.customerId || row.meterId }}</strong>
                <small>{{ row.meterId }}</small>
              </article>
            </div>
            <p class="token-helper">{{ remoteBatchSelectedDataItemsLabel }}</p>
            <p v-if="remoteBatchOverflowCount > 0" class="token-helper">{{ remoteBatchOverflowCount }} more meter{{ remoteBatchOverflowCount === 1 ? '' : 's' }} selected.</p>
          </section>
        </template>

        <!-- BATCH READING: Form step — grouped data item checkboxes -->
        <template v-else-if="isRemoteBatchReadingFlow && remoteBatchStep === 'form'">
          <div class="batch-meter-summary">
            <div class="batch-meter-summary-icon">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/></svg>
            </div>
            <div>
              <strong>{{ remoteBatchSelectedMeterCount }} meter{{ remoteBatchSelectedMeterCount === 1 ? '' : 's' }} selected</strong>
              <span>{{ remoteBatchStationCount }} station{{ remoteBatchStationCount === 1 ? '' : 's' }}</span>
            </div>
          </div>
          <div class="batch-data-picker">
            <label class="batch-data-picker-label">Data Item</label>
            <BaseInput v-model="dataItemFilter" class="batch-data-filter" placeholder="Enter keywords to filter" autocomplete="off" />
            <div v-for="group in filteredDataItemGroups" :key="group.group" class="batch-data-group">
              <label class="batch-data-group-header" @click.prevent="toggleDataItemGroup(group)">
                <span class="batch-data-group-check" :class="{ checked: isDataItemGroupChecked(group), partial: isDataItemGroupPartial(group) }">
                  <svg v-if="isDataItemGroupChecked(group)" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  <svg v-else-if="isDataItemGroupPartial(group)" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
                </span>
                <span class="batch-data-group-name">{{ group.group }}</span>
              </label>
              <div class="batch-data-items">
                <label v-for="item in group.items" :key="item.value" class="batch-data-item" :class="{ checked: isDataItemSelected(item.value) }" @click.prevent="toggleDataItem(item.value)">
                  <span class="batch-data-item-check" :class="{ checked: isDataItemSelected(item.value) }">
                    <svg v-if="isDataItemSelected(item.value)" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  </span>
                  <span>{{ item.label }}</span>
                </label>
              </div>
            </div>
          </div>
        </template>

        <!-- SINGLE TASK or LEGACY BATCH (non-reading) -->
        <div v-else class="modal-grid">
          <label v-if="!isRemoteBatchFlow" class="modal-field">
            <span>Customer Id</span>
            <BaseInput v-model="form.customerId" :readonly="!remoteTaskAllowsManualEntry" />
          </label>
          <label v-if="!isRemoteBatchFlow" class="modal-field">
            <span>Customer Name</span>
            <BaseInput v-model="form.customerName" :readonly="!remoteTaskAllowsManualEntry" />
          </label>
          <label v-if="!isRemoteBatchFlow" class="modal-field">
            <span>Meter Id</span>
            <BaseInput v-model="form.meterId" :readonly="!remoteTaskAllowsManualEntry" />
          </label>
          <label v-if="isRemoteSupportTaskRoute" class="modal-field">
            <span>Protocol Version</span>
            <BaseInput v-model="form.protocolVersion" autocomplete="off" />
          </label>
          <label v-if="!isRemoteBatchFlow" class="modal-field">
            <span>Station Id</span>
            <BaseInput v-model="form.stationId" :readonly="!remoteTaskAllowsManualEntry" />
          </label>
          <label v-if="!isRemoteBatchFlow" class="modal-field">
            <span>Data Item</span>
            <BaseSelect v-model="form.dataItem">
              <option v-for="option in remoteDataOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </BaseSelect>
          </label>
          <label v-if="isRemoteBatchFlow" class="modal-field modal-span-two">
            <span>Meter Id</span>
            <BaseSelect v-model="form.selectedMeterIds" multiple size="8">
              <option v-for="option in remoteBatchMeterOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </BaseSelect>
          </label>
          <label v-if="isRemoteBatchFlow" class="modal-field modal-span-two">
            <span>Data Item</span>
            <BaseSelect v-model="form.selectedDataItems" multiple :size="remoteDataOptions.length">
              <option v-for="option in remoteDataOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </BaseSelect>
          </label>
          <label v-if="isRemoteTokenTask" class="modal-field">
            <span>Token</span>
            <BaseInput v-model="form.token" autocomplete="off" />
          </label>
          <label v-if="remoteTaskRequiresAuthorization" class="modal-field">
            <span>Authorization Password</span>
            <BaseInput v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off" />
          </label>
        </div>
        <p v-if="action === 'Add Batch Task'" class="token-helper">Batch rows: {{ remoteBatchCount }}</p>
      </div>
      <div v-if="error" class="modal-error">{{ error }}</div>
      <div v-if="result" class="modal-result">{{ result }}</div>
    </div>

    <template #footer>
      <div class="modal-actions">
        <BaseButton :variant="remoteBatchStep === 'review' ? 'secondary' : 'danger'" @click="remoteBatchStep === 'review' ? remoteBatchStep = 'form' : $emit('close')">
          {{ remoteBatchStep === 'review' ? 'Back' : 'Cancel' }}
        </BaseButton>
        <BaseButton v-if="isRemoteBatchFlow && remoteBatchStep === 'form'" variant="primary" :disabled="tokenLoading || Boolean(remoteTaskFormError)" @click="advanceRemoteBatchStep">Review</BaseButton>
        <BaseButton v-else variant="primary" :disabled="tokenLoading || Boolean(remoteTaskFormError)" @click="confirmRemoteTask">Confirm</BaseButton>
      </div>
    </template>
  </BaseModalShell>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseModalShell from "./base/BaseModalShell.vue";
import BaseSelect from "./base/BaseSelect.vue";
import { liveWritesAllowed, postApi } from "../services/api.js";
import { guardedWriteMessage } from "../services/guarded-write.mjs";
import {
  buildRemoteTaskPayload,
  remoteTaskConfirmEndpoint,
  defaultRemoteDataItem,
  guardedRemoteTaskError,
  isGprsSupportTaskRoute,
  isRemoteMeterReadingRoute,
  normalizeRemoteDataItems,
  normalizeRemoteDataItem,
  readingDataItemGroups,
  remoteTaskNeedsAuthorization,
  remoteTaskEndpoint,
  remoteTaskKind,
  remoteTaskOptions,
  remoteTaskTitle,
  remoteTaskValidationError
} from "../services/remote-task-flow.mjs";
import { toastSuccess, toastError, toastWarn } from "../services/toast.js";

export default {
  name: "ActionModalRemoteTask",
  components: { BaseButton, BaseIconButton, BaseInput, BaseModalShell, BaseSelect },
  props: {
    action: { type: String, required: true },
    route: { type: Object, required: true },
    row: { type: Object, default: () => ({}) },
    rows: { type: Array, default: () => [] }
  },
  emits: ["close", "done"],
  data() {
    const rowDataItem = normalizeRemoteDataItem(this.route, this.row.dataItem);
    const batchMeterIds = this.action === "Add Batch Task"
      ? this.rows.map((row) => String(row?.meterId || "")).filter(Boolean)
      : [];
    return {
      form: {
        ...this.row,
        authorizationPassword: "",
        dataItem: rowDataItem || defaultRemoteDataItem(this.route),
        selectedMeterIds: batchMeterIds,
        selectedDataItems: [],
        token: this.row.token || this.row.data || ""
      },
      remoteBatchStep: "form",
      tokenLoading: false,
      dataItemFilter: "",
      error: "",
      result: "",
      requestLog: "",
      responseLog: ""
    };
  },
  computed: {
    modalHeading() { return remoteTaskTitle(this.route, this.action); },
    isRemoteBatchFlow() { return this.action === "Add Batch Task"; },
    isRemoteBatchReadingFlow() { return this.isRemoteBatchFlow && isRemoteMeterReadingRoute(this.route); },
    isRemoteSupportTaskRoute() { return isGprsSupportTaskRoute(this.route); },
    isRemoteTokenTask() { return remoteTaskKind(this.route) === "token"; },
    remoteDataOptions() { return remoteTaskOptions[remoteTaskKind(this.route)]; },
    remoteBatchSteps() {
      return [
        { id: "form", number: 1, label: "Select" },
        { id: "review", number: 2, label: "Review" }
      ];
    },
    remoteBatchRows() {
      const rows = this.rows.filter((row) => row?.meterId);
      const selectedMeterIds = Array.isArray(this.form.selectedMeterIds) ? this.form.selectedMeterIds : [];
      if (!selectedMeterIds.length) return rows;
      return rows.filter((row) => selectedMeterIds.includes(String(row.meterId || "")));
    },
    remoteBatchCount() { return this.rows.filter((row) => row?.meterId).length; },
    remoteBatchMeterOptions() {
      return this.rows
        .filter((row) => row?.meterId)
        .map((row) => ({
          value: String(row.meterId || ""),
          label: [row.meterId, row.customerName || row.customerId || "", row.stationId || ""].filter(Boolean).join(" | ")
        }));
    },
    remoteBatchSelectedMeterCount() { return this.remoteBatchRows.length; },
    remoteBatchSelectedDataItems() { return normalizeRemoteDataItems(this.route, this.form.selectedDataItems); },
    remoteBatchPreviewRows() { return this.remoteBatchRows.slice(0, 6); },
    remoteBatchOverflowCount() { return Math.max(0, this.remoteBatchSelectedMeterCount - this.remoteBatchPreviewRows.length); },
    remoteBatchStationCount() {
      return new Set(this.remoteBatchRows.map((row) => String(row.stationId || "").trim()).filter(Boolean)).size;
    },
    remoteBatchSummaryText() {
      if (!this.remoteBatchSelectedMeterCount) return "Select meters";
      if (!this.remoteBatchSelectedDataItems.length) return "Select data items";
      return `${this.remoteBatchSelectedMeterCount} meter${this.remoteBatchSelectedMeterCount === 1 ? "" : "s"} x ${this.remoteBatchSelectedDataItems.length} item${this.remoteBatchSelectedDataItems.length === 1 ? "" : "s"}`;
    },
    remoteBatchSelectedDataItemsLabel() {
      if (!this.remoteBatchSelectedDataItems.length) return "No data items selected.";
      return `Data items: ${this.remoteBatchSelectedDataItems.join(", ")}`;
    },
    filteredDataItemGroups() {
      const filter = String(this.dataItemFilter || "").trim().toLowerCase();
      if (!filter) return readingDataItemGroups;
      return readingDataItemGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            item.label.toLowerCase().includes(filter) || group.group.toLowerCase().includes(filter)
          )
        }))
        .filter((group) => group.items.length > 0);
    },
    remoteTaskFormError() {
      return remoteTaskValidationError(this.route, this.form, { action: this.action, rows: this.rows });
    },
    remoteTaskAllowsManualEntry() { return this.isRemoteSupportTaskRoute; },
    remoteTaskRequiresAuthorization() { return remoteTaskNeedsAuthorization(this.route); }
  },
  watch: {
    remoteDataOptions() { this.syncRemoteTaskDataItem(); }
  },
  created() {
    this.syncRemoteTaskDataItem();
  },
  methods: {
    syncRemoteTaskDataItem() {
      if (this.isRemoteBatchFlow) {
        if (this.isRemoteBatchReadingFlow && (!this.form.selectedDataItems || !this.form.selectedDataItems.length)) {
          const allItems = readingDataItemGroups.flatMap((g) => g.items.map((i) => i.value));
          this.form.selectedDataItems = allItems;
        } else {
          const normalizedItems = normalizeRemoteDataItems(this.route, this.form.selectedDataItems);
          if (JSON.stringify(normalizedItems) !== JSON.stringify(this.form.selectedDataItems || [])) {
            this.form.selectedDataItems = normalizedItems;
          }
        }
        if (Array.isArray(this.form.selectedMeterIds)) {
          const validMeterIds = new Set(this.rows.filter((row) => row?.meterId).map((row) => String(row.meterId || "")));
          const normalizedMeterIds = this.form.selectedMeterIds.map((value) => String(value || "")).filter((value) => validMeterIds.has(value));
          if (JSON.stringify(normalizedMeterIds) !== JSON.stringify(this.form.selectedMeterIds)) {
            this.form.selectedMeterIds = normalizedMeterIds;
          }
        }
        return;
      }
      const normalized = normalizeRemoteDataItem(this.route, this.form.dataItem);
      if (normalized) {
        if (this.form.dataItem !== normalized) this.form.dataItem = normalized;
        return;
      }
      const fallback = defaultRemoteDataItem(this.route);
      if (fallback && this.form.dataItem !== fallback) this.form.dataItem = fallback;
    },
    advanceRemoteBatchStep() {
      this.error = "";
      const validationError = this.remoteTaskFormError;
      if (validationError) { this.error = validationError; return; }
      this.remoteBatchStep = "review";
    },
    isDataItemSelected(value) {
      return Array.isArray(this.form.selectedDataItems) && this.form.selectedDataItems.includes(value);
    },
    isDataItemGroupChecked(group) {
      return group.items.every((item) => this.isDataItemSelected(item.value));
    },
    isDataItemGroupPartial(group) {
      const selected = group.items.filter((item) => this.isDataItemSelected(item.value));
      return selected.length > 0 && selected.length < group.items.length;
    },
    toggleDataItem(value) {
      const current = Array.isArray(this.form.selectedDataItems) ? [...this.form.selectedDataItems] : [];
      const idx = current.indexOf(value);
      if (idx === -1) current.push(value);
      else current.splice(idx, 1);
      this.form.selectedDataItems = current;
    },
    toggleDataItemGroup(group) {
      const allChecked = this.isDataItemGroupChecked(group);
      const current = Array.isArray(this.form.selectedDataItems) ? [...this.form.selectedDataItems] : [];
      for (const item of group.items) {
        const idx = current.indexOf(item.value);
        if (allChecked) { if (idx !== -1) current.splice(idx, 1); }
        else { if (idx === -1) current.push(item.value); }
      }
      this.form.selectedDataItems = current;
    },
    remoteBatchStepDone(stepId) {
      const order = { form: 1, review: 2 };
      return order[stepId] < order[this.remoteBatchStep];
    },
    friendlyRemoteTaskError(message) {
      const errorObj = (typeof message === "object" && message !== null) ? message : null;
      const text = String(errorObj?.message || message || "Task failed");
      if (guardedRemoteTaskError(errorObj || text)) return guardedWriteMessage("Remote task");
      const status = Number(errorObj?.response?.status || errorObj?.status || 0);
      const backendReason = errorObj?.response?.data?.reason || errorObj?.response?.data?.msg || errorObj?.response?.data?.message;
      if (status === 403 || /route permission required|session lacks permission/i.test(text)) {
        return `Permission denied: ${backendReason || text}. Ensure your CRM role has access to this operation.`;
      }
      return text;
    },
    remoteTaskHeaders(route = this.route, action = this.action) {
      return {
        "X-Route-Hash": String(route?.hash || ""),
        "X-Route-Action": String(action || "Add Task")
      };
    },
    handleSubmit() {
      if (this.isRemoteBatchFlow && this.remoteBatchStep === "form") {
        this.advanceRemoteBatchStep();
      } else {
        this.confirmRemoteTask();
      }
    },
    async confirmRemoteTask() {
      this.error = "";
      this.result = "";
      const validationError = this.remoteTaskFormError;
      if (validationError) { this.error = validationError; return; }
      this.tokenLoading = true;
      try {
        const endpoint = remoteTaskEndpoint(this.route);
        const payloads = buildRemoteTaskPayload(this.route, this.action, this.form, this.rows);

        const groups = new Map();
        for (const p of payloads) {
          const key = p.dataItem || p.flag || "_default";
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(p);
        }

        const groupEntries = Array.from(groups.entries());
        this.requestLog = JSON.stringify({
          endpoint,
          totalTasks: payloads.length,
          groups: groupEntries.map(([key, items]) => ({ dataItem: key, count: items.length }))
        }, null, 2);

        if (!liveWritesAllowed()) {
          this.error = guardedWriteMessage("Remote task");
          toastError(this.error);
          return;
        }

        const headers = this.remoteTaskHeaders();
        const results = await Promise.allSettled(
          groupEntries.map(([, items]) => postApi(endpoint, items, { headers }))
        );

        const succeeded = [];
        const failed = [];
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const [key] = groupEntries[i];
          if (r.status === "rejected") {
            failed.push({ dataItem: key, error: r.reason });
          } else {
            const code = Number(r.value?.code);
            if (Number.isFinite(code) && code !== 0 && code !== 200) {
              failed.push({ dataItem: key, error: r.value?.reason || r.value?.msg || `code ${code}` });
            } else {
              const items = Array.isArray(r.value?.result) ? r.value.result : (Array.isArray(r.value?.data) ? r.value.data : []);
              succeeded.push({ dataItem: key, count: items.length || groupEntries[i][1].length });
            }
          }
        }

        this.responseLog = JSON.stringify(
          results.map(r => r.status === "fulfilled" ? r.value : { error: r.reason?.message }),
          null, 2
        );

        const totalSubmitted = succeeded.reduce((sum, g) => sum + g.count, 0);

        if (failed.length === groupEntries.length && failed.every((failure) => guardedRemoteTaskError(failure.error))) {
          this.error = failed.map(f => `${f.dataItem}: ${this.friendlyRemoteTaskError(f.error)}`).join("; ");
          toastError(this.error);
          return;
        }

        if (failed.length === groupEntries.length) {
          throw new Error(failed.map(f => `${f.dataItem}: ${this.friendlyRemoteTaskError(f.error)}`).join("; "));
        }

        if (failed.length > 0) {
          this.result = `${totalSubmitted} task${totalSubmitted > 1 ? "s" : ""} submitted, ${failed.length} group${failed.length > 1 ? "s" : ""} failed`;
          toastWarn(`Partial: ${totalSubmitted} submitted, ${failed.length} failed`);
          this.$emit("done", { endpoint, payloads, succeeded, failed });
          return;
        }

        this.result = `${totalSubmitted} task${totalSubmitted > 1 ? "s" : ""} submitted`;
        toastSuccess(`${totalSubmitted} task${totalSubmitted > 1 ? "s" : ""} submitted successfully`);
        this.$emit("done", { endpoint, payloads, succeeded, failed: [] });
      } catch (error) {
        if (guardedRemoteTaskError(error)) {
          this.error = guardedWriteMessage("Remote task");
          toastError(this.error);
          return;
        }
        this.error = this.friendlyRemoteTaskError(error?.message);
        toastError(this.error);
      } finally {
        this.tokenLoading = false;
      }
    }
  }
};
</script>
