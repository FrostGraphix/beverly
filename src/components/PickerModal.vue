<template>
  <div class="modal-backdrop show picker-backdrop" role="dialog" aria-modal="true" @click.self="$emit('close')">
    <BaseModalShell class="modal picker-modal" body-class="picker-body">
      <template #header>
        <div class="modal-header">
        <div class="picker-title-block">
          <span class="picker-kicker">Select record</span>
          <h2 class="modal-title">{{ label }}</h2>
        </div>
        <BaseIconButton class="modal-close" aria-label="Close picker" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </BaseIconButton>
        </div>
      </template>
        <div class="picker-sop-stepper" aria-label="Selection progress">
          <div class="picker-sop-step" :class="{ active: pickerStep === 1, done: pickerStep > 1 }">
            <span class="picker-sop-dot"><span v-if="pickerStep > 1">&#10003;</span><span v-else>1</span></span>
            <span>Select</span>
          </div>
          <div class="picker-sop-line" :class="{ done: pickerStep > 1 }"></div>
          <div class="picker-sop-step" :class="{ active: pickerStep === 2 }">
            <span class="picker-sop-dot">2</span>
            <span>Review</span>
          </div>
        </div>
      <template v-if="pickerStep === 1">
        <div class="picker-search-bar">
          <BaseInput v-model="searchTerm" :placeholder="`Search ${label || 'records'}`" class="picker-search-input" @keyup.enter="load" />
          <BaseButton variant="primary" class="picker-search-btn" aria-label="Search" @click="search">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </BaseButton>
        </div>

        <BaseTableShell class="picker-table-shell">
          <div class="table-scroll picker-table-container">
            <table class="picker-table">
            <thead>
              <tr>
                <th class="radio-col"></th>
                <th v-for="(col, i) in columns" :key="col">
                  {{ columnLabels[i] || col }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading"><td :colspan="columns.length + 1" class="picker-state-cell"><span class="picker-spinner"></span>Loading</td></tr>
              <tr v-else-if="!rows.length"><td :colspan="columns.length + 1" class="picker-state-cell">No records found</td></tr>
              <tr v-for="(row, idx) in rows" :key="idx" :class="{ 'selected-row': isSelected(row) }" @click="selectRow(row)">
                <td class="radio-col">
                  <div class="custom-radio" :class="{ 'checked': isSelected(row) }">
                    <div v-if="isSelected(row)" class="radio-inner"></div>
                  </div>
                </td>
                <td v-for="col in columns" :key="col">{{ cellValue(row, col) }}</td>
              </tr>
            </tbody>
            </table>
          </div>
          <template #footer>
            <div class="picker-pagination">
              <div class="pagination-info">Total {{ totalRecords }}</div>
              <div class="pagination-controls">
            <BaseSelect v-model="pageSize" class="pagination-select" @change="onPageSizeChange">
              <option :value="10">10/page</option>
              <option :value="20">20/page</option>
              <option :value="50">50/page</option>
              <option :value="100">100/page</option>
            </BaseSelect>
            <BaseButton class="btn-page" size="sm" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">&lt;</BaseButton>
            <BaseButton
              v-for="p in pageNumbers" :key="p"
              class="btn-page"
              :class="{ active: p === currentPage }"
              size="sm"
              @click="goToPage(p)"
            >{{ p }}</BaseButton>
            <BaseButton class="btn-page" size="sm" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">&gt;</BaseButton>
            <span class="goto-text">Go to</span>
            <BaseInput v-model="gotoPage" type="text" class="goto-input" @keyup.enter="onGoto" />
              </div>
            </div>
          </template>
        </BaseTableShell>
      </template>
      <section v-else class="picker-review" aria-label="Review selected record">
        <h3>Review selected record</h3>
        <div class="picker-review-grid">
          <div v-for="item in selectedReview" :key="item.label" class="picker-review-row">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
        </div>
      </section>
      <template #footer>
        <div class="modal-actions picker-footer">
          <BaseButton :variant="pickerStep === 1 ? 'danger' : 'secondary'" @click="pickerStep === 1 ? $emit('close') : pickerStep = 1">{{ pickerStep === 1 ? "Cancel" : "Back" }}</BaseButton>
          <BaseButton v-if="pickerStep === 1" variant="primary" :disabled="!selectedRow" @click="pickerStep = 2">Continue</BaseButton>
          <BaseButton v-else variant="primary" @click="confirmSelection">Confirm</BaseButton>
          </div>
      </template>
    </BaseModalShell>
  </div>
</template>

<script>
import { postApi } from "../services/api";
import BaseButton from "./base/BaseButton.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseModalShell from "./base/BaseModalShell.vue";
import BaseSelect from "./base/BaseSelect.vue";
import BaseTableShell from "./base/BaseTableShell.vue";

export default {
  name: "PickerModal",
  components: { BaseButton, BaseIconButton, BaseInput, BaseModalShell, BaseSelect, BaseTableShell },
  props: {
    api: { type: String, required: true },
    columns: { type: Array, required: true },
    columnLabels: { type: Array, default: () => [] },
    label: { type: String, default: "" },
    autoConfirm: { type: Boolean, default: false }
  },
  data() {
    return {
      rows: [],
      loading: false,
      searchTerm: "",
      selectedRow: null,
      pickerStep: 1,
      pageSize: 20,
      currentPage: 1,
      totalRecords: 0,
      gotoPage: "1"
    };
  },
  computed: {
    totalPages() {
      return Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
    },
    pageNumbers() {
      // Show up to 5 page numbers around the current page
      const pages = [];
      const start = Math.max(1, this.currentPage - 2);
      const end = Math.min(this.totalPages, start + 4);
      for (let i = start; i <= end; i++) pages.push(i);
      return pages;
    },
    selectedReview() {
      if (!this.selectedRow) return [];
      return this.columns.map((col, index) => ({
        label: this.columnLabels[index] || col,
        value: this.cellValue(this.selectedRow, col) === "" ? "-" : this.cellValue(this.selectedRow, col)
      }));
    }
  },
  created() {
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const payload = {
          pageNumber: this.currentPage,
          pageSize: this.pageSize,
          searchTerm: this.searchTerm
        };
        const response = await postApi(this.api, payload);
        // Support common response envelope shapes
        const result = response?.result || response?.data || response || {};
        this.rows = result.data || result.list || result.rows || (Array.isArray(result) ? result : []);
        // Total count — support different field names backends use
        this.totalRecords = result.total ?? result.totalCount ?? result.count ?? this.rows.length;
        this.pickerStep = 1;
        this.selectedRow = null;
      } catch (err) {
        console.error("PickerModal: Load failed", err);
      } finally {
        this.loading = false;
      }
    },
    async search() {
      this.currentPage = 1;
      this.gotoPage = "1";
      await this.load();
    },
    async goToPage(page) {
      const p = Math.max(1, Math.min(this.totalPages, Number(page)));
      if (!p || isNaN(p)) return;
      this.currentPage = p;
      this.gotoPage = String(p);
      await this.load();
    },
    async onPageSizeChange() {
      this.currentPage = 1;
      this.gotoPage = "1";
      await this.load();
    },
    async onGoto() {
      await this.goToPage(Number(this.gotoPage));
    },
    selectRow(row) {
      this.selectedRow = row;
      if (this.autoConfirm) this.$emit("select", row);
    },
    isSelected(row) {
      if (!this.selectedRow) return false;
      const idKey = this.columns[0];
      return this.cellValue(row, idKey) === this.cellValue(this.selectedRow, idKey);
    },
    cellValue(row, col) {
      let value;
      if (row[col] !== undefined && row[col] !== null) {
        value = row[col];
      } else if (col === 'meterType' && row['type'] !== undefined && row['type'] !== null) {
        value = row['type'];
      } else {
        const key = Object.keys(row).find(k => k.toLowerCase() === col.toLowerCase());
        value = key ? row[key] : '';
      }
      // Normalize meterType numeric codes to human-readable labels
      if (col === 'meterType' || col === 'type') {
        if (value === 0 || value === '0') return 'Electricity';
        if (value === 1 || value === '1') return 'Water';
        if (value === 2 || value === '2') return 'Gas';
      }
      return value;
    },
    confirmSelection() {
      if (this.selectedRow) {
        this.$emit("select", this.selectedRow);
      }
    }
  }
};
</script>


