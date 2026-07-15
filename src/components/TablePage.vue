<template>
  <BaseTableShell class="table-page" :aria-label="route.title">
    <template #alert>
      <div v-if="errorMessage" class="table-error" role="alert">
        <span>{{ errorMessage }}</span>
        <BaseButton variant="primary" @click="load">Refresh</BaseButton>
      </div>
    </template>
    <template #toolbar>
      <div class="filter-toolbar ddm-toolbar" data-testid="table-apply-controls" @click="closeSortDirectionMenu">
        <div class="ddm-toolbar-group ddm-search-group">
          <BaseSelect v-if="supportsSiteFilter" v-model="selectedSite" class="sort-select" aria-label="Station ID filter" @change="applySiteFilter">
            <option v-for="option in siteOptions" :key="option.value || 'all-sites'" :value="option.value">{{ option.label }}</option>
          </BaseSelect>
          <BaseSelect v-if="supportsMeterPhaseFilter" v-model="meterPhaseFilter" class="sort-select" aria-label="Meter phase filter" @change="applyControls">
            <option value="all">All phases</option>
            <option value="single-phase">Single-phase only</option>
            <option value="three-phase">3-phase only</option>
          </BaseSelect>
          <BaseInput v-if="route.actions.includes('Search')" v-model="searchTerm" class="search-input" type="search" placeholder="Search Term" aria-label="Search Term" @keyup.enter="applyControls" />
        </div>
        
        <div class="ddm-toolbar-group ddm-sort-group">
          <template v-if="route.actions.includes('Sort') && !fixedSortPolicy">
            <BaseSelect v-model="sortField" class="sort-select" aria-label="Sort by" @change="applyControls">
              <option value="">Sort by...</option>
              <option v-for="column in sortableColumns" :key="column" :value="getColKey(column)">{{ formatColumnName(column) }}</option>
            </BaseSelect>
          </template>
          <template v-if="route.actions.includes('Sort') && !fixedSortPolicy">
            <BaseSelect v-model="sortDirection" class="sort-select" aria-label="Sort direction" @change="applyControls">
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </BaseSelect>
          </template>
          <template v-else-if="route.actions.includes('Sort')">
            <div class="sort-direction-menu">
              <BaseButton
                class="sort-direction-menu__toggle"
                aria-label="Sort direction options"
                :aria-expanded="sortDirectionMenuOpen ? 'true' : 'false'"
                @click.stop="toggleSortDirectionMenu"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v12"></path>
                  <path d="m4 9 4-4 4 4"></path>
                  <path d="M16 19V7"></path>
                  <path d="m12 15 4 4 4-4"></path>
                </svg>
              </BaseButton>
              <div v-if="sortDirectionMenuOpen" class="sort-direction-menu__panel" role="menu">
                <BaseButton class="sort-direction-menu__item" :class="{ active: sortDirection === 'asc' }" @click.stop="setSortDirection('asc')">Ascending</BaseButton>
                <BaseButton class="sort-direction-menu__item" :class="{ active: sortDirection === 'desc' }" @click.stop="setSortDirection('desc')">Descending</BaseButton>
              </div>
            </div>
          </template>
        </div>

        <div class="ddm-toolbar-group ddm-actions-group">
          <BaseButton v-if="showResetButton" data-testid="table-reset-controls" @click="resetControls">Reset</BaseButton>
          <BaseButton
            v-for="action in toolbarActions"
            :key="action"
            :variant="buttonVariant(action)"
            :data-testid="`table-toolbar-action-${actionTestId(action)}`"
            @click="openAction(action, action === 'Add' ? {} : (selectedRow || visibleRows[0] || {}))"
          >{{ action }}</BaseButton>
          <ExportRangeMenu
            v-if="route.actions.includes('Export')"
            ref="exportMenu"
            v-model="exportRange"
            :title="`Export ${route.title.toLowerCase()}`"
            :search-term="searchTerm"
            :sort-label="sortDirection === 'desc' ? 'Newest first' : 'Oldest first'"
            :error="exportError"
            :loading="exportLoading"
            :disabled="!displayedTotal"
            @download="downloadExport"
          />
        </div>
      </div>
    </template>
    <template #summary>
      <div class="table-command-strip" aria-live="polite">
        <div>
          <span>{{ displayedTotal }} visible</span>
        </div>
        <div class="table-command-meta">
          <span>Page {{ currentPage }} / {{ pageCount }}</span>
          <span>{{ pageSize }}/page</span>
        </div>
      </div>
      <p v-if="route.note" class="quota-line">{{ route.note }}</p>
    </template>
    <div class="table-scroll" @click="closeRowActionMenu">
      <table>
        <thead><tr>
          <th v-if="isBatchCheckable" class="check-column"><BaseCheckbox data-testid="table-select-all" :value="allPageChecked" @input="toggleAllPage" /></th>
          <th
            v-for="column in route.columns"
            :key="column"
            :class="column === 'Actions' ? 'action-column' : ''"
            :data-column-key="getColKey(column)"
          >{{ formatColumnName(column) }}</th>
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
              <strong>{{ errorMessage ? "Load failed" : "No records yet" }}</strong>
              <BaseButton size="sm" @click="load">Refresh</BaseButton>
            </td>
          </tr>
          <tr v-else v-for="(row, rowIndex) in visibleRows" :key="rowIndex" :class="{ selected: row === selectedRow, checked: isRowChecked(row) }" @click="selectedRow = row">
            <td v-if="isBatchCheckable" class="check-column" @click.stop>
              <BaseCheckbox :data-testid="`table-select-row-${rowIndex + 1}`" :value="isRowChecked(row)" @input="toggleRow(row)" />
            </td>
            <td
              v-for="column in route.columns"
              :key="column"
              :class="column === 'Actions' ? ['action-column', { 'action-column--menu-open': isRowActionMenuOpen(rowIndex) }] : ''"
              :data-column-key="getColKey(column)"
            >
              <span v-if="column === 'Actions'" class="action-cell-controls">
                <span class="action-btn-group action-btn-group--desktop">
                  <BaseButton
                    v-for="action in rowActions"
                    :key="action"
                    :class="rowActionClass(action)"
                    :aria-label="`${action} row ${rowIndex + 1}`"
                    :data-testid="`table-row-action-${actionTestId(action)}-${rowIndex + 1}`"
                    @click.stop="openAction(action, row)"
                  >
                    <svg v-if="action === 'Edit'" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                    <svg v-else-if="action === 'Delete'" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    {{ action }}
                  </BaseButton>
                </span>
                <div class="row-action-menu">
                  <BaseButton
                    class="row-action-menu__toggle"
                    aria-label="Open row actions"
                    :aria-expanded="isRowActionMenuOpen(rowIndex)"
                    :data-testid="`table-row-action-menu-${rowIndex + 1}`"
                    @click.stop="toggleRowActionMenu(rowIndex)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="5" r="2"></circle>
                      <circle cx="12" cy="12" r="2"></circle>
                      <circle cx="12" cy="19" r="2"></circle>
                    </svg>
                  </BaseButton>
                  <div v-if="isRowActionMenuOpen(rowIndex)" :class="['row-action-menu__panel', { 'row-action-menu__panel--drop-up': shouldDropUp(rowIndex) }]" role="menu">
                    <BaseButton
                      v-for="action in rowActions"
                      :key="`mobile-${action}`"
                      class="row-action-menu__item"
                      role="menuitem"
                      :data-action="action.toLowerCase()"
                      @click.stop="openRowActionFromMenu(action, row)"
                    >
                      {{ action }}
                    </BaseButton>
                  </div>
                </div>
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
    <div class="mobile-table-cards" aria-hidden="true">
      <template v-if="loading">
        <article v-for="i in 4" :key="`mobile-sk-${i}`" class="mobile-table-card skeleton-row">
          <div v-for="n in 5" :key="n" class="mobile-card-line">
            <div class="skeleton-cell" :style="{ width: `${42 + ((i + n) * 9) % 36}%` }"></div>
          </div>
        </article>
      </template>
      <div v-else-if="!visibleRows.length" class="mobile-table-empty">
        <strong>{{ errorMessage ? "Load failed" : "No records yet" }}</strong>
        <BaseButton size="sm" @click="load">Refresh</BaseButton>
      </div>
      <article v-else v-for="(row, rowIndex) in visibleRows" :key="`mobile-row-${rowIndex}`" class="mobile-table-card" :class="{ selected: row === selectedRow }" @click="selectedRow = row">
        <div class="mobile-table-card__head">
          <strong>{{ primaryCell(row) }}</strong>
          <span v-if="secondaryCell(row)">{{ secondaryCell(row) }}</span>
        </div>
        <div class="mobile-table-card__body">
          <div v-for="column in mobileColumns" :key="column" class="mobile-table-field">
            <span class="mobile-table-field__label">{{ formatColumnName(column) }}</span>
            <span v-if="isStatusColumn(column, cell(row, column, rowIndex))" :class="statusClass(cell(row, column, rowIndex))">
              {{ cell(row, column, rowIndex) }}
            </span>
            <span v-else-if="isSuccessRateColumn(column)" :class="successRatePillClass(cell(row, column, rowIndex))">
              {{ cell(row, column, rowIndex) || '0%' }}
            </span>
            <span v-else-if="isRateColumn(column, cell(row, column, rowIndex))" :class="rateClass(cell(row, column, rowIndex))">
              {{ cell(row, column, rowIndex) }}
            </span>
            <BaseButton
              v-else-if="isTaskValueColumn(column)"
              class="data-value-trigger mobile-data-trigger"
              :disabled="!hasTaskValue(row)"
              @click.stop="openDetail(row)"
            >
              <span>{{ hasTaskValue(row) ? "Inspect" : "Empty" }}</span>
            </BaseButton>
            <span v-else class="mobile-table-field__value">{{ cell(row, column, rowIndex) }}</span>
          </div>
        </div>
        <div v-if="isBatchCheckable || rowActions.length" class="mobile-table-card__foot">
          <label v-if="isBatchCheckable" class="mobile-table-check" @click.stop>
            <BaseCheckbox :value="isRowChecked(row)" @input="toggleRow(row)" />
            <span>Select</span>
          </label>
          <div v-if="rowActions.length" class="mobile-card-actions">
            <BaseButton v-for="action in rowActions" :key="action" :variant="action === 'Delete' ? 'danger' : 'secondary'" size="sm" @click.stop="openAction(action, row)">
              {{ action }}
            </BaseButton>
          </div>
        </div>
      </article>
    </div>
    <template #footer>
      <div class="pagination">
        <span>Total {{ displayedTotal }}</span>
        <BaseSelect v-model="pageSize" class="sort-select" aria-label="Page size" @change="changePageSize">
          <option v-for="option in pageSizeOptions" :key="option" :value="option">{{ option }}/page</option>
        </BaseSelect>
        <BaseButton class="page-chip" size="sm" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">&#8249;</BaseButton>
        <BaseButton v-for="page in pages" :key="page" :class="['page-chip', page === currentPage ? 'active' : '']" size="sm" @click="goToPage(page)">{{ page }}</BaseButton>
        <BaseButton class="page-chip" size="sm" :disabled="currentPage === pageCount" @click="goToPage(currentPage + 1)">&#8250;</BaseButton>
        <span>Go to</span>
        <BaseInput
          v-model="gotoPageInput"
          class="goto-input"
          type="number"
          min="1"
          :max="pageCount"
          aria-label="Go to page"
          @keyup.enter="applyGoto"
        />
        <BaseButton class="page-chip" size="sm" @click="applyGoto">Go</BaseButton>
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
import ExportRangeMenu from "./base/ExportRangeMenu.vue";
import TaskOutputModal from "./TaskOutputModal.vue";
import BaseCheckbox from "./base/BaseCheckbox.vue";
import { columnKey, createFormSeed, exportRowsForRoute, fetchTableData, fetchTableExportData, isBatchCheckableRoute, pageNumbers, pageSizeOptions, paginateRows, resolveRowValue, routeSortDirection, routeSortPolicy, routeSupportsSiteFilter, routeUsesServerPagination, rowActionButtons, searchRows, sortRows, tableSiteOptions, totalPages } from "../services/table-service";
import { downloadTextFile, exportCsvText } from "../services/import-export.mjs";
import { isCreditTokenRoute, meterPhaseFromRow } from "../services/token-flow.mjs";
import { toastWarn } from "../services/toast.js";

