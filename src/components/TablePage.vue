<template>
  <BaseTableShell class="table-page" :aria-label="route.title">
    <template #alert>
      <div v-if="errorMessage" class="table-error" role="alert">
        <span>{{ errorMessage }}</span>
        <BaseButton variant="primary" @click="load">Refresh</BaseButton>
      </div>
    </template>
    <template #toolbar>
      <div class="filter-toolbar">
        <BaseSelect v-if="supportsSiteFilter" v-model="selectedSite" class="sort-select" aria-label="Site filter" @change="load">
          <option v-for="option in siteOptions" :key="option.value || 'all-sites'" :value="option.value">{{ option.label }}</option>
        </BaseSelect>
        <template v-if="route.actions.includes('Sort')">
          <BaseSelect v-model="sortDirection" class="sort-select" aria-label="Sort direction" :disabled="fixedSortPolicy">
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </BaseSelect>
          <BaseButton :disabled="fixedSortPolicy" @click="applyControls">Sort</BaseButton>
        </template>
        <template v-if="route.actions.includes('Search')">
          <BaseInput v-model="searchTerm" class="search-input" type="search" placeholder="Search Term" aria-label="Search Term" @keyup.enter="applyControls" />
          <BaseButton variant="primary" @click="applyControls">Search</BaseButton>
        </template>
        <BaseButton v-if="route.actions.includes('Reset')" @click="resetControls">Reset</BaseButton>
        <BaseButton v-for="action in toolbarActions" :key="action" :variant="buttonVariant(action)" @click="openAction(action, action === 'Add' ? {} : (selectedRow || visibleRows[0] || {}))">{{ action }}</BaseButton>
      </div>
    </template>
    <template #summary>
      <div class="table-command-strip" aria-live="polite">
        <div>
          <span>{{ filteredTotal }} visible</span>
        </div>
        <div class="table-command-meta">
          <span>Page {{ currentPage }} / {{ pageCount }}</span>
          <span>{{ pageSize }}/page</span>
        </div>
      </div>
      <p v-if="route.note" class="quota-line">{{ route.note }}</p>
    </template>
    <div class="table-scroll">
      <table>
        <thead><tr>
          <th v-if="isBatchCheckable" class="check-column"><BaseCheckbox :value="allPageChecked" @input="toggleAllPage" /></th>
          <th v-for="column in route.columns" :key="column" :class="column === 'Actions' ? 'action-column' : ''">{{ formatColumnName(column) }}</th>
        </tr></thead>
        <tbody>
          <template v-if="loading">
            <tr v-for="i in 5" :key="`sk-${i}`" class="skeleton-row">
              <td v-if="isBatchCheckable"><div class="skeleton-cell" style="width:18px"></div></td>
              <td v-for="column in route.columns" :key="column">
                <div class="skeleton-cell" :style="{ width: column === 'Actions' ? '80px' : `${60 + (i * 17) % 40}%` }"></div>
              </td>
            </tr>
          </template>
          <tr v-else-if="!visibleRows.length">
            <td class="empty-cell" :colspan="isBatchCheckable ? route.columns.length + 1 : route.columns.length">
              <svg style="width:36px;height:36px;opacity:.25;display:block;margin:0 auto 8px" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/></svg>
              {{ errorMessage ? "Load failed" : "No data found" }}
            </td>
          </tr>
          <tr v-else v-for="(row, rowIndex) in visibleRows" :key="rowIndex" :class="{ selected: row === selectedRow, checked: isRowChecked(row) }" @click="selectedRow = row">
            <td v-if="isBatchCheckable" class="check-column" @click.stop>
              <BaseCheckbox :value="isRowChecked(row)" @input="toggleRow(row)" />
            </td>
            <td v-for="column in route.columns" :key="column" :class="column === 'Actions' ? 'action-column' : ''">
              <span v-if="column === 'Actions'" class="action-btn-group">
                <BaseButton v-for="action in rowActions" :key="action" :class="rowActionClass(action)" :aria-label="`${action} row ${rowIndex + 1}`" @click.stop="openAction(action, row)">
                  <svg v-if="action === 'Edit'" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                  <svg v-else-if="action === 'Delete'" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                  {{ action }}
                </BaseButton>
              </span>
              <span v-else-if="isStatusColumn(column, cell(row, column, rowIndex))" :class="statusClass(cell(row, column, rowIndex))">
                {{ cell(row, column, rowIndex) }}
                <span v-html="statusIcon(cell(row, column, rowIndex))"></span>
              </span>
              <span v-else-if="isSuccessRateColumn(column)" :class="successRatePillClass(cell(row, column, rowIndex))">
                {{ cell(row, column, rowIndex) || '0%' }}
              </span>
              <span v-else-if="isRateColumn(column, cell(row, column, rowIndex))" :class="rateClass(cell(row, column, rowIndex))">
                {{ cell(row, column, rowIndex) }}
              </span>
              <BaseButton
                v-else-if="isTaskValueColumn(column)"
                class="data-value-trigger"
                :disabled="!hasTaskValue(row)"
                @click.stop="openDetail(row)"
              >
                <svg viewBox="0 0 128 128" aria-hidden="true"><path d="M64 24C30 24 8 64 8 64s22 40 56 40 56-40 56-40-22-40-56-40zm0 66c-14.36 0-26-11.64-26-26s11.64-26 26-26 26 11.64 26 26-11.64 26-26 26zm0-40c-7.73 0-14 6.27-14 14s6.27 14 14 14 14-6.27 14-14-6.27-14-14-14z"/></svg>
                <span>{{ hasTaskValue(row) ? "Inspect" : "Empty" }}</span>
              </BaseButton>
              <span v-else>{{ cell(row, column, rowIndex) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <template #footer>
      <div class="pagination">
        <span>Total {{ filteredTotal }}</span>
        <BaseSelect v-model="pageSize" class="sort-select" aria-label="Page size" @change="changePageSize">
          <option v-for="option in pageSizeOptions" :key="option" :value="option">{{ option }}/page</option>
        </BaseSelect>
        <BaseButton class="page-chip" size="sm" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">&#8249;</BaseButton>
        <BaseButton v-for="page in pages" :key="page" :class="['page-chip', page === currentPage ? 'active' : '']" size="sm" @click="goToPage(page)">{{ page }}</BaseButton>
        <BaseButton class="page-chip" size="sm" :disabled="currentPage === pageCount" @click="goToPage(currentPage + 1)">&#8250;</BaseButton>
        <span>Go to</span>
      </div>
    </template>
    <ActionModal v-if="modalAction" :action="modalAction" :route="route" :row="activeRow" :rows="batchModalRows" @close="closeModal" @done="handleModalDone" />
    <TaskOutputModal v-if="detailRow" :row="detailRow" @close="detailRow = null" />
  </BaseTableShell>
</template>


<script>
import ActionModal from "./ActionModal.vue";
import BaseButton from "./base/BaseButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseSelect from "./base/BaseSelect.vue";
import BaseTableShell from "./base/BaseTableShell.vue";
import TaskOutputModal from "./TaskOutputModal.vue";
import BaseCheckbox from "./base/BaseCheckbox.vue";
import { columnKey, createFormSeed, fetchTableData, isBatchCheckableRoute, pageNumbers, pageSizeOptions, paginateRows, routeSortDirection, routeSortPolicy, routeSupportsSiteFilter, rowActionButtons, searchRows, sortRows, tableSiteOptions, totalPages } from "../services/table-service";
import { toastWarn } from "../services/toast.js";

export default {
  name: "TablePage",
  components: { ActionModal, BaseButton, BaseCheckbox, BaseInput, BaseSelect, BaseTableShell, TaskOutputModal },
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
      errorMessage: "",
      loading: false,
      checkedMeterIds: new Set()
    };
  },
  computed: {
    pageSizeOptions() {
      return pageSizeOptions;
    },
    isBatchCheckable() {
      return isBatchCheckableRoute(this.route);
    },
    toolbarActions() {
      return this.route.actions.filter((name) => {
        if (["Sort", "Search", "Reset", "Cancel", "Confirm", "Print", "Edit", "Recharge", "Generate Token", "Delete", "Close"].includes(name)) return false;
        if (name === "Add Task" && this.route.columns.includes("Actions")) return false;
        return true;
      });
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
    },
    allPageChecked() {
      if (!this.visibleRows.length) return false;
      return this.visibleRows.every((row) => row.meterId && this.checkedMeterIds.has(String(row.meterId)));
    },
    checkedRowCount() {
      return this.checkedMeterIds.size;
    },
    batchModalRows() {
      if (this.modalAction === "Add Batch Task" && this.isBatchCheckable) {
        const ids = this.checkedMeterIds;
        return this.filteredRows.filter((row) => row.meterId && ids.has(String(row.meterId)));
      }
      return this.filteredRows;
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
      this.loading = true;
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
      } finally {
        this.loading = false;
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
      this.checkedMeterIds = new Set();
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
    formatColumnName(column) {
      if (!column) return "";
      if (column === "successRate") return "Success Rate";
      // Handle camelCase generically
      return column.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, str => str.toUpperCase());
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
    buttonVariant(action) {
      if (["Add", "Import", "Export"].includes(action)) return "primary";
      if (["Delete", "Cancel"].includes(action)) return "danger";
      return "secondary";
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
    isRowChecked(row) {
      return Boolean(row?.meterId && this.checkedMeterIds.has(String(row.meterId)));
    },
    toggleRow(row) {
      if (!row?.meterId) return;
      const id = String(row.meterId);
      const next = new Set(this.checkedMeterIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      this.checkedMeterIds = next;
    },
    toggleAllPage() {
      const next = new Set(this.checkedMeterIds);
      if (this.allPageChecked) {
        for (const row of this.visibleRows) {
          if (row.meterId) next.delete(String(row.meterId));
        }
      } else {
        for (const row of this.visibleRows) {
          if (row.meterId) next.add(String(row.meterId));
        }
      }
      this.checkedMeterIds = next;
    },
    openAction(action, row) {
      if (action === "Add Batch Task" && this.isBatchCheckable && !this.checkedMeterIds.size) {
        toastWarn("Select at least one meter first");
        return;
      }
      this.activeRow = { ...(row || {}), ...createFormSeed(this.route, action, row) };
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
.table-scroll table {
  min-width: max-content;
}

.data-value-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border-mid);
  border-radius: 12px;
  padding: 6px 12px;
  background: var(--primary-light);
  backdrop-filter: blur(4px);
  color: var(--primary);
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
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
  box-shadow: var(--shadow-glow-sm);
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
</style>
