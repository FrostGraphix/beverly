<template>
  <section class="consumption-page">
    <div class="consumption-filter-shell">
      <div class="consumption-filter-grid">
        <label class="consumption-field">
          <span>Customer Id</span>
          <div class="consumption-picker">
            <input v-model="filters.customerId" readonly class="consumption-input input-readonly">
            <button type="button" class="consumption-picker-btn" @click="activePicker = 'customer'">...</button>
          </div>
        </label>

        <label class="consumption-field">
          <span>Meter Id</span>
          <div class="consumption-picker">
            <input v-model="filters.meterId" readonly class="consumption-input input-readonly">
            <button type="button" class="consumption-picker-btn" @click="activePicker = 'meter'">...</button>
          </div>
        </label>

        <label class="consumption-field consumption-field-range">
          <span>Date Range</span>
          <div class="consumption-range">
            <input v-model="filters.dateFrom" type="date" class="consumption-input">
            <span class="consumption-range-separator">To</span>
            <input v-model="filters.dateTo" type="date" class="consumption-input">
          </div>
        </label>

        <div class="consumption-granularity">
          <button type="button" :class="granularityClass('daily')" @click="setGranularity('daily')">Daily</button>
          <button type="button" :class="granularityClass('monthly')" @click="setGranularity('monthly')">Monthly</button>
        </div>
      </div>

      <div class="consumption-toolbar">
        <button type="button" class="consumption-toolbar-icon" @click="toggleSortDirection" :title="sortDirection === 'asc' ? 'Ascending' : 'Descending'">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l-4-4-1.4 1.4L9 23l6.4-6.6L14 15l-4 4V5zm8 14V5l4 4 1.4-1.4L15 1 8.6 7.6 10 9l4-4v14z"/></svg>
        </button>
        <button type="button" class="btn primary consumption-btn" @click="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12a6 6 0 0 1 0-12z"/></svg>
          Search
        </button>
        <button type="button" class="btn primary consumption-btn" @click="reset">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>
          Reset
        </button>
        <button type="button" class="btn primary consumption-btn" @click="exportCsv">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 20h14v-2H5v2zm7-18l-5.5 5.5 1.42 1.42L11 5.84V16h2V5.84l3.08 3.08 1.42-1.42L12 2z"/></svg>
          Export
        </button>
      </div>
    </div>

    <div class="consumption-tabs">
      <button type="button" :class="tabClass('data')" @click="activeTab = 'data'">Data</button>
      <button type="button" :class="tabClass('chart')" @click="activeTab = 'chart'">Chart</button>
    </div>

    <div v-if="errorMessage" class="table-error" role="alert">
      <span>{{ errorMessage }}</span>
      <button class="btn primary" type="button" @click="search">Refresh</button>
    </div>

    <div v-if="activeTab === 'data'" class="consumption-table-card">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th class="selection-col"><input type="checkbox" disabled></th>
              <th>Collection Date</th>
              <th>Consumption</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="3" class="empty-cell">Loading...</td>
            </tr>
            <tr v-else-if="!visibleRows.length">
              <td colspan="3" class="empty-cell">No Data</td>
            </tr>
            <tr v-for="row in visibleRows" :key="row.id">
              <td class="selection-col"><input type="checkbox" disabled></td>
              <td>{{ row.collectionDate }}</td>
              <td>{{ formatConsumption(row.consumption) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span>Total {{ filteredRows.length }}</span>
        <select v-model.number="pageSize" class="sort-select" aria-label="Page size" @change="changePageSize">
          <option :value="10">10/page</option>
          <option :value="20">20/page</option>
          <option :value="50">50/page</option>
        </select>
        <button class="page-chip" type="button" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">&lt;</button>
        <button v-for="page in pages" :key="page" :class="['page-chip', page === currentPage ? 'active' : '']" type="button" @click="goToPage(page)">{{ page }}</button>
        <button class="page-chip" type="button" :disabled="currentPage === pageCount" @click="goToPage(currentPage + 1)">&gt;</button>
        <span>Go to</span>
        <input v-model="gotoPage" class="consumption-goto" type="number" min="1" :max="pageCount" @keyup.enter="applyGoto">
      </div>
    </div>

    <div v-else class="consumption-chart-card">
      <EChartPanel :option="chartOption" />
    </div>

    <PickerModal
      v-if="activePicker === 'customer'"
      api="/api/customer/read"
      :columns="['customerId', 'customerName', 'stationId']"
      :column-labels="['Id', 'Name', 'Station Id']"
      label="Customer"
      @close="activePicker = ''"
      @select="selectCustomer"
    />

    <PickerModal
      v-if="activePicker === 'meter'"
      api="/api/meter/read"
      :columns="['meterId', 'meterType', 'stationId']"
      :column-labels="['Id', 'Type', 'Station Id']"
      label="Meter"
      @close="activePicker = ''"
      @select="selectMeter"
    />
  </section>
</template>

<script>
import EChartPanel from "./EChartPanel.vue";
import PickerModal from "./PickerModal.vue";
import { pageNumbers, totalPages } from "../services/table-service";
import {
  aggregateConsumptionRows,
  buildConsumptionChartOption,
  defaultConsumptionStatisticsFilters,
  fetchConsumptionStatistics
} from "../services/consumption-statistics-service.mjs";

export default {
  name: "ConsumptionStatisticsPage",
  components: { EChartPanel, PickerModal },
  data() {
    return {
      filters: defaultConsumptionStatisticsFilters(),
      activePicker: "",
      activeTab: "data",
      loading: false,
      errorMessage: "",
      sortDirection: "desc",
      rawRows: [],
      filteredRows: [],
      currentPage: 1,
      pageSize: 20,
      gotoPage: "1"
    };
  },
  computed: {
    aggregatedRows() {
      return aggregateConsumptionRows(this.rawRows, this.filters.granularity);
    },
    sortedRows() {
      const direction = this.sortDirection === "asc" ? 1 : -1;
      return this.aggregatedRows.slice().sort((left, right) => {
        return left.collectionDate.localeCompare(right.collectionDate) * direction;
      });
    },
    pageCount() {
      return totalPages(this.filteredRows.length, this.pageSize);
    },
    pages() {
      return pageNumbers(this.currentPage, this.pageCount);
    },
    visibleRows() {
      const start = (this.currentPage - 1) * this.pageSize;
      return this.filteredRows.slice(start, start + this.pageSize);
    },
    chartOption() {
      return buildConsumptionChartOption(this.sortedRows, this.filters.granularity);
    }
  },
  mounted() {
    this.search();
  },
  methods: {
    async search() {
      this.loading = true;
      this.errorMessage = "";
      try {
        const response = await fetchConsumptionStatistics(this.filters, {
          pageNumber: 1,
          pageSize: 5000
        });
        this.rawRows = response.rows.filter((row) => {
          if (this.filters.customerId && String(row.customerId) !== String(this.filters.customerId)) return false;
          if (this.filters.meterId && String(row.meterId) !== String(this.filters.meterId)) return false;
          return true;
        });
        this.filteredRows = this.sortedRows;
        this.currentPage = 1;
        this.gotoPage = "1";
      } catch (error) {
        this.rawRows = [];
        this.filteredRows = [];
        this.errorMessage = error?.message || "Unable to load data";
      } finally {
        this.loading = false;
      }
    },
    reset() {
      this.filters = defaultConsumptionStatisticsFilters();
      this.activeTab = "data";
      this.sortDirection = "desc";
      this.currentPage = 1;
      this.gotoPage = "1";
      this.search();
    },
    selectCustomer(row) {
      this.filters.customerId = String(row.customerId || row.id || "");
      if (!this.filters.meterId) this.filters.meterId = String(row.customerId || row.id || "");
      this.activePicker = "";
    },
    selectMeter(row) {
      this.filters.meterId = String(row.meterId || row.id || "");
      this.activePicker = "";
    },
    setGranularity(granularity) {
      this.filters.granularity = granularity;
      this.filteredRows = this.sortedRows;
      this.currentPage = 1;
      this.gotoPage = "1";
    },
    toggleSortDirection() {
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
      this.filteredRows = this.sortedRows;
    },
    formatConsumption(value) {
      return Number(value || 0).toLocaleString(undefined, {
        maximumFractionDigits: 3
      });
    },
    tabClass(tab) {
      return ["consumption-tab", this.activeTab === tab ? "active" : ""];
    },
    granularityClass(granularity) {
      return ["consumption-granularity-btn", this.filters.granularity === granularity ? "active" : ""];
    },
    changePageSize() {
      this.currentPage = 1;
      this.gotoPage = "1";
    },
    goToPage(page) {
      this.currentPage = Math.max(1, Math.min(this.pageCount, page));
      this.gotoPage = String(this.currentPage);
    },
    applyGoto() {
      this.goToPage(Number(this.gotoPage || 1));
    },
    exportCsv() {
      const header = ["Collection Date", "Consumption"];
      const lines = this.filteredRows.map((row) => `${row.collectionDate},${row.consumption}`);
      const content = [header.join(","), ...lines].join("\n");
      const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `consumption-statistics-${this.filters.granularity}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
  },
  watch: {
    sortedRows: {
      immediate: true,
      handler(rows) {
        this.filteredRows = rows;
      }
    }
  }
};
</script>

<style scoped>
.consumption-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.consumption-filter-shell {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.consumption-filter-grid {
  display: grid;
  grid-template-columns: 1.2fr 1.2fr 1.6fr 220px;
  border-bottom: 1px solid var(--border-color);
}

.consumption-field,
.consumption-granularity {
  padding: 14px;
  border-right: 1px solid var(--border-color);
}

.consumption-field:last-child,
.consumption-granularity:last-child {
  border-right: none;
}

.consumption-field span {
  display: block;
  margin-bottom: 12px;
  color: #7b8794;
  font-size: 12px;
  font-weight: 600;
}

.consumption-picker,
.consumption-range {
  display: flex;
  align-items: center;
  gap: 10px;
}

.consumption-input {
  width: 100%;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 14px;
  background: #fff;
}

.consumption-picker-btn {
  width: 54px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: #fff;
  color: #7b8794;
  cursor: pointer;
}

.consumption-range-separator {
  margin: 0 2px;
  color: #111827;
  font-size: 14px;
}

.consumption-granularity {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 0;
}

.consumption-granularity-btn {
  min-width: 78px;
  height: 34px;
  border: 1px solid var(--border-color);
  background: #fff;
  color: #4b5563;
  cursor: pointer;
}

.consumption-granularity-btn:first-child {
  border-radius: 4px 0 0 4px;
}

.consumption-granularity-btn:last-child {
  border-radius: 0 4px 4px 0;
}

.consumption-granularity-btn.active {
  background: #1890ff;
  border-color: #1890ff;
  color: #fff;
}

.consumption-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
}

.consumption-toolbar-icon {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: #1276d1;
  color: #fff;
  cursor: pointer;
  margin-left: 6px;
}

.consumption-toolbar-icon svg,
.consumption-btn svg {
  width: 16px;
  height: 16px;
}

.consumption-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.consumption-tabs {
  display: flex;
  gap: 36px;
  border-bottom: 1px solid var(--border-color);
}

.consumption-tab {
  position: relative;
  padding: 0 0 12px;
  border: none;
  background: transparent;
  color: #374151;
  font-size: 16px;
  cursor: pointer;
}

.consumption-tab.active {
  color: #1677ff;
}

.consumption-tab.active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 3px;
  background: #1677ff;
}

.consumption-table-card,
.consumption-chart-card {
  background: #fff;
}

.consumption-chart-card {
  min-height: 460px;
}

.consumption-goto {
  width: 56px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  text-align: center;
}

.selection-col {
  width: 32px;
}

@media (max-width: 1100px) {
  .consumption-filter-grid {
    grid-template-columns: 1fr 1fr;
  }

  .consumption-granularity {
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .consumption-filter-grid {
    grid-template-columns: 1fr;
  }

  .consumption-field,
  .consumption-granularity {
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }

  .consumption-toolbar {
    flex-wrap: wrap;
  }
}
</style>
