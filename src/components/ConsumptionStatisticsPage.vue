<template>
  <section class="consumption-page">
    <div class="consumption-filter-shell">
      <div class="consumption-filter-grid">
        <label class="consumption-field">
          <span>Customer Id</span>
          <div class="consumption-picker">
            <BaseInput v-model="filters.customerId" class="consumption-input" placeholder="All customers" />
            <BaseButton class="consumption-picker-btn" size="sm" @click="activePicker = 'customer'">...</BaseButton>
          </div>
        </label>

        <label class="consumption-field">
          <span>Meter Id</span>
          <div class="consumption-picker">
            <BaseInput v-model="filters.meterId" class="consumption-input" placeholder="All meters" />
            <BaseButton class="consumption-picker-btn" size="sm" @click="activePicker = 'meter'">...</BaseButton>
          </div>
        </label>

        <label class="consumption-field consumption-field-range">
          <span>Date Range</span>
          <div class="consumption-range">
            <BaseInput v-model="filters.dateFrom" type="date" class="consumption-input" />
            <span class="consumption-range-separator">To</span>
            <BaseInput v-model="filters.dateTo" type="date" class="consumption-input" />
          </div>
        </label>

        <div class="consumption-granularity">
          <BaseButton :class="granularityClass('daily')" @click="setGranularity('daily')">Daily</BaseButton>
          <BaseButton :class="granularityClass('monthly')" @click="setGranularity('monthly')">Monthly</BaseButton>
        </div>
      </div>

      <div class="consumption-toolbar">
        <div class="consumption-sort-wrap">
        <BaseIconButton class="consumption-toolbar-icon" @click="sortPanelOpen = !sortPanelOpen" :title="sortDirection === 'asc' ? 'Ascending' : 'Descending'" aria-label="Toggle sort direction">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l-4-4-1.4 1.4L9 23l6.4-6.6L14 15l-4 4V5zm8 14V5l4 4 1.4-1.4L15 1 8.6 7.6 10 9l4-4v14z"/></svg>
        </BaseIconButton>
        <div v-if="sortPanelOpen" class="consumption-sort-panel" role="menu" aria-label="Sort consumption statistics">
          <BaseSelect v-model="sortField" class="consumption-input" aria-label="Sort field">
            <option value="collectionDate">Collection Date</option>
            <option value="consumption">Consumption</option>
          </BaseSelect>
          <BaseButton size="sm" :variant="sortDirection === 'asc' ? 'primary' : 'quiet'" @click="sortDirection = 'asc'">Ascending</BaseButton>
          <BaseButton size="sm" :variant="sortDirection === 'desc' ? 'primary' : 'quiet'" @click="sortDirection = 'desc'">Descending</BaseButton>
          <BaseButton size="sm" @click="sortPanelOpen = false">Sort</BaseButton>
        </div>
        </div>
        <BaseButton class="consumption-btn" variant="primary" :disabled="loading" @click="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12a6 6 0 0 1 0-12z"/></svg>
          {{ loading ? "Loading" : "Search" }}
        </BaseButton>
        <BaseButton class="consumption-btn" variant="primary" @click="reset">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>
          Reset
        </BaseButton>
        <BaseButton class="consumption-btn" variant="primary" :disabled="!decoratedRows.length" @click="exportCsv">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 20h14v-2H5v2zm7-18l-5.5 5.5 1.42 1.42L11 5.84V16h2V5.84l3.08 3.08 1.42-1.42L12 2z"/></svg>
          Export
        </BaseButton>
      </div>
    </div>

    <div v-if="responseMeta.warning" class="consumption-warning" role="status">
      {{ responseMeta.warning }}
    </div>

    <div class="consumption-tabs">
      <BaseButton :class="tabClass('data')" @click="activeTab = 'data'">Data</BaseButton>
      <BaseButton :class="tabClass('chart')" @click="activeTab = 'chart'">Chart</BaseButton>
    </div>

    <div v-if="errorMessage" class="table-error" role="alert">
      <span>{{ errorMessage }}</span>
      <BaseButton variant="primary" @click="search">Refresh</BaseButton>
    </div>

    <div v-if="activeTab === 'data'" class="consumption-table-card">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th class="selection-col"><BaseCheckbox disabled aria-label="Select all rows" /></th>
              <th>Collection Date</th>
              <th>Consumption</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="3" class="empty-cell">Loading...</td>
            </tr>
            <tr v-else-if="!decoratedRows.length">
              <td colspan="3" class="empty-cell">No Data</td>
            </tr>
            <tr v-for="row in visibleRows" :key="row.id">
              <td class="selection-col"><BaseCheckbox disabled aria-label="Select row" /></td>
              <td>{{ row.collectionDate }}</td>
              <td>{{ formatConsumption(row.consumption) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span>Total {{ decoratedRows.length }}</span>
        <BaseSelect v-model="pageSize" class="sort-select" aria-label="Page size" @change="changePageSize">
          <option :value="10">10/page</option>
          <option :value="20">20/page</option>
          <option :value="50">50/page</option>
        </BaseSelect>
        <BaseButton class="page-chip" size="sm" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">&lt;</BaseButton>
        <BaseButton v-for="page in pages" :key="page" :class="['page-chip', page === currentPage ? 'active' : '']" size="sm" @click="goToPage(page)">{{ page }}</BaseButton>
        <BaseButton class="page-chip" size="sm" :disabled="currentPage === pageCount" @click="goToPage(currentPage + 1)">&gt;</BaseButton>
        <span>Go to</span>
        <BaseInput v-model="gotoPage" class="consumption-goto" type="number" min="1" :max="pageCount" @keyup.enter="applyGoto" />
      </div>
    </div>

    <div v-else-if="activeTab === 'chart'" class="consumption-chart-card">
      <EChartPanel :option="chartOption" />
    </div>

    <PickerModal
      v-if="activePicker === 'customer'"
      api="/api/customer/read"
      :columns="['customerId', 'customerName', 'stationId']"
      :column-labels="['Id', 'Name', 'Station Id']"
      label="Customer"
      :auto-confirm="true"
      @close="activePicker = ''"
      @select="selectCustomer"
    />

    <PickerModal
      v-if="activePicker === 'meter'"
      api="/api/meter/read"
      :columns="['meterId', 'meterType', 'stationId']"
      :column-labels="['Id', 'Type', 'Station Id']"
      label="Meter"
      :auto-confirm="true"
      @close="activePicker = ''"
      @select="selectMeter"
    />
  </section>
</template>

<script>
import EChartPanel from "./EChartPanel.vue";
import PickerModal from "./PickerModal.vue";
import BaseButton from "./base/BaseButton.vue";
import BaseCheckbox from "./base/BaseCheckbox.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseSelect from "./base/BaseSelect.vue";
import { postApi } from "../services/api.js";
import { downloadTextFile, exportReportCsvText, exportReportExcelXml, exportReportPdfText } from "../services/import-export.mjs";
import { pageNumbers, totalPages } from "../services/table-service";
import {
  aggregateConsumptionRows,
  buildConsumptionChartOption,
  decorateConsumptionRows,
  defaultConsumptionStatisticsFilters,
  fetchConsumptionStatistics,
  normalizeConsumptionDateKey,
  summarizeConsumptionRows
} from "../services/consumption-statistics-service.mjs";

export default {
  name: "ConsumptionStatisticsPage",
  components: { BaseButton, BaseCheckbox, BaseIconButton, BaseInput, BaseSelect, EChartPanel, PickerModal },
  data() {
    return {
      filters: defaultConsumptionStatisticsFilters(),
      activePicker: "",
      activeTab: "data",
      loading: false,
      errorMessage: "",
      responseMeta: { source: "", endpoint: "", warning: "" },
      sortDirection: "desc",
      sortField: "collectionDate",
      sortPanelOpen: false,
      rawRows: [],
      searchRunId: 0,
      currentPage: 1,
      pageSize: 20,
      gotoPage: "1",
      chartTheme: null,
      themeObserver: null
    };
  },
  computed: {
    aggregatedRows() {
      return aggregateConsumptionRows(this.rawRows, this.filters.granularity, this.filters);
    },
    sortedRows() {
      const direction = this.sortDirection === "asc" ? 1 : -1;
      return this.aggregatedRows.slice().sort((left, right) => {
        if (this.sortField === "consumption") return (Number(left.consumption || 0) - Number(right.consumption || 0)) * direction;
        return left.collectionDate.localeCompare(right.collectionDate) * direction;
      });
    },
    decoratedRows() {
      return decorateConsumptionRows(this.sortedRows);
    },
    summary() {
      return summarizeConsumptionRows(this.sortedRows, this.filters);
    },
    pageCount() {
      return totalPages(this.decoratedRows.length, this.pageSize);
    },
    pages() {
      return pageNumbers(this.currentPage, this.pageCount);
    },
    visibleRows() {
      const start = (this.currentPage - 1) * this.pageSize;
      return this.decoratedRows.slice(start, start + this.pageSize);
    },
    chartOption() {
      return buildConsumptionChartOption(this.sortedRows, this.filters.granularity, this.chartTheme);
    }
  },
  mounted() {
    this.syncThemePalette();
    this.observeThemeChanges();
  },
  beforeUnmount() {
    if (this.themeObserver) this.themeObserver.disconnect();
  },
  methods: {
    async search() {
      const requestId = this.searchRunId + 1;
      this.searchRunId = requestId;
      this.loading = true;
      this.errorMessage = "";
      this.responseMeta = { source: "", endpoint: "", warning: "" };
      if (!this.filters.customerId || !this.filters.meterId) {
        this.rawRows = [];
        this.errorMessage = "Pick a Customer Id first. The Meter Id will follow the selected customer.";
        this.loading = false;
        return;
      }
      try {
        const response = await fetchConsumptionStatistics(this.filters, {
          pageNumber: 1,
          pageSize: 5000
        });
        if (requestId !== this.searchRunId) return;
        this.responseMeta = {
          source: response.source || "",
          endpoint: response.endpoint || "",
          warning: response.warning || ""
        };
        this.rawRows = response.rows.filter((row) => {
          if (this.filters.customerId && String(row.customerId) && String(row.customerId) !== String(this.filters.customerId)) return false;
          if (this.filters.meterId && String(row.meterId) && String(row.meterId) !== String(this.filters.meterId)) return false;
          if (this.filters.stationId && String(row.stationId) && String(row.stationId) !== String(this.filters.stationId)) return false;
          if (!this.rowWithinDateRange(row)) return false;
          return true;
        });
        this.currentPage = 1;
        this.gotoPage = "1";
      } catch (error) {
        if (requestId !== this.searchRunId) return;
        this.rawRows = [];
        this.errorMessage = error?.message || "Unable to load consumption data";
      } finally {
        if (requestId === this.searchRunId) this.loading = false;
      }
    },
    reset() {
      this.filters = defaultConsumptionStatisticsFilters();
      this.activeTab = "data";
      this.sortDirection = "desc";
      this.sortField = "collectionDate";
      this.sortPanelOpen = false;
      this.rawRows = [];
      this.errorMessage = "";
      this.responseMeta = { source: "", endpoint: "", warning: "" };
      this.currentPage = 1;
      this.gotoPage = "1";
    },
    async selectCustomer(row) {
      const customerId = String(row.customerId || row.id || "");
      this.filters.customerId = customerId;
      if (row.stationId) this.filters.stationId = String(row.stationId);
      if (row.meterId) {
        this.filters.meterId = String(row.meterId);
      } else {
        const linked = await this.findLinkedAccount({ customerId });
        if (linked?.meterId) this.filters.meterId = String(linked.meterId);
        if (linked?.stationId) this.filters.stationId = String(linked.stationId);
      }
      this.activePicker = "";
    },
    async selectMeter(row) {
      const meterId = String(row.meterId || row.id || "");
      this.filters.meterId = meterId;
      if (row.stationId) this.filters.stationId = String(row.stationId);
      if (row.customerId) {
        this.filters.customerId = String(row.customerId);
      } else {
        const linked = await this.findLinkedAccount({ meterId });
        if (linked?.customerId) this.filters.customerId = String(linked.customerId);
        if (linked?.stationId) this.filters.stationId = String(linked.stationId);
      }
      this.activePicker = "";
    },
    async findLinkedAccount(criteria = {}) {
      const customerId = String(criteria.customerId || "").trim();
      const meterId = String(criteria.meterId || "").trim();
      if (!customerId && !meterId) return null;
      try {
        const payload = {
          lang: "en",
          pageNumber: 1,
          pageSize: 100,
          searchTerm: customerId || meterId,
          ...(customerId ? { customerId } : {}),
          ...(meterId ? { meterId } : {})
        };
        const response = await postApi("/api/account/read", payload);
        const result = response?.result || response?.data?.result || response?.data || response || {};
        const rows = Array.isArray(result.data)
          ? result.data
          : Array.isArray(result.rows)
            ? result.rows
            : Array.isArray(result.list)
              ? result.list
              : Array.isArray(result)
                ? result
                : [];
        return rows.find((account) => {
          const accountCustomerId = String(account.customerId || "");
          const accountMeterId = String(account.meterId || "");
          if (customerId && accountCustomerId === customerId) return true;
          if (meterId && accountMeterId === meterId) return true;
          return false;
        }) || null;
      } catch (error) {
        console.error("ConsumptionStatisticsPage: linked account lookup failed", error);
        return null;
      }
    },
    rowWithinDateRange(row) {
      const date = normalizeConsumptionDateKey(row.collectionDate, "daily");
      const from = normalizeConsumptionDateKey(this.filters.dateFrom, "daily");
      const to = normalizeConsumptionDateKey(this.filters.dateTo, "daily");
      if (!date) return true;
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    },
    setGranularity(granularity) {
      if (this.filters.granularity === granularity) return;
      this.filters.granularity = granularity;
      this.currentPage = 1;
      this.gotoPage = "1";
      this.search();
    },
    formatConsumption(value) {
      return Number(value || 0).toLocaleString(undefined, {
        maximumFractionDigits: 3
      });
    },
    formatChange(value) {
      if (value === null || value === undefined) return "-";
      const prefix = value > 0 ? "+" : "";
      return `${prefix}${this.formatConsumption(value)}`;
    },
    statusClass(status) {
      return ["consumption-status", status === "Recorded" ? "recorded" : "zero"];
    },
    changeClass(value) {
      return ["consumption-change", value > 0 ? "up" : value < 0 ? "down" : ""];
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
    syncThemePalette() {
      if (typeof window === "undefined" || typeof document === "undefined" || !document.documentElement) return;
      const styles = window.getComputedStyle(document.documentElement);
      const resolve = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
      this.chartTheme = {
        primary: resolve("--primary", "#059669"),
        primaryLight: resolve("--primary-light", "rgba(5, 150, 105, 0.12)"),
        textStrong: resolve("--text-strong", "#0f172a"),
        textMuted: resolve("--text-muted", "#64748b"),
        border: resolve("--border-color", "#d1fae5"),
        grid: resolve("--border-color", "#d1fae5")
      };
    },
    observeThemeChanges() {
      if (typeof MutationObserver === "undefined" || typeof document === "undefined" || !document.documentElement) return;
      this.themeObserver = new MutationObserver(() => this.syncThemePalette());
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"]
      });
    },
    exportCsv() {
      const meta = [
        ["Station Id", this.filters.stationId || "All"],
        ["Customer Id", this.filters.customerId || "All"],
        ["Meter Id", this.filters.meterId || "All"],
        ["Date From", this.filters.dateFrom],
        ["Date To", this.filters.dateTo],
        ["Granularity", this.filters.granularity],
        ["Source", this.responseMeta.source || "live"],
        ["Total Consumption", this.summary.total],
        ["Average Consumption", this.summary.average],
        ["Peak Period", this.summary.peakDate || ""],
        ["Missing Days", this.summary.missingDays],
        []
      ];
      const columns = [
        { label: "Collection Date", key: "collectionDate" },
        { label: "Consumption", key: "consumption" }
      ];
      const content = exportReportCsvText("Consumption Statistics", columns, this.decoratedRows, meta);
      const excel = exportReportExcelXml("Consumption Statistics", columns, this.decoratedRows, meta);
      const pdf = exportReportPdfText("Consumption Statistics", columns, this.decoratedRows, meta);
      const baseName = `Beverly_consumption_statistics_${this.filters.granularity}`;
      downloadTextFile(`${baseName}.csv`, content, "text/csv;charset=utf-8");
      downloadTextFile(`${baseName}.xls`, excel, "application/vnd.ms-excel");
      downloadTextFile(`${baseName}.pdf`, pdf, "application/pdf");
    }
  }
};
</script>

<style scoped>
.consumption-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.consumption-filter-shell,
.consumption-table-card,
.consumption-chart-card,
.consumption-summary-card,
.consumption-insight {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.consumption-table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(90deg, var(--primary-light), var(--bg-card));
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: capitalize;
}

.consumption-table-head strong {
  display: block;
  color: var(--text-strong);
  font-size: 13px;
}

.consumption-table-head div span {
  display: block;
  margin-top: 2px;
  color: var(--text-muted);
  text-transform: none;
}

.consumption-table-card .table-scroll {
  border-right: 0;
  border-left: 0;
}

.consumption-table-card table {
  font-variant-numeric: tabular-nums;
}

.consumption-table-card tbody tr:hover {
  box-shadow: inset 3px 0 0 var(--primary);
}

.consumption-table-card tbody td:nth-child(3),
.consumption-table-card tbody td:nth-child(4) {
  font-weight: 700;
  color: var(--text-strong);
}

.consumption-filter-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1.55fr 180px;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(180deg, var(--bg-card), var(--bg-page));
}

