<template>
  <section class="table-page" :aria-label="route.title">
    <div v-if="errorMessage" class="table-error" role="alert">
      <span>{{ errorMessage }}</span>
      <button class="btn primary" type="button" @click="load">Refresh</button>
    </div>
    <div class="filter-toolbar">
      <select v-if="supportsSiteFilter" v-model="selectedSite" class="sort-select" aria-label="Site filter" @change="load">
        <option v-for="option in siteOptions" :key="option.value || 'all-sites'" :value="option.value">{{ option.label }}</option>
      </select>
      <template v-if="route.actions.includes('Sort')">
        <select v-model="sortDirection" class="sort-select" aria-label="Sort direction" :disabled="fixedSortPolicy">
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
        <button class="btn" type="button" :disabled="fixedSortPolicy" @click="applyControls">Sort</button>
      </template>
      <template v-if="route.actions.includes('Search')">
        <input v-model="searchTerm" class="search-input" type="search" placeholder="Search Term" aria-label="Search Term" @keyup.enter="applyControls">
        <button class="btn primary" type="button" @click="applyControls">Search</button>
      </template>
      <button v-if="route.actions.includes('Reset')" class="btn primary" type="button" @click="resetControls">Reset</button>
      <button v-for="action in toolbarActions" :key="action" :class="buttonClass(action)" type="button" @click="openAction(action, action === 'Add' ? {} : (selectedRow || visibleRows[0] || {}))">{{ action }}</button>
    </div>
    <p v-if="route.note" class="quota-line">{{ route.note }}</p>
    <div class="table-scroll">
      <table>
        <thead><tr><th v-for="column in route.columns" :key="column" :class="column === 'Actions' ? 'action-column' : ''">{{ column }}</th></tr></thead>
        <tbody>
          <tr v-if="!visibleRows.length"><td class="empty-cell" :colspan="route.columns.length">{{ errorMessage ? "Load failed" : "No Data" }}</td></tr>
          <tr v-for="(row, rowIndex) in visibleRows" :key="rowIndex" :class="{ selected: row === selectedRow }" @click="selectedRow = row">
            <td v-for="column in route.columns" :key="column" :class="column === 'Actions' ? 'action-column' : ''">
              <span v-if="column === 'Actions'">
                <button v-for="action in rowActions" :key="action" :class="rowActionClass(action)" type="button" @click.stop="openAction(action, row)">{{ action }}</button>
              </span>
              <span v-else-if="isStatusColumn(column, cell(row, column, rowIndex))" :class="statusClass(cell(row, column, rowIndex))">
                {{ cell(row, column, rowIndex) }}
                <span v-html="statusIcon(cell(row, column, rowIndex))"></span>
              </span>
              <!-- Success rate: always a pill, 3 color tiers -->
              <span v-else-if="isSuccessRateColumn(column)" :class="successRatePillClass(cell(row, column, rowIndex))">
                {{ cell(row, column, rowIndex) || '0%' }}
              </span>
              <span v-else-if="isRateColumn(column, cell(row, column, rowIndex))" :class="rateClass(cell(row, column, rowIndex))">
                {{ cell(row, column, rowIndex) }}
              </span>
              <button
                v-else-if="isTaskValueColumn(column)"
                class="data-value-trigger"
                type="button"
                :disabled="!hasTaskValue(row)"
                @click.stop="openDetail(row)"
              >
                <svg viewBox="0 0 128 128" aria-hidden="true"><path d="M64 24C30 24 8 64 8 64s22 40 56 40 56-40 56-40-22-40-56-40zm0 66c-14.36 0-26-11.64-26-26s11.64-26 26-26 26 11.64 26 26-11.64 26-26 26zm0-40c-7.73 0-14 6.27-14 14s6.27 14 14 14 14-6.27 14-14-6.27-14-14-14z"/></svg>
                <span>{{ hasTaskValue(row) ? "Inspect" : "Empty" }}</span>
              </button>
              <span v-else>{{ cell(row, column, rowIndex) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="pagination">
      <span>Total {{ filteredTotal }}</span>
      <select v-model.number="pageSize" class="sort-select" aria-label="Page size" @change="changePageSize">
        <option v-for="option in pageSizeOptions" :key="option" :value="option">{{ option }}/page</option>
      </select>
      <button class="page-chip" type="button" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">&lt;</button>
      <button v-for="page in pages" :key="page" :class="['page-chip', page === currentPage ? 'active' : '']" type="button" @click="goToPage(page)">{{ page }}</button>
      <button class="page-chip" type="button" :disabled="currentPage === pageCount" @click="goToPage(currentPage + 1)">&gt;</button>
      <span>Go to</span>
    </div>
    <ActionModal v-if="modalAction" :action="modalAction" :route="route" :row="activeRow" :rows="filteredRows" @close="closeModal" @done="handleModalDone" />
    <TaskOutputModal v-if="detailRow" :row="detailRow" @close="detailRow = null" />
  </section>
</template>

<script>
import ActionModal from "./ActionModal.vue";
import TaskOutputModal from "./TaskOutputModal.vue";
import { columnKey, createFormSeed, fetchTableData, pageNumbers, pageSizeOptions, paginateRows, routeSortDirection, routeSortPolicy, routeSupportsSiteFilter, rowActionButtons, searchRows, sortRows, tableSiteOptions, totalPages } from "../services/table-service";

export default {
  name: "TablePage",
  components: { ActionModal, TaskOutputModal },
  props: {
    route: { type: Object, required: true }
  },
  data() {
    return {
      allRows: [],
      total: 0,
      filteredRows: [],
      visibleRows: [],
      filteredTotal: 0,
      currentPage: 1,
      pageSize: 10,
      searchTerm: "",
      selectedSite: "",
      sortDirection: routeSortDirection(this.route),
      modalAction: "",
      selectedRow: null,
      activeRow: {},
      detailRow: null,
      errorMessage: ""
    };
  },
  computed: {
    pageSizeOptions() {
      return pageSizeOptions;
    },
    toolbarActions() {
      return this.route.actions.filter((name) => !["Sort", "Search", "Reset", "Cancel", "Confirm", "Print", "Edit", "Recharge", "Generate Token", "Delete", "Close", "Add Task"].includes(name));
    },
    siteOptions() {
      return tableSiteOptions;
    },
    supportsSiteFilter() {
      return routeSupportsSiteFilter(this.route);
    },
    rowActions() {
      return rowActionButtons(this.route);
    },
    pageCount() {
      return totalPages(this.filteredTotal, this.pageSize);
    },
    fixedSortPolicy() {
      return routeSortPolicy(this.route).fixed;
    },
    pages() {
      return pageNumbers(this.currentPage, this.pageCount);
    }
  },
  watch: {
    route: {
      immediate: true,
      handler() {
        this.selectedSite = "";
        this.sortDirection = routeSortDirection(this.route);
        this.load();
      }
    }
  },
  methods: {
    async load() {
      this.errorMessage = "";
      try {
        const table = await fetchTableData(this.route, {
          siteId: this.supportsSiteFilter ? this.selectedSite : undefined
        });
        this.allRows = table.rows;
        this.total = table.total;
        this.applyControls();
      } catch (error) {
        this.allRows = [];
        this.filteredRows = [];
        this.visibleRows = [];
        this.filteredTotal = 0;
        this.selectedRow = null;
        this.errorMessage = error?.message || "Unable to load data";
      }
    },
    applyControls() {
      const searchedRows = searchRows(this.route, this.allRows, this.searchTerm);
      const sortedRows = sortRows(this.route, searchedRows, this.sortDirection);
      this.filteredRows = sortedRows;
      this.filteredTotal = sortedRows.length;
      this.currentPage = Math.min(this.currentPage, totalPages(this.filteredTotal, this.pageSize));
      this.visibleRows = paginateRows(sortedRows, this.currentPage, this.pageSize);
      this.selectedRow = this.visibleRows[0] || null;
    },
    resetControls() {
      this.searchTerm = "";
      this.selectedSite = "";
      this.sortDirection = routeSortDirection(this.route);
      this.pageSize = 10;
      this.currentPage = 1;
      if (this.supportsSiteFilter) {
        this.load();
        return;
      }
      this.applyControls();
    },
    goToPage(page) {
      this.currentPage = Math.max(1, Math.min(this.pageCount, page));
      this.visibleRows = paginateRows(this.filteredRows, this.currentPage, this.pageSize);
      this.selectedRow = this.visibleRows[0] || null;
    },
    changePageSize() {
      this.currentPage = 1;
      this.applyControls();
    },
    cell(row, column, rowIndex) {
      return row[columnKey(column)] || "";
    },
    isStatusColumn(column, value) {
      if (column === 'Status' || column === 'State' || column === 'Result' || column === 'Success') return true;
      const val = String(value || '').toLowerCase();
      return ['success', 'failed', 'error', 'online', 'offline', 'active', 'inactive', 'pending', 'true', 'false', 'failure'].includes(val);
    },
    statusClass(value) {
      if (!value && value !== false) return '';
      const val = String(value).toLowerCase();
      if (['online', 'active', 'success', 'true'].includes(val)) return 'status-badge status-success';
      if (['offline', 'inactive', 'failed', 'error', 'false', 'failure'].includes(val)) return 'status-badge status-danger';
      if (['pending', 'waiting', 'processing'].includes(val)) return 'status-badge status-warning';
      return 'status-badge status-default';
    },
    statusIcon(value) {
      if (!value) return '';
      const val = String(value).toLowerCase();
      if (val === 'failure' || val === 'failed') {
        return '<svg class="failure-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
      }
      return '';
    },
    isRateColumn(column, value) {
      if (column.toLowerCase().includes('rate') || column.toLowerCase().includes('percent')) return true;
      return String(value || '').includes('%');
    },
    isSuccessRateColumn(column) {
      return column === 'successRate' || column === 'SuccessRate' || column === 'Success Rate';
    },
    successRatePillClass(value) {
      const num = parseFloat(String(value || '0').replace('%', ''));
      if (isNaN(num) || num === 0) return 'sr-pill sr-red';
      if (num >= 50) return 'sr-pill sr-green';
      return 'sr-pill sr-blue';
    },
    successRingStyle(value) {
      const num = Math.min(100, Math.max(0, parseFloat(String(value || '0').replace('%', '')) || 0));
      const circ = 2 * Math.PI * 15;
      const dash = (num / 100) * circ;
      return {
        stroke: this.successRateColor(value),
        strokeDasharray: `${dash} ${circ}`,
        strokeDashoffset: 0
      };
    },
    rateClass(value) {
      if (!value) return '';
      const num = parseFloat(String(value).replace('%', ''));
      if (isNaN(num)) return '';
      if (num === 0) return 'rate-danger-text';
      return 'rate-badge';
    },
    buttonClass(action) {
      return ["btn", ["Add", "Import", "Export"].includes(action) ? "primary" : ["Delete", "Cancel"].includes(action) ? "danger" : ""];
    },
    isTaskValueColumn(column) {
      return this.route.hash.includes("remote-meter-reading-task") && column === "dataValue";
    },
    hasTaskValue(row) {
      return Boolean(row?.dataValue || row?.data);
    },
    rowActionClass(action) {
      return ["link-btn", ["Delete", "Cancel"].includes(action) ? "danger" : ""];
    },
    openDetail(row) {
      this.detailRow = row;
    },
    openAction(action, row) {
      this.activeRow = createFormSeed(this.route, action, row);
      this.selectedRow = row || null;
      this.modalAction = action;
    },
    closeModal() {
      this.modalAction = "";
      this.activeRow = {};
    },
    handleModalDone() {
      this.closeModal();
      this.load();
    }
  }
};
</script>

<style scoped>
.data-value-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 12px;
  padding: 6px 12px;
  background: rgba(238, 246, 255, 0.6);
  backdrop-filter: blur(4px);
  color: #1677ff;
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: all 0.2s ease;
}

.data-value-trigger svg {
  width: 14px;
  height: 14px;
  fill: currentColor;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.data-value-trigger:hover {
  background: #1677ff;
  color: #fff;
  border-color: #1677ff;
  box-shadow: 0 4px 12px rgba(22, 119, 255, 0.3);
}

.data-value-trigger:hover svg {
  transform: scale(1.2) rotate(15deg);
}

.data-value-trigger:disabled {
  background: #f4f6f8;
  color: #94a3b8;
  border-color: transparent;
  cursor: not-allowed;
  box-shadow: none;
}
/* ── Success Rate pills ────────────────────── */
.sr-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  min-width: 58px;
}
.sr-red   { background: #fee2e2; color: #ef4444; }
.sr-green { background: #d1fae5; color: #10b981; }
.sr-blue  { background: #dbeafe; color: #3b82f6; }
</style>