<style scoped>
.picker-backdrop { z-index: 2200; background: var(--bg-overlay); backdrop-filter: blur(12px); }
.picker-modal {
  width: 920px !important;
  max-width: 94vw !important;
  max-height: 90vh !important;
  box-shadow: var(--shadow-xl);
}
.modal-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  background: linear-gradient(135deg, var(--primary-light), var(--bg-card));
}
.picker-title-block {
  min-width: 0;
  display: grid;
  gap: 3px;
}
.picker-kicker {
  color: var(--primary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.modal-title {
  font-size: 14px;
  font-weight: 800;
  color: var(--text-strong);
  line-height: 1.25;
  margin: 0;
}
.modal-close {
  width: 38px;
  height: 38px;
  margin-left: auto;
  flex: 0 0 38px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
}
.modal-close svg { width: 17px; height: 17px; }
.modal-close:hover {
  color: var(--danger);
  border-color: var(--danger);
  background: var(--danger-bg);
  transform: rotate(90deg);
}
.picker-body {
  padding-top: 0 !important;
}
.picker-sop-stepper {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 0 2px;
}
.picker-sop-step {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}
.picker-sop-dot {
  width: 24px;
  height: 24px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--bg-card);
}
.picker-sop-step.active,
.picker-sop-step.done {
  color: var(--primary);
}
.picker-sop-step.active .picker-sop-dot,
.picker-sop-step.done .picker-sop-dot {
  color: var(--text-inverse);
  background: var(--primary);
  border-color: var(--primary);
}
.picker-sop-line {
  flex: 1;
  height: 2px;
  background: var(--border-color);
}
.picker-sop-line.done {
  background: var(--primary);
}
.picker-search-bar {
  display: flex;
  gap: 12px;
  margin: 16px 0;
  flex-wrap: nowrap;
  align-items: center;
}
.picker-search-input {
  flex: 1;
  min-width: 0;
  height: 42px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-page);
  color: var(--text-strong);
  font-size: 14px;
  outline: 0;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
}
.picker-search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
  background: var(--bg-card);
}
.picker-search-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  width: 42px;
  min-width: 42px;
  padding: 0;
  background: var(--primary);
  border-radius: var(--radius-md);
  font-size: 0;
  line-height: 0;
}
.picker-search-btn svg {
  width: 18px;
  height: 18px;
}
.picker-table-container {
  border-top: 0;
}
.picker-table {
  width: max-content;
}
.picker-table :deep(th),
.picker-table :deep(td) {
  text-align: center;
}
.picker-table tr:hover td {
  background: rgba(236,253,245,.68);
}
.radio-col {
  width: 34px;
  min-width: 34px !important;
  max-width: 34px;
  padding-left: 8px !important;
  padding-right: 8px !important;
  border-right: 1px solid var(--border-color);
}
.selected-row td {
  background-color: rgba(5,150,105,.08) !important;
  box-shadow: inset 3px 0 0 var(--primary);
}
.custom-radio {
  width: 18px;
  height: 18px;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  background: white;
  transition: all 0.2s;
}
.custom-radio.checked {
  border-color: var(--primary);
  background: var(--primary);
}
.radio-inner {
  width: 6px;
  height: 6px;
  background: white;
  border-radius: 50%;
}
.picker-pagination {
  width: 100%;
  justify-content: space-between;
}
.pagination-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.pagination-select {
  min-width: 112px;
}
.goto-input {
  width: 48px;
  text-align: center;
}
.picker-footer {
  width: 100%;
}
.picker-review {
  min-height: 280px;
  margin: 16px 0;
  padding: 18px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-page);
}
.picker-review h3 {
  margin: 0 0 14px;
  color: var(--text-strong);
  font-size: 14px;
  font-weight: 800;
}
.picker-review-grid {
  display: grid;
  gap: 8px;
}
.picker-review-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}
.picker-review-row:last-child {
  border-bottom: 0;
}
.picker-review-row span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}
.picker-review-row strong {
  color: var(--text-strong);
  font-size: 13px;
  text-align: right;
  word-break: break-word;
}
.picker-state-cell {
  height: 128px;
  color: var(--text-muted);
  text-align: center;
  font-weight: 700;
}
.picker-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 8px;
  border: 2px solid var(--border-mid);
  border-top-color: var(--primary);
  border-radius: 999px;
  vertical-align: -2px;
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) {
  .picker-modal { width: calc(100vw - 18px) !important; max-height: calc(100vh - 18px) !important; }
  .picker-body { padding-inline: 14px !important; }
  .picker-search-bar { gap: 8px; flex-wrap: nowrap; }
  .picker-search-input { width: auto; min-width: 0; }
  .picker-search-btn { width: 42px; min-width: 42px; }
  .picker-pagination, .pagination-controls { width: 100%; }
}
</style>