.consumption-field,
.consumption-granularity {
  padding: 12px;
  border-right: 1px solid var(--border-color);
}

.consumption-field:last-child,
.consumption-granularity:last-child {
  border-right: none;
}

.consumption-field span {
  display: block;
  margin-bottom: 10px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.consumption-picker,
.consumption-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.consumption-input {
  width: 100%;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 14px;
  background: var(--bg-card);
  color: var(--text-strong);
  outline: 0;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
}

.consumption-input:focus,
.consumption-goto:focus,
.sort-select:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
}

.consumption-picker-btn {
  width: 46px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast), background var(--transition-fast), box-shadow var(--transition-fast);
}

.consumption-picker-btn:hover {
  border-color: var(--primary);
  background: var(--primary-light);
  color: var(--primary);
}

.consumption-range-separator {
  color: var(--text-strong);
  font-size: 14px;
}

.consumption-granularity {
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.consumption-granularity-btn {
  min-width: 76px;
  height: 34px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-main);
  cursor: pointer;
  font-weight: 700;
  transition: border-color var(--transition-fast), color var(--transition-fast), background var(--transition-fast), box-shadow var(--transition-fast);
}

.consumption-granularity-btn:first-child {
  border-radius: 4px 0 0 4px;
}

.consumption-granularity-btn:last-child {
  border-radius: 0 4px 4px 0;
}