export default {
  name: "TablePage",
  components: { ActionModal, BaseButton, BaseCheckbox, BaseInput, BaseSelect, BaseTableShell, ExportRangeMenu, TaskOutputModal },
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
      sortField: "",
      modalAction: "",
      selectedRow: null,
      activeRow: {},
      detailRow: null,
      errorMessage: "",
      loading: false,
      gotoPageInput: "1",
      checkedMeterIds: new Set(),
      meterPhaseFilter: "all",
      openRowActionIndex: null,
      sortDirectionMenuOpen: false,
      exportRange: "all",
      exportLoading: false,
      exportError: "",
      loadToken: 0
    };
  },
  computed: {
    pageSizeOptions() {
      return this.serverPaginated ? pageSizeOptions.filter((size) => size <= 20) : pageSizeOptions;
    },
    isBatchCheckable() {
      return isBatchCheckableRoute(this.route);
    },
    sortableColumns() {
      return (this.route.columns || []).filter(c => c !== "Actions");
    },
    mobileColumns() {
      return (this.route.columns || []).filter((column) => column !== "Actions").slice(0, 8);
    },
    toolbarActions() {
      return this.route.actions.filter((name) => {
        if (name === "Confirm" && String(this.route.hash || "").startsWith("#/remote-operation-record/")) return true;
        if (["Sort", "Search", "Reset", "Export", "Cancel", "Confirm", "Print", "Edit", "Recharge", "Generate Token", "Delete", "Close"].includes(name)) return false;
        if (name === "Add Task" && this.route.columns.includes("Actions")) return false;
        return true;
      });
    },
    showResetButton() {
      const routeHash = String(this.route.hash || "");
      if (routeHash.startsWith("#/management/")) return false;
      if (routeHash === "#/admin/role") return false;
      return this.route.actions.includes("Reset");
    },
    siteOptions() {
      return tableSiteOptions;
    },
    supportsSiteFilter() {
      return routeSupportsSiteFilter(this.route);
    },
    supportsMeterPhaseFilter() {
      return isCreditTokenRoute(this.route);
    },
    serverPaginated() {
      return routeUsesServerPagination(this.route);
    },
    rowActions() {
      return rowActionButtons(this.route);
    },
    pageCount() {
      return totalPages(this.displayedTotal, this.pageSize);
    },
    displayedTotal() {
      const hasClientFilters = Boolean(String(this.searchTerm || "").trim() || this.meterPhaseFilter !== "all");
      if (!hasClientFilters && Number(this.total) > this.filteredTotal) return this.total;
      return this.filteredTotal;
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
        this.sortField = "";
        this.searchTerm = "";
        this.meterPhaseFilter = "all";
        this.exportRange = "all";
        this.exportError = "";
        this.currentPage = 1;
        if (this.serverPaginated && this.pageSize > 20) this.pageSize = 20;
        this.checkedMeterIds = new Set();
        this.load();
      }
    }
  },
  methods: {
    exportDates() {
      const to = new Date();
      const from = new Date(to);
      if (this.exportRange === "all") from.setTime(0);
      else if (this.exportRange === "1d") from.setDate(from.getDate() - 1);
      else if (this.exportRange === "7d") from.setDate(from.getDate() - 7);
      else if (this.exportRange === "30d") from.setDate(from.getDate() - 30);
      else from.setFullYear(from.getFullYear() - 1);
      return { from: from.toISOString(), to: to.toISOString() };
    },
    async downloadExport() {
      this.exportLoading = true;
      this.exportError = "";
      try {
        const { from, to } = this.exportDates();
        const table = await fetchTableExportData(this.route, {
          from,
          to,
          siteId: this.supportsSiteFilter ? this.selectedSite : undefined,
          meterPhaseFilter: this.supportsMeterPhaseFilter ? this.meterPhaseFilter : undefined,
          searchTerm: this.searchTerm,
          orderBy: this.route.actions.includes("Sort")
            ? `${this.sortField || routeSortPolicy(this.route).key} ${this.sortDirection || routeSortDirection(this.route)}`
            : undefined
        });
        const rows = exportRowsForRoute(this.route, table.rows);
        const filename = `${String(this.route.title || "records").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}_${this.exportRange}.csv`;
        downloadTextFile(filename, exportCsvText(this.route, rows, columnKey), "text/csv;charset=utf-8");
        this.$refs.exportMenu?.close();
      } catch (error) {
        this.exportError = error?.message || "Export failed. Please retry.";
      } finally {
        this.exportLoading = false;
      }
    },
    async load() {
      const token = ++this.loadToken;
      this.errorMessage = "";
      this.loading = true;
      try {
        if (this.serverPaginated && this.pageSize > 20) this.pageSize = 20;
        const requestOptions = {
          siteId: this.supportsSiteFilter ? this.selectedSite : undefined,
          meterPhaseFilter: this.supportsMeterPhaseFilter ? this.meterPhaseFilter : undefined,
          searchTerm: this.serverPaginated ? this.searchTerm : undefined,
          orderBy: this.route.actions.includes("Sort")
            ? `${this.sortField || routeSortPolicy(this.route).key} ${this.sortDirection || routeSortDirection(this.route)}`
            : undefined
        };
        if (this.serverPaginated) {
          requestOptions.pageNumber = this.currentPage;
          requestOptions.pageSize = this.pageSize;
        }
        const table = await fetchTableData(this.route, requestOptions);
        if (token !== this.loadToken) return;
        this.allRows = table.rows;
        this.total = table.total;
        this.applyControls({ reloadServer: false });
      } catch (error) {
        if (token !== this.loadToken) return;
        this.allRows = [];
        this.total = 0;
        this.filteredRows = [];
        this.visibleRows = [];
        this.filteredTotal = 0;
        this.selectedRow = null;
        this.errorMessage = error?.message || "Unable to load data";
      } finally {
        if (token === this.loadToken) this.loading = false;
      }
    },
    applyControls(options = {}) {
      if (this.serverPaginated && options.reloadServer !== false) {
        this.currentPage = 1;
        this.gotoPageInput = "1";
        this.load();
        return;
      }
      if (this.serverPaginated) {
        this.filteredRows = this.allRows;
        this.filteredTotal = this.total;
        this.visibleRows = this.allRows;
        this.selectedRow = this.visibleRows[0] || null;
        this.gotoPageInput = String(this.currentPage);
        return;
      }
      const searchedRows = searchRows(this.route, this.allRows, this.searchTerm);
      const phaseRows = this.filterRowsByPhase(searchedRows);
      const sortedRows = sortRows(this.route, phaseRows, this.sortDirection, this.sortField);
      this.filteredRows = sortedRows;
      this.filteredTotal = sortedRows.length;
      this.currentPage = Math.min(this.currentPage, totalPages(this.displayedTotal, this.pageSize));
      this.visibleRows = paginateRows(sortedRows, this.currentPage, this.pageSize);
      this.selectedRow = this.visibleRows[0] || null;
    },
    filterRowsByPhase(rows) {
      if (this.meterPhaseFilter === "all") return rows;
      return rows.filter((row) => meterPhaseFromRow(row) === this.meterPhaseFilter);
    },
    applySiteFilter() {
      this.currentPage = 1;
      this.gotoPageInput = "1";
      this.load();
    },
    resetControls() {
      this.searchTerm = "";
      this.selectedSite = "";
      this.meterPhaseFilter = "all";
      this.sortDirection = routeSortDirection(this.route);
      this.sortField = "";
      this.pageSize = 10;
      this.currentPage = 1;
      this.checkedMeterIds = new Set();
      if (this.supportsSiteFilter || this.serverPaginated) {
        this.load();
        return;
      }
      this.applyControls();
    },
    setSortDirection(direction) {
      if (this.sortDirection === direction) return;
      this.sortDirection = direction;
      this.closeSortDirectionMenu();
      this.applyControls();
    },
    toggleSortDirectionMenu() {
      this.sortDirectionMenuOpen = !this.sortDirectionMenuOpen;
    },
    closeSortDirectionMenu() {
      this.sortDirectionMenuOpen = false;
    },
    goToPage(page) {
      this.currentPage = Math.max(1, Math.min(this.pageCount, page));
      this.gotoPageInput = String(this.currentPage);
      if (this.serverPaginated) {
        this.load();
        return;
      }
      this.visibleRows = paginateRows(this.filteredRows, this.currentPage, this.pageSize);
      this.selectedRow = this.visibleRows[0] || null;
    },
    applyGoto() {
      const target = Number(this.gotoPageInput);
      if (!Number.isFinite(target)) {
        this.gotoPageInput = String(this.currentPage);
        return;
      }
      this.goToPage(Math.trunc(target));
    },
    changePageSize() {
      this.currentPage = 1;
      this.gotoPageInput = "1";
      if (this.serverPaginated) {
        this.load();
        return;
      }
      this.applyControls();
    },
    cell(row, column, rowIndex) {
      return resolveRowValue(this.route, row, column);
    },
    primaryCell(row) {
      const candidates = ["customerName", "name", "meterId", "customerId", "id", "receiptId", "gatewayId", "userId"];
      for (const key of candidates) {
        const value = row?.[key];
        if (value) return String(value);
      }
      const firstColumn = this.mobileColumns[0];
      return firstColumn ? String(this.cell(row, firstColumn, 0) || "Record") : "Record";
    },
    secondaryCell(row) {
      const candidates = ["meterId", "stationId", "status", "currentDate", "createDate"];
      for (const key of candidates) {
        const value = row?.[key];
        if (value && String(value) !== this.primaryCell(row)) return String(value);
      }
      return "";
    },
    getColKey(column) {
      return columnKey(column);
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
    actionTestId(action) {
      return String(action || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
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
    isRowActionMenuOpen(rowIndex) {
      return this.openRowActionIndex === rowIndex;
    },
    shouldDropUp(rowIndex) {
      return rowIndex >= Math.max(0, this.visibleRows.length - 3);
    },
    toggleRowActionMenu(rowIndex) {
      this.openRowActionIndex = this.openRowActionIndex === rowIndex ? null : rowIndex;
    },
    closeRowActionMenu() {
      this.openRowActionIndex = null;
    },
    openRowActionFromMenu(action, row) {
      this.closeRowActionMenu();
      this.openAction(action, row);
    },
    openAction(action, row) {
      if (action === "Add Batch Task" && this.isBatchCheckable && !this.checkedMeterIds.size) {
        toastWarn("Select at least one meter first");
        return;
      }
      this.closeRowActionMenu();
      this.activeRow = {
        ...(row || {}),
        ...createFormSeed(this.route, action, row),
        meterPhaseMode: this.supportsMeterPhaseFilter ? this.meterPhaseFilter : "all",
        requireThreePhase: this.supportsMeterPhaseFilter && this.meterPhaseFilter === "three-phase"
      };
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
  table-layout: auto;
  width: max-content;
  min-width: max-content;
}

.table-scroll th:not(.action-column),
.table-scroll td:not(.action-column) {
  min-width: var(--table-data-column-min-width, 140px);
}

.table-scroll th[data-column-key="receiptId"],
.table-scroll td[data-column-key="receiptId"],
.table-scroll th[data-column-key="id"],
.table-scroll td[data-column-key="id"],
.table-scroll th[data-column-key="customerId"],
.table-scroll td[data-column-key="customerId"],
.table-scroll th[data-column-key="meterId"],
.table-scroll td[data-column-key="meterId"],
.table-scroll th[data-column-key="stationId"],
.table-scroll td[data-column-key="stationId"] {
  min-width: 132px;
}

.table-scroll th[data-column-key="customerName"],
.table-scroll td[data-column-key="customerName"],
.table-scroll th[data-column-key="token"],
.table-scroll td[data-column-key="token"],
.table-scroll th[data-column-key="remark"],
.table-scroll td[data-column-key="remark"] {
  min-width: 180px;
}

.table-page[aria-label="Role"] .table-scroll th[data-column-key="remark"],
.table-page[aria-label="Role"] .table-scroll td[data-column-key="remark"] {
  max-width: 280px;
  min-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.table-page[aria-label="Role"] .table-scroll th.action-column,
.table-page[aria-label="Role"] .table-scroll td.action-column {
  min-width: 110px;
  width: 110px;
}

.table-page[aria-label="Abnormal Alarm"] {
  display: contents;
}

.table-page {
  display: contents;
}

.table-scroll th[data-column-key="createDate"],
.table-scroll td[data-column-key="createDate"],
.table-scroll th[data-column-key="updateDate"],
.table-scroll td[data-column-key="updateDate"] {
  min-width: 160px;
}

.table-scroll th.action-column,
.table-scroll td.action-column {
  min-width: var(--table-action-column-width, 240px);
  width: var(--table-action-column-width, 240px);
}

.table-scroll th.check-column,
.table-scroll td.check-column {
  min-width: 42px !important;
  width: 42px !important;
  max-width: 42px;
  text-align: center;
  padding: 0 6px !important;
}

.table-scroll th.check-column {
  background: linear-gradient(180deg, var(--bg-card), var(--bg-page));
}

.goto-input {
  width: 64px;
  text-align: center;
}

.goto-input :deep(input),
.goto-input:deep(input) {
  width: 64px;
  text-align: center;
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
  color: var(--text-inverse);
  border-color: var(--primary);
  box-shadow: var(--shadow-glow-sm);
}

.data-value-trigger:hover svg {
  transform: scale(1.2) rotate(15deg);
}

.data-value-trigger:disabled {
  background: color-mix(in srgb, var(--bg-page) 78%, var(--bg-card));
  color: var(--text-muted);
  border-color: var(--border-color);
  cursor: not-allowed;
  box-shadow: none;
}

.table-page :deep(.base-input),
.table-page :deep(.base-select) {
  background: var(--bg-card);
  color: var(--text-main);
}

.table-page :deep(.base-input:focus),
.table-page :deep(.base-select:focus) {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
}


/* Custom Toolbar Grid Layout */
.ddm-toolbar {
  display: grid !important;
  grid-template-columns: 1fr auto auto;
  gap: 20px;
  align-items: center;
  flex-wrap: nowrap;
}
.ddm-toolbar-group {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ddm-search-group {
  width: 100%;
}
.ddm-search-group .search-input {
  width: 100%;
  max-width: 100%;
}
.ddm-sort-group .sort-select {
  min-width: 140px;
}
.sort-direction-menu {
  position: relative;
}
.sort-direction-menu__toggle {
  width: 38px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-main);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.sort-direction-menu__toggle svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.sort-direction-menu__panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 126px;
  display: grid;
  gap: 4px;
  border: 1px solid var(--border-mid);
  border-radius: 10px;
  background: var(--bg-card);
  box-shadow: var(--shadow-md);
  padding: 6px;
  z-index: 2000;
}
.sort-direction-menu__item {
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-main);
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  padding: 8px 10px;
  cursor: pointer;
}
.sort-direction-menu__item.active {
  background: var(--primary-light);
  color: var(--primary);
}

.mobile-table-cards {
  display: none !important;
}

.mobile-table-card {
  padding: 14px;
  border-top: 1px solid var(--color-border);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--primary-light) 44%, transparent), transparent 40%),
    var(--bg-card);
}

.mobile-table-card.selected {
  box-shadow: inset 3px 0 0 var(--primary);
}

.mobile-table-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.mobile-table-card__head strong {
  color: var(--text-strong);
  font-size: 14px;
  line-height: 1.3;
}

.mobile-table-card__head span {
  color: var(--text-muted);
  font-size: 11px;
  text-align: right;
}

.mobile-table-card__body {
  display: grid;
  gap: 10px;
}

.mobile-table-field {
  display: grid;
  gap: 4px;
}

.mobile-table-field__label {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.mobile-table-field__value {
  color: var(--text-main);
  font-size: 13px;
  word-break: break-word;
}

.mobile-table-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.mobile-table-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-main);
  font-size: 12px;
  font-weight: 700;
}

