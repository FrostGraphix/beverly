<template>
  <div class="modal-backdrop show picker-backdrop" role="dialog" aria-modal="true">
    <div class="modal picker-modal">
      <div class="modal-header">
        <h2 class="modal-title">{{ label }}</h2>
        <button class="modal-close" type="button" @click="$emit('close')">&#10005;</button>
      </div>
      <div class="modal-body picker-body">
        <div class="picker-search-bar">
          <input v-model="searchTerm" placeholder="Search Term" class="picker-search-input" @keyup.enter="load">
          <button class="btn btn-primary picker-search-btn" type="button" @click="search">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            Search
          </button>
        </div>

        <div class="picker-table-container">
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
              <tr v-if="loading"><td :colspan="columns.length + 1" class="text-center py-4">Loading...</td></tr>
              <tr v-else-if="!rows.length"><td :colspan="columns.length + 1" class="text-center py-4">No data found</td></tr>
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

        <div class="picker-pagination">
          <div class="pagination-info">Total {{ totalRecords }}</div>
          <div class="pagination-controls">
            <select v-model="pageSize" class="pagination-select" @change="onPageSizeChange">
              <option :value="10">10/page</option>
              <option :value="20">20/page</option>
              <option :value="50">50/page</option>
              <option :value="100">100/page</option>
            </select>
            <button class="btn-page" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">&lt;</button>
            <button
              v-for="p in pageNumbers" :key="p"
              class="btn-page"
              :class="{ active: p === currentPage }"
              @click="goToPage(p)"
            >{{ p }}</button>
            <button class="btn-page" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">&gt;</button>
            <span class="goto-text">Go to</span>
            <input v-model="gotoPage" type="text" class="goto-input" @keyup.enter="onGoto">
          </div>
        </div>
      </div>
      <div class="modal-actions picker-footer">
        <button class="btn btn-outline-alt" type="button" @click="$emit('close')">Cancel</button>
        <button class="btn btn-primary" type="button" :disabled="!selectedRow" @click="confirmSelection">Confirm</button>
      </div>
    </div>
  </div>
</template>

<script>
import { postApi } from "../services/api";

export default {
  name: "PickerModal",
  props: {
    api: { type: String, required: true },
    columns: { type: Array, required: true },
    columnLabels: { type: Array, default: () => [] },
    label: { type: String, default: "" }
  },
  data() {
    return {
      rows: [],
      loading: false,
      searchTerm: "",
      selectedRow: null,
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
      } else {
        const key = Object.keys(row).find(k => k.toLowerCase() === col.toLowerCase());
        value = key ? row[key] : '';
      }
      // Normalize meterType numeric codes to human-readable labels
      if (col === 'meterType') {
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
.picker-backdrop {
  z-index: 1200;
}
.picker-modal {
  width: 780px !important;
  max-width: 90vw !important;
  height: auto !important;
  max-height: 90vh !important;
  background: white !important;
  border-radius: 4px !important;
}
.modal-header {
  padding: 16px 24px;
  border-bottom: none;
}
.modal-title {
  font-size: 20px;
  font-weight: 500;
  color: #333;
}
.picker-body {
  padding: 0 24px 16px !important;
}
.picker-search-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}
.picker-search-input {
  width: 180px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
}
.picker-search-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 20px;
  background: #1890ff;
  border-radius: 4px;
  font-size: 14px;
}
.picker-table-container {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  overflow: hidden;
}
.picker-table {
  width: 100%;
  border-collapse: collapse;
}
.picker-table th {
  background: white;
  padding: 12px 16px;
  text-align: center;
  font-size: 14px;
  color: #909399;
  font-weight: 500;
  border-bottom: 1px solid #ebeef5;
}
.picker-table td {
  padding: 12px 16px;
  text-align: center;
  font-size: 14px;
  color: #606266;
  border-bottom: 1px solid #ebeef5;
  cursor: pointer;
}
.radio-col {
  width: 48px;
  border-right: 1px solid #ebeef5;
}
.selected-row td {
  background-color: #ecf5ff !important;
}
.custom-radio {
  width: 16px;
  height: 16px;
  border: 1px solid #dcdfe6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  background: white;
  transition: all 0.2s;
}
.custom-radio.checked {
  border-color: #1890ff;
  background: #1890ff;
}
.radio-inner {
  width: 6px;
  height: 6px;
  background: white;
  border-radius: 50%;
}
.picker-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 16px;
  margin-top: 16px;
  padding: 0 8px;
  font-size: 13px;
  color: #606266;
}
.pagination-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pagination-select {
  height: 28px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0 8px;
}
.btn-page {
  min-width: 28px;
  height: 28px;
  border: 1px solid #dcdfe6;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  color: #606266;
}
.btn-page.active {
  background: #1890ff;
  color: white;
  border-color: #1890ff;
}
.btn-page:disabled {
  background: #f4f4f5;
  cursor: not-allowed;
  color: #c0c4cc;
}
.goto-input {
  width: 40px;
  height: 28px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  text-align: center;
}
.picker-footer {
  padding: 16px 24px 24px !important;
}
.btn-outline-alt {
  border: 1px solid #dcdfe6;
  background: white;
  color: #606266;
  padding: 8px 20px;
  border-radius: 4px;
}
.btn-outline-alt:hover {
  border-color: #c6e2ff;
  background-color: #ecf5ff;
  color: #409eff;
}
.py-4 { padding-top: 16px; padding-bottom: 16px; }
.text-capitalize { text-transform: capitalize; }
</style>
