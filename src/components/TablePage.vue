<template>
  <section class="table-page" :aria-label="route.title">
    <div class="filter-toolbar">
      <select v-model="sortDirection" class="sort-select" aria-label="Sort direction">
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </select>
      <button class="btn" type="button" @click="applyControls">Sort</button>
      <input v-model="searchTerm" class="search-input" type="search" placeholder="Search Term" aria-label="Search Term" @keyup.enter="applyControls">
      <button class="btn primary" type="button" @click="applyControls">Search</button>
      <button class="btn primary" type="button" @click="resetControls">Reset</button>
      <button v-for="action in toolbarActions" :key="action" :class="buttonClass(action)" type="button" @click="openAction(action, selectedRow || visibleRows[0] || {})">{{ action }}</button>
    </div>
    <p v-if="route.note" class="quota-line">{{ route.note }}</p>
    <div class="table-scroll">
      <table>
        <thead><tr><th v-for="column in route.columns" :key="column">{{ column }}</th></tr></thead>
        <tbody>
          <tr v-if="!visibleRows.length"><td class="empty-cell" :colspan="route.columns.length">No Data</td></tr>
          <tr v-for="(row, rowIndex) in visibleRows" :key="rowIndex" :class="{ selected: row === selectedRow }" @click="selectedRow = row">
            <td v-for="column in route.columns" :key="column">
              <span v-if="column !== 'Actions'">{{ cell(row, column, rowIndex) }}</span>
              <span v-else>
                <button v-for="action in rowActions" :key="action" class="link-btn" type="button" @click.stop="openAction(action, row)">{{ action }}</button>
              </span>
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
  </section>
</template>

<script>
import ActionModal from "./ActionModal.vue";
import { columnKey, createFormSeed, fetchTableData, pageNumbers, pageSizeOptions, paginateRows, rowActionButtons, searchRows, sortRows, totalPages } from "../services/table-service";

export default {
  name: "TablePage",
  components: { ActionModal },
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
      sortDirection: "asc",
      modalAction: "",
      selectedRow: null,
      activeRow: {}
    };
  },
  computed: {
    toolbarActions() {
      return this.route.actions.filter((name) => !["Cancel", "Confirm", "Print", "Edit", "Recharge", "Generate Token", "Delete", "Close"].includes(name));
    },
    rowActions() {
      return rowActionButtons(this.route);
    },
    pageCount() {
      return totalPages(this.filteredTotal, this.pageSize);
    },
    pages() {
      return pageNumbers(this.currentPage, this.pageCount);
    }
  },
  watch: {
    route: {
      immediate: true,
      handler() {
        this.load();
      }
    }
  },
  methods: {
    async load() {
      const table = await fetchTableData(this.route);
      this.allRows = table.rows;
      this.total = table.total;
      this.applyControls();
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
      this.sortDirection = "asc";
      this.pageSize = 10;
      this.currentPage = 1;
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
      if (this.route.group === "Remote Operation" && column === "Status") return rowIndex % 2 === 0 ? "Online" : "Offline";
      return row[columnKey(column)] || "";
    },
    buttonClass(action) {
      return ["btn", ["Add", "Import", "Export"].includes(action) ? "primary" : action === "Delete" ? "danger" : ""];
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