.consumption-granularity-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--text-inverse);
  box-shadow: var(--shadow-glow-sm);
}

.consumption-granularity-btn:hover:not(.active) {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-light);
}

.consumption-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  background: var(--bg-card);
}

.consumption-sort-wrap {
  position: relative;
}

.consumption-sort-panel {
  position: absolute;
  left: 0;
  top: calc(100% + 14px);
  z-index: 20;
  width: 270px;
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  box-shadow: var(--shadow-lg);
  color: var(--text-main);
}

.consumption-sort-panel::before {
  content: "";
  position: absolute;
  top: -8px;
  left: 12px;
  width: 14px;
  height: 14px;
  transform: rotate(45deg);
  border-left: 1px solid var(--border-color);
  border-top: 1px solid var(--border-color);
  background: var(--bg-card);
}

.consumption-sort-panel label {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-main);
  font-size: 15px;
}

.consumption-toolbar-icon {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: var(--primary);
  color: var(--text-inverse);
  cursor: pointer;
  box-shadow: var(--shadow-glow-sm);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
}

.consumption-toolbar-icon:hover {
  background: var(--primary-hover);
  box-shadow: var(--shadow-glow);
  transform: translateY(-1px);
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

.consumption-warning {
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--warning) 34%, transparent);
  border-radius: var(--radius-md);
  background: var(--warning-bg);
  color: var(--warning);
  font-size: 14px;
  font-weight: 700;
}