.mobile-card-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.action-cell-controls {
  display: inline-flex;
  justify-content: flex-end;
  width: 100%;
}

.row-action-menu {
  display: none;
}

.mobile-card-line {
  margin-bottom: 10px;
}

.mobile-table-empty {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 24px 16px;
  text-align: center;
  color: var(--text-muted);
}

.mobile-data-trigger {
  width: 100%;
  justify-content: center;
}

@media(max-width:900px){
  .ddm-toolbar { grid-template-columns: auto 1fr; gap: 10px; }
  .ddm-search-group {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
    flex-wrap: nowrap;
  }
  .ddm-search-group .sort-select,
  .ddm-search-group .search-input {
    width: 100%;
    max-width: 100%;
  }
  .ddm-sort-group {
    grid-column: 1;
    flex-wrap: nowrap;
    justify-content: flex-start;
  }
  .ddm-actions-group {
    grid-column: 2;
    justify-content: flex-end;
    width: auto;
    flex-wrap: nowrap;
  }
}

@media (max-width: 560px) {
  .ddm-search-group {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
  }
  .ddm-sort-group { grid-column: 1; }
  .ddm-actions-group { grid-column: 2; }
}

@media (max-width: 768px) {
  .table-scroll th.check-column,
  .table-scroll td.check-column {
    min-width: 38px !important;
    width: 38px !important;
    max-width: 38px;
    padding: 0 4px !important;
  }

  .table-scroll th.action-column,
  .table-scroll td.action-column {
    min-width: 84px;
    width: 84px;
    overflow: visible !important;
  }

  .action-btn-group--desktop {
    display: none !important;
  }

  .row-action-menu {
    display: inline-flex !important;
    position: relative;
    pointer-events: auto;
  }

  .row-action-menu__toggle {
    width: 38px;
    height: 34px;
    border: 1px solid var(--border-mid);
    border-radius: 10px;
    background: var(--bg-card);
    color: var(--text-main);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    pointer-events: auto;
    touch-action: manipulation;
  }

  .row-action-menu__toggle svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }

  .row-action-menu__panel {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 40;
    min-width: 116px;
    padding: 6px;
    border: 1px solid var(--border-mid);
    border-radius: 10px;
    background: var(--bg-card);
    box-shadow: var(--shadow-md);
    display: grid;
    gap: 4px;
  }

  .row-action-menu__panel--drop-up {
    top: auto;
    bottom: calc(100% + 6px);
  }

  .table-scroll td.action-column.action-column--menu-open {
    z-index: 60;
    overflow: visible !important;
  }

  .row-action-menu__item {
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text-main);
    font-size: 12px;
    font-weight: 700;
    text-align: left;
    padding: 8px 10px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .row-action-menu__item[data-action="delete"],
  .row-action-menu__item[data-action="cancel"] {
    color: var(--danger);
  }

  .row-action-menu__item:hover {
    background: var(--primary-light);
    color: var(--primary);
  }

  .table-scroll {
    display: block;
  }

  .pagination {
    justify-content: center;
  }
}
</style>