.consumption-summary-grid,
.consumption-insight-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.consumption-summary-card,
.consumption-insight {
  min-height: 94px;
  padding: 16px;
}

.consumption-summary-card {
  background:
    linear-gradient(135deg, var(--primary-light), transparent 42%),
    var(--bg-card);
}

.consumption-summary-card span,
.consumption-insight span {
  display: block;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0;
}

.consumption-summary-card strong,
.consumption-insight strong {
  display: block;
  margin-top: 10px;
  color: var(--text-strong);
  font-size: 22px;
  line-height: 1.15;
}

.consumption-summary-card small,
.consumption-insight small {
  display: block;
  margin-top: 8px;
  color: var(--text-muted);
}

.consumption-tabs {
  display: flex;
  gap: 32px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
  padding: 0 2px;
}

.consumption-tab {
  position: relative;
  padding: 0 0 12px;
  border: none;
  background: transparent;
  color: var(--text-main);
  font-size: 16px;
  cursor: pointer;
  font-weight: 700;
}

.consumption-tab.active {
  color: var(--primary);
}

.consumption-tab.active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 3px;
  background: var(--primary);
}

.consumption-chart-card {
  min-height: 460px;
  padding: 12px;
  background:
    radial-gradient(circle at 12% 0%, var(--primary-light), transparent 34%),
    var(--bg-card);
}

.consumption-goto {
  width: 56px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  text-align: center;
  background: var(--bg-card);
  color: var(--text-strong);
  outline: 0;
}

.selection-col {
  width: 32px;
}

.consumption-status {
  display: inline-flex;
  align-items: center;
  min-width: 76px;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-weight: 700;
}

.consumption-status.recorded {
  border: 1px solid color-mix(in srgb, var(--success) 34%, transparent);
  background: var(--success-bg);
  color: var(--success);
}

.consumption-status.zero {
  border: 1px solid color-mix(in srgb, var(--danger) 34%, transparent);
  background: var(--danger-bg);
  color: var(--danger);
}

.consumption-change.up {
  color: var(--success);
}

.consumption-change.down {
  color: var(--danger);
}

@media (max-width: 1180px) {
  .consumption-filter-grid,
  .consumption-summary-grid,
  .consumption-insight-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .consumption-granularity {
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .consumption-filter-grid,
  .consumption-summary-grid,
  .consumption-insight-grid {
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
