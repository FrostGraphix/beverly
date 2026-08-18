<template>
  <div class="table-page ddm-container">
    <div class="sr-only">Meter interval ledger</div>

    <div class="filter-toolbar ddm-toolbar" @click="closeMenus">
      <div class="ddm-toolbar-group ddm-search-group">
        <BaseInput
          v-model="searchTerm"
          class="search-input"
          type="search"
          placeholder="Search customer, meter, station..."
          aria-label="Search interval meter data"
          @keyup.enter="onSearch"
        />
      </div>
      <div class="ddm-toolbar-group ddm-sort-group">
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
            <BaseButton class="sort-direction-menu__item" :class="{ active: sortDir === 'asc' }" @click.stop="setSortDirection('asc')">Ascending</BaseButton>
            <BaseButton class="sort-direction-menu__item" :class="{ active: sortDir === 'desc' }" @click.stop="setSortDirection('desc')">Descending</BaseButton>
          </div>
        </div>
      </div>
      <div class="ddm-toolbar-group ddm-actions-group">
        <BaseButton @click="resetFilters">Reset</BaseButton>
        <ExportRangeMenu
          ref="exportMenu"
          v-model="exportRange"
          title="Export interval data"
          description="XLSX includes every matching row."
          format="XLSX"
          delivery="Streamed download"
          :search-term="searchTerm"
          :sort-label="sortDir === 'desc' ? 'Newest first' : 'Oldest first'"
          :error="exportState.error"
          :disabled="!totalRecords"
          @download="exportXlsx"
        />
      </div>
    </div>

    <div class="table-command-strip" aria-live="polite">
      <div>{{ totalRecords }} visible</div>
      <div class="table-command-meta">
        <span>Page {{ page }} / {{ totalPages }}</span>
        <span>{{ pageSize }}/page</span>
      </div>
    </div>

    <div class="table-scroll" @click="closeRowActionMenu">
      <table style="min-width:2660px">
        <thead>
          <tr>
            <th style="min-width:120px">Meter Id</th>
            <th style="min-width:180px">Gateway Id</th>
            <th style="min-width:150px">Collection Date</th>
            <th style="min-width:120px">Customer Id</th>
            <th style="min-width:180px">Customer Name</th>
            <th style="min-width:110px">Station Id</th>
            <th style="min-width:110px">Total Energy</th>
            <th style="min-width:120px">Last Hour Usage</th>
            <th style="min-width:120px">Credit Balance</th>
            <th style="min-width:130px">Maximum Demand</th>
            <th style="min-width:110px">Power</th>
            <th style="min-width:120px">Relay Status</th>
            <th style="min-width:120px">Battery Status</th>
            <th style="min-width:130px">Magnetic Status</th>
            <th style="min-width:130px">Terminal Cover</th>
            <th style="min-width:120px">Upper Open</th>
            <th style="min-width:130px">Current Reverse</th>
            <th style="min-width:150px">Current Unbalance</th>
            <th style="min-width:160px">Update Time</th>
            <th class="action-column">Actions</th>
          </tr>
        </thead>
        <tbody>
          <template v-if="loading">
            <tr v-for="i in 5" :key="`sk-${i}`" class="skeleton-row">
              <td v-for="column in 20" :key="column">
                <div class="skeleton-cell" :style="{ width: column === 20 ? '74px' : `${58 + (i * 13) % 34}%` }"></div>
              </td>
            </tr>
          </template>
          <tr v-else-if="!rows.length">
            <td class="empty-cell" colspan="20">No data found</td>
          </tr>
          <tr v-else v-for="(row, index) in visibleRows" :key="`${row.meterId || 'row'}-${index}`">
            <td><span class="meter-badge">{{ text(row.meterId) }}</span></td>
            <td class="mono-sm">{{ text(row.gatewayId) }}</td>
            <td class="mono-sm">{{ dateText(row.currentDate) }}</td>
            <td>{{ text(row.customerId) }}</td>
            <td>{{ text(row.customerName) }}</td>
            <td><span class="station-badge">{{ text(row.stationId) }}</span></td>
            <td class="text-primary fw">{{ fmtNum(row.total1) }}</td>
            <td>{{ fmtNum(row.usage1) }}</td>
            <td>{{ fmtNum(row.remain1) }}</td>
            <td>{{ fmtNum(row.intervalDemand) }}</td>
            <td>{{ fmtNum(row.power) }}</td>
            <td><span :class="tableHealthClass(row.relayOpen)">{{ tableHealthText(row.relayOpen) }}</span></td>
            <td><span :class="tableHealthClass(row.batteryLow)">{{ tableHealthText(row.batteryLow) }}</span></td>
            <td><span :class="tableHealthClass(row.magneticInterference)">{{ tableHealthText(row.magneticInterference) }}</span></td>
            <td><span :class="tableHealthClass(row.terminalCoverOpen)">{{ tableHealthText(row.terminalCoverOpen) }}</span></td>
            <td><span :class="tableHealthClass(row.coverOpen)">{{ tableHealthText(row.coverOpen) }}</span></td>
            <td><span :class="tableHealthClass(row.currentReverse)">{{ tableHealthText(row.currentReverse) }}</span></td>
            <td><span :class="tableHealthClass(row.currentUnbalance)">{{ tableHealthText(row.currentUnbalance) }}</span></td>
            <td class="mono-sm text-muted">{{ dateTimeText(row.updateDate) }}</td>
            <td :class="['action-column', { 'action-column--menu-open': isRowActionMenuOpen(index) }]">
              <div class="ddm-action-cell">
                <BaseButton
                  class="hourly-btn ddm-action-btn--desktop"
                  aria-label="Open hourly hover modal"
                  @click.stop="openHourly(row)"
                >
                  Hourly
                </BaseButton>
                <div class="ddm-row-action-menu">
                  <BaseButton
                    class="ddm-row-action-toggle"
                    aria-label="Open row actions"
                    :aria-expanded="isRowActionMenuOpen(index)"
                    @click.stop="toggleRowActionMenu(index)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="5" r="2"></circle>
                      <circle cx="12" cy="12" r="2"></circle>
                      <circle cx="12" cy="19" r="2"></circle>
                    </svg>
                  </BaseButton>
                  <div v-if="isRowActionMenuOpen(index)" class="ddm-row-action-panel" role="menu">
                    <BaseButton class="ddm-row-action-item" role="menuitem" @click.stop="openHourlyFromMenu(row)">Hourly</BaseButton>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="ddm-mobile-cards">
      <template v-if="loading">
        <article v-for="index in 4" :key="`ddm-mobile-sk-${index}`" class="ddm-mobile-card">
          <div v-for="line in 5" :key="line" class="ddm-mobile-line">
            <div class="skeleton-cell" :style="{ width: `${44 + ((index + line) * 11) % 34}%` }"></div>
          </div>
        </article>
      </template>
      <div v-else-if="!visibleRows.length" class="ddm-mobile-empty">No data found</div>
      <article v-else v-for="(row, index) in visibleRows" :key="`ddm-mobile-${row.meterId || 'row'}-${index}`" class="ddm-mobile-card">
        <div class="ddm-mobile-head">
          <div>
            <strong>{{ text(row.meterId) }}</strong>
            <span>{{ dateText(row.currentDate) }}</span>
          </div>
          <BaseButton class="hourly-btn" size="sm" @click.stop="openHourly(row)">Hourly</BaseButton>
        </div>
        <div class="ddm-mobile-grid">
          <div class="ddm-mobile-field">
            <span>Customer</span>
            <strong>{{ text(row.customerName || row.customerId) }}</strong>
          </div>
          <div class="ddm-mobile-field">
            <span>Station</span>
            <strong>{{ text(row.stationId) }}</strong>
          </div>
          <div class="ddm-mobile-field">
            <span>Total Energy</span>
            <strong>{{ fmtNum(row.total1) }}</strong>
          </div>
          <div class="ddm-mobile-field">
            <span>Last Hour</span>
            <strong>{{ fmtNum(row.usage1) }}</strong>
          </div>
          <div class="ddm-mobile-field">
            <span>Credit</span>
            <strong>{{ fmtNum(row.remain1) }}</strong>
          </div>
          <div class="ddm-mobile-field">
            <span>Power</span>
            <strong>{{ fmtNum(row.power) }}</strong>
          </div>
        </div>
        <div class="ddm-mobile-health">
          <span :class="tableHealthClass(row.relayOpen)">Relay {{ tableHealthText(row.relayOpen) }}</span>
          <span :class="tableHealthClass(row.batteryLow)">Battery {{ tableHealthText(row.batteryLow) }}</span>
          <span :class="tableHealthClass(row.magneticInterference)">Magnetic {{ tableHealthText(row.magneticInterference) }}</span>
        </div>
      </article>
    </div>

    <div class="pagination">
      <span>Total {{ totalRecords }}</span>
      <BaseSelect v-model="pageSize" class="sort-select" aria-label="Page size" @change="onPageSizeChange">
        <option :value="10">10/page</option>
        <option :value="20">20/page</option>
        <option :value="50">50/page</option>
        <option :value="100">100/page</option>
      </BaseSelect>
      <BaseButton class="page-chip" size="sm" :disabled="page <= 1" @click="changePage(page - 1)">&#8249;</BaseButton>
      <BaseButton v-for="p in pages" :key="p" :class="['page-chip', p === page ? 'active' : '']" size="sm" @click="changePage(p)">{{ p }}</BaseButton>
      <BaseButton class="page-chip" size="sm" :disabled="page >= totalPages" @click="changePage(page + 1)">&#8250;</BaseButton>
      <span>Go to</span>
      <BaseInput v-model="gotoPage" type="number" class="goto-input" aria-label="Go to page" @keyup.enter="applyGoto" />
    </div>

    <div v-if="hourly.open" class="ddm-overlay" role="dialog" aria-modal="true" @click.self="closeHourly">
      <div class="ddm-modal">
          <div class="ddm-modal-head">
            <div>
              <h2 class="ddm-modal-title">Hourly interval data</h2>
              <p class="ddm-modal-sub">{{ hourly.meterId }} - {{ hourly.date || "Selected day" }}</p>
            </div>
            <BaseIconButton class="ddm-modal-x" aria-label="Close hourly modal" @click="closeHourly">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </BaseIconButton>
          </div>

          <div class="ddm-modal-body">
            <div v-if="hourly.loading" class="ddm-loader"><div class="ddm-spin"></div> Loading hourly data...</div>
            <div v-else-if="hourly.error" class="ddm-err">{{ hourly.error }}</div>
            <div v-else class="ddm-htable-wrap">
              <table class="ddm-htable" style="min-width:2300px">
                <thead>
                  <tr>
                    <th style="min-width:120px">Collection Time</th>
                    <th style="min-width:180px">Gateway Id</th>
                    <th style="min-width:120px">Total Energy</th>
                    <th style="min-width:130px">Last Hour Usage</th>
                    <th style="min-width:130px">Credit Balance</th>
                    <th style="min-width:130px">Maximum Demand</th>
                    <th style="min-width:110px">Voltage-A (V)</th>
                    <th style="min-width:110px">Voltage-B (V)</th>
                    <th style="min-width:110px">Voltage-C (V)</th>
                    <th style="min-width:110px">Current-A (A)</th>
                    <th style="min-width:110px">Current-B (A)</th>
                    <th style="min-width:110px">Current-C (A)</th>
                    <th style="min-width:120px">Relay Status</th>
                    <th style="min-width:120px">Battery Status</th>
                    <th style="min-width:130px">Magnetic Status</th>
                    <th style="min-width:130px">Terminal Cover</th>
                    <th style="min-width:120px">Upper Open</th>
                    <th style="min-width:130px">Current Reverse</th>
                    <th style="min-width:150px">Current Unbalance</th>
                    <th style="min-width:160px">Create Time</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!hourly.rows.length">
                    <td colspan="20" class="empty-cell">No hourly data for this meter and date.</td>
                  </tr>
                  <tr v-for="(row, index) in hourly.rows" :key="`${row.meterId || 'hour'}-${index}`">
                    <td class="mono-sm">{{ timeText(row.timestamp || row.currentDate || row.collectionDate) }}</td>
                    <td class="mono-sm">{{ text(row.gatewayId || hourly.gatewayId) }}</td>
                    <td class="text-primary fw">{{ fmtNum(row.total1 ?? row.totalEnergy ?? row.energyReadingKwh) }}</td>
                    <td>{{ fmtNum(row.usage1 ?? row.lastHourUsage ?? row.energyConsumptionKwh) }}</td>
                    <td>{{ fmtNum(row.remain1 ?? row.creditBalance ?? row.energyBalanceKwh) }}</td>
                    <td>{{ fmtNum(row.intervalDemand ?? row.maximumDemand) }}</td>
                    <td>{{ fmtNum(row.voltageA) }}</td>
                    <td>{{ fmtNum(row.voltageB) }}</td>
                    <td>{{ fmtNum(row.voltageC) }}</td>
                    <td>{{ fmtNum(row.currentA) }}</td>
                    <td>{{ fmtNum(row.currentB) }}</td>
                    <td>{{ fmtNum(row.currentC) }}</td>
                    <td><span :class="healthClass(row.relayOpen ?? row.relayStatus)">{{ healthText(row.relayOpen ?? row.relayStatus) }}</span></td>
                    <td><span :class="healthClass(row.batteryLow ?? row.batteryStatus)">{{ healthText(row.batteryLow ?? row.batteryStatus) }}</span></td>
                    <td><span :class="healthClass(row.magneticInterference ?? row.magneticStatus)">{{ healthText(row.magneticInterference ?? row.magneticStatus) }}</span></td>
                    <td><span :class="healthClass(row.terminalCoverOpen ?? row.terminalCover)">{{ healthText(row.terminalCoverOpen ?? row.terminalCover) }}</span></td>
                    <td><span :class="healthClass(row.coverOpen ?? row.upperOpen)">{{ healthText(row.coverOpen ?? row.upperOpen) }}</span></td>
                    <td><span :class="healthClass(row.currentReverse)">{{ healthText(row.currentReverse) }}</span></td>
                    <td><span :class="healthClass(row.currentUnbalance)">{{ healthText(row.currentUnbalance) }}</span></td>
                    <td class="mono-sm text-muted">{{ hourlyCreateTimeText(row) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="ddm-modal-foot">
            <span>{{ hourly.total }} hourly rows</span>
            <BaseButton @click="closeHourly">Close</BaseButton>
          </div>
      </div>
    </div>
  </div>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseSelect from "./base/BaseSelect.vue";
import ExportRangeMenu from "./base/ExportRangeMenu.vue";
import { getApi, postApi } from "../services/api.js";
import { hourlyCreateTime, intervalRowMatchesSearch, normalizeDailyMeterRow, sliceIntervalRows } from "../services/interval-data-flow.mjs";
import { normalizeIntervalTableStatus } from "../services/interval-status.mjs";

function normalizeCollection(response) {
  const body = response?.body || response;
  const result = body?.result;
  const data = body?.data;
  const rows = body?.readings || result?.readings || data?.readings || result?.data || data?.data || result || data || body;
  if (Array.isArray(rows)) {
    return {
      rows,
      total: Number(body?.total ?? result?.total ?? data?.total ?? rows.length) || rows.length
    };
  }
  return { rows: [], total: 0 };
}

export default {
  name: "DailyDataMeterPage",
  components: { BaseButton, BaseIconButton, BaseInput, BaseSelect, ExportRangeMenu },
  props: {
    route: {
      type: Object,
      default: () => ({})
    }
  },
  data() {
    return {
      searchTerm: "",
      rows: [],
      totalRecords: 0,
      page: 1,
      pageSize: 10,
      gotoPage: "1",
      loading: false,
      sortDir: "desc",
      searchCache: {
        query: "",
        rows: []
      },
      searchDebounceTimer: null,
      skipAutoSearch: false,
      hourly: {
        open: false,
        loading: false,
        error: "",
        meterId: "",
        gatewayId: "",
        date: "",
        rows: [],
        total: 0
      },
      openRowActionIndex: null,
      sortDirectionMenuOpen: false,
      exportRange: "all",
      exportState: { error: "" }
    };
  },
  computed: {
    totalPages() {
      return Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
    },
    visibleRows() {
      return this.rows;
    },
    pages() {
      const pages = [];
      const start = Math.max(1, this.page - 1);
      const end = Math.min(this.totalPages, start + 2);
      for (let index = start; index <= end; index += 1) pages.push(index);
      return pages;
    }
  },
  watch: {
    searchTerm() {
      if (this.skipAutoSearch) {
        this.skipAutoSearch = false;
        return;
      }
      this.scheduleSearch();
    }
  },
  mounted() {
    if (typeof window !== "undefined" && window.location && window.location.hash.includes("?")) {
      const params = new URLSearchParams(window.location.hash.split("?")[1]);
      const initialTerm = params.get("q") || params.get("search") || params.get("searchTerm") || "";
      if (initialTerm) this.searchTerm = initialTerm;
    }
    this.reload();
  },
  beforeUnmount() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  },
  methods: {
    async reload() {
      this.loading = true;
      try {
        const payload = {
          lang: "en",
          pageNumber: this.page,
          pageSize: this.pageSize,
          FROM: this.defaultFrom(),
          TO: new Date().toISOString(),
          orderBy: `currentDate ${this.sortDir}`
        };
        if (this.searchTerm) payload.searchTerm = this.searchTerm;
        const response = await postApi("/api/DailyDataMeter/read", payload);
        const collection = normalizeCollection(response);
        const query = this.searchTerm.trim().toLowerCase();
        let rows = collection.rows.map(normalizeDailyMeterRow);
        let total = collection.total;

        if (query && !rows.every((row) => intervalRowMatchesSearch(row, query))) {
          const searchedRows = this.sortRows(await this.fetchAllSearchMatches(payload, query));
          total = searchedRows.length;
          rows = sliceIntervalRows(searchedRows, this.page, this.pageSize);
        }

        rows = this.sortRows(rows);
        this.rows = rows;
        this.totalRecords = total;
        this.page = Math.min(this.page, this.totalPages);
      } catch (error) {
        console.error("[DailyDataMeterPage]", error);
        this.rows = [];
        this.totalRecords = 0;
      } finally {
        this.loading = false;
      }
    },
    async openHourly(row) {
      this.closeRowActionMenu();
      const meterId = String(row.meterId || "").trim();
      const date = this.dateOnly(row.currentDate);
      this.hourly = {
        open: true,
        loading: true,
        error: "",
        meterId,
        gatewayId: row.gatewayId || "",
        date,
        rows: [],
        total: 0
      };
      try {
        const params = {
          meterId,
          FROM: date ? `${date}T00:00:00.000Z` : this.defaultFrom(),
          TO: date ? `${date}T23:59:59.999Z` : new Date().toISOString(),
          SITE_ID: row.stationId || undefined,
          offset: 0,
          pageLimit: 500
        };
        let response;
        try {
          response = await postApi("/api/DailyDataMeter/readMore", {
            lang: "en",
            meterId,
            FROM: params.FROM,
            TO: params.TO,
            pageNumber: 1,
            pageSize: 500
          });
        } catch {
          response = await getApi("/api/DailyDataMeter/readHourly", params);
        }
        const collection = normalizeCollection(response);
        const rows = collection.rows
          .map(normalizeDailyMeterRow)
          .filter((item) => !meterId || String(item.meterId || "").trim() === meterId)
          .filter((item) => !date || this.dateOnly(item.timestamp || item.currentDate || item.collectionDate || item.createDate || item.createTime) === date);
        this.hourly.rows = rows;
        this.hourly.total = rows.length;
      } catch (error) {
        console.error("[DailyDataMeterPage hourly]", error);
        this.hourly.error = error?.message || "Unable to load hourly data";
      } finally {
        this.hourly.loading = false;
      }
    },
    closeHourly() {
      this.hourly.open = false;
    },
    isRowActionMenuOpen(rowIndex) {
      return this.openRowActionIndex === rowIndex;
    },
    toggleRowActionMenu(rowIndex) {
      this.openRowActionIndex = this.openRowActionIndex === rowIndex ? null : rowIndex;
    },
    closeRowActionMenu() {
      this.openRowActionIndex = null;
    },
    openHourlyFromMenu(row) {
      this.closeRowActionMenu();
      this.openHourly(row);
    },
    async fetchAllSearchMatches(basePayload, query) {
      if (this.searchCache.query === query && this.searchCache.rows.length) {
        return this.searchCache.rows;
      }

      const pageSize = 500;
      const first = await postApi("/api/DailyDataMeter/read", {
        ...basePayload,
        searchTerm: undefined,
        pageNumber: 1,
        pageSize
      });
      const firstCollection = normalizeCollection(first);
      const total = firstCollection.total || firstCollection.rows.length;
      const allRows = firstCollection.rows.map(normalizeDailyMeterRow);
      const pageCount = Math.ceil(total / pageSize);

      for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 4) {
        const pageNumbers = Array.from(
          { length: Math.min(4, pageCount - pageNumber + 1) },
          (_, index) => pageNumber + index
        );
        const pages = await Promise.all(pageNumbers.map((nextPage) => postApi("/api/DailyDataMeter/read", {
          ...basePayload,
          searchTerm: undefined,
          pageNumber: nextPage,
          pageSize
        })));
        for (const response of pages) {
          const collection = normalizeCollection(response);
          allRows.push(...collection.rows.map(normalizeDailyMeterRow));
        }
      }

      const rows = allRows.filter((row) => intervalRowMatchesSearch(row, query));
      this.searchCache = { query, rows };
      return rows;
    },
    sortRows(rows) {
      const field = "currentDate";
      const factor = this.sortDir === "desc" ? -1 : 1;
      return rows.slice().sort((left, right) => {
        const a = this.sortValue(left[field]);
        const b = this.sortValue(right[field]);
        if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
        return String(a).localeCompare(String(b), undefined, { numeric: true }) * factor;
      });
    },
    sortValue(value) {
      if (value === null || value === undefined) return "";
      const text = String(value).trim();
      const number = Number(text.replace(/,/g, ""));
      if (Number.isFinite(number) && /^-?\d+(?:\.\d+)?$/.test(text)) return number;
      const time = Date.parse(text);
      if (Number.isFinite(time)) return time;
      return text.toLowerCase();
    },
    onSearch() {
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = null;
      }
      this.page = 1;
      this.gotoPage = "1";
      this.reload();
    },
    scheduleSearch() {
      if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.searchDebounceTimer = null;
        this.onSearch();
      }, 320);
    },
    resetFilters() {
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = null;
      }
      this.skipAutoSearch = true;
      this.searchTerm = "";
      this.sortDir = "desc";
      this.searchCache = { query: "", rows: [] };
      this.page = 1;
      this.gotoPage = "1";
      this.reload();
    },
    setSortDirection(direction) {
      if (this.sortDir === direction) return;
      this.sortDir = direction;
      this.closeSortDirectionMenu();
      this.reload();
    },
    toggleSortDirectionMenu() {
      this.sortDirectionMenuOpen = !this.sortDirectionMenuOpen;
    },
    closeSortDirectionMenu() {
      this.sortDirectionMenuOpen = false;
    },
    closeMenus() {
      this.closeSortDirectionMenu();
    },
    onPageSizeChange() {
      this.page = 1;
      this.gotoPage = "1";
      this.reload();
    },
    changePage(page) {
      this.page = Math.max(1, Math.min(this.totalPages, page));
      this.gotoPage = String(this.page);
      this.reload();
    },
    applyGoto() {
      const page = Number(this.gotoPage);
      if (Number.isFinite(page)) this.changePage(page);
    },
    exportXlsx() {
      const query = new URLSearchParams({
        range: this.exportRange,
        search: this.searchTerm.trim(),
        sort: this.sortDir
      });
      const anchor = document.createElement("a");
      anchor.href = `/api/DailyDataMeter/export.xlsx?${query.toString()}`;
      anchor.download = `interval_data_${this.exportRange}.xlsx`;
      anchor.hidden = true;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      this.exportState = { error: "" };
      this.$refs.exportMenu?.close();
    },
    healthText(value) {
      // Hourly modal uses same polarity users expect in Interval table.
      return normalizeIntervalTableStatus(value);
    },
    healthClass(value) {
      return normalizeIntervalTableStatus(value) === "Normal" ? "sp sp--ok" : "sp sp--danger";
    },
    tableHealthText(value) {
      return normalizeIntervalTableStatus(value);
    },
    tableHealthClass(value) {
      return normalizeIntervalTableStatus(value) === "Normal" ? "sp sp--ok" : "sp sp--danger";
    },
    fmtNum(value) {
      if (value === null || value === undefined || value === "") return "0";
      const number = Number(value);
      return Number.isNaN(number) ? String(value) : number.toLocaleString(undefined, { maximumFractionDigits: 2 });
    },
    text(value) {
      return value === null || value === undefined || value === "" ? "-" : String(value);
    },
    dateOnly(value) {
      if (!value) return "";
      return String(value).slice(0, 10);
    },
    dateText(value) {
      return this.dateOnly(value) || "-";
    },
    dateTimeText(value) {
      if (!value) return "-";
      const text = String(value);
      if (text.includes("T")) return text.replace("T", " ").slice(0, 19);
      return text.slice(0, 19);
    },
    timeText(value) {
      const text = this.dateTimeText(value);
      if (text === "-") return text;
      return text.includes(" ") ? text.slice(11, 19) : text.slice(0, 8);
    },
    hourlyCreateTimeText(row) {
      return this.dateTimeText(hourlyCreateTime(row));
    },
    defaultFrom() {
      return new Date(new Date().getFullYear(), 0, 1).toISOString();
    }
  }
};
</script>

<style scoped>
.ddm-container { display: flex; flex-direction: column; min-height: 100%; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.ddm-toolbar { position: relative; z-index: 100; overflow: visible; display: grid !important; grid-template-columns: 1fr auto auto; gap: 20px; align-items: center; }
.ddm-toolbar-group { display: flex; align-items: center; gap: 12px; }
.ddm-search-group { width: 100%; }
.ddm-search-group .search-input { width: 100%; max-width: 100%; }
.ddm-sort-group .sort-select { min-width: 140px; }
.sort-direction-menu { position: relative; }
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
  z-index: 20;
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
.mono-sm { font-family: var(--bev-font-mono); font-size: 10px; }
.text-primary { color: var(--primary); }
.text-muted { color: var(--text-muted); }
.fw { font-weight: 700; }
.meter-badge { background: var(--primary-light); color: var(--primary); border-radius: var(--radius-sm); padding: 1px 6px; font-size: 10px; font-weight: 800; }
.station-badge { background: var(--info-bg); color: var(--info); border-radius: var(--radius-sm); padding: 1px 6px; font-size: 10px; font-weight: 800; }
.sp { display: inline-flex; align-items: center; min-height: 22px; padding: 2px 8px; border-radius: var(--badge-radius); font-size: 10px; font-weight: 800; white-space: nowrap; }
.sp--ok { background: var(--success-bg); color: var(--success); }
.sp--warn { background: var(--warning-bg); color: var(--warning); }
.sp--danger { background: var(--danger-bg); color: var(--danger); }
.hourly-btn { min-width: 74px !important; height: 28px !important; padding-inline: 12px !important; font-size: 10px !important; }
.ddm-action-cell { display: inline-flex; justify-content: flex-end; width: 100%; }
.ddm-row-action-menu { display: none; }
.goto-input { width: 50px; height: 28px; text-align: center; }
.ddm-overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: 20px; background: var(--bg-overlay); backdrop-filter: blur(10px); }
.ddm-modal { width: min(980px, 100%); max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-color); border-radius: var(--modal-radius); background: var(--bg-card); box-shadow: var(--shadow-xl); }
.ddm-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 16px 20px; border-bottom: 1px solid var(--border-color); background: linear-gradient(180deg, var(--bg-card), var(--bg-page)); }
.ddm-modal-title { margin: 0; color: var(--text-strong); font-size: 16px; }
.ddm-modal-sub { margin: 4px 0 0; color: var(--text-muted); font-size: 12px; }
.ddm-modal-x svg { width: 18px; height: 18px; }
.ddm-modal-body { flex: 1; min-height: 220px; overflow: auto; }
.ddm-modal-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; border-top: 1px solid var(--border-color); color: var(--text-muted); background: var(--bg-page); }
.ddm-htable-wrap { overflow-x: auto; }
.ddm-htable { width: 100%; border-collapse: separate; border-spacing: 0; color: var(--text-main); font-size: 12px; }
.ddm-htable th { padding: 11px 14px; border-bottom: 1px solid var(--border-color); color: var(--text-muted); background: linear-gradient(180deg, var(--bg-card), var(--bg-page)); font-size: 11px; font-weight: 800; text-align: left; text-transform: uppercase; }
.ddm-htable td { padding: 11px 14px; border-bottom: 1px solid var(--border-color); color: var(--text-main); font-variant-numeric: tabular-nums; }
.ddm-htable tr:hover td { background: color-mix(in srgb, var(--primary-light) 72%, transparent); }
.ddm-loader { min-height: 220px; display: flex; align-items: center; justify-content: center; gap: 12px; color: var(--text-muted); }
.ddm-err { padding: 40px; color: var(--danger); text-align: center; }
.ddm-spin { width: 24px; height: 24px; border: 3px solid var(--border-color); border-top-color: var(--primary); border-radius: 999px; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.ddm-mobile-cards { display: none !important; }
.ddm-mobile-card { padding: 14px; border-top: 1px solid var(--border-color); background: var(--bg-card); }
.ddm-mobile-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.ddm-mobile-head div { min-width: 0; display: grid; gap: 3px; }
.ddm-mobile-head strong { color: var(--text-strong); font-size: 14px; line-height: 1.2; word-break: break-word; }
.ddm-mobile-head span { color: var(--text-muted); font-size: 11px; }
.ddm-mobile-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.ddm-mobile-field { min-width: 0; display: grid; gap: 3px; padding: 9px 10px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--bg-page) 58%, var(--bg-card)); }
.ddm-mobile-field span { color: var(--text-muted); font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
.ddm-mobile-field strong { min-width: 0; color: var(--text-main); font-size: 12px; word-break: break-word; }
.ddm-mobile-health { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color); }
.ddm-mobile-line { margin-bottom: 10px; }
.ddm-mobile-empty { padding: 24px 14px; border-top: 1px solid var(--border-color); color: var(--text-muted); text-align: center; background: var(--bg-card); }

.ddm-container :deep(.base-input),
.ddm-container :deep(.base-select) {
  background: var(--bg-card);
  color: var(--text-main);
}

.ddm-container :deep(.base-input:focus),
.ddm-container :deep(.base-select:focus) {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
}

@media (max-width: 900px) {
  .ddm-toolbar { grid-template-columns: 1fr auto auto; gap: 12px; }
  .ddm-search-group { grid-column: 1 / -1; }
  .ddm-sort-group { grid-column: 1; }
  .ddm-actions-group { grid-column: 2 / span 2; justify-content: flex-end; width: auto; }
  .ddm-sort-group { flex-wrap: wrap; }
  .ddm-sort-group .sort-select { flex: 1; }
}

@media (max-width: 768px) {
  .ddm-container th.action-column,
  .ddm-container td.action-column {
    min-width: 84px !important;
    width: 84px !important;
    overflow: visible !important;
  }
  .ddm-action-btn--desktop { display: none !important; }
  .ddm-row-action-menu { display: inline-flex !important; position: relative; pointer-events: auto; }
  .ddm-row-action-toggle {
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
  .ddm-row-action-toggle svg { width: 16px; height: 16px; fill: currentColor; }
  .ddm-row-action-panel {
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
  .ddm-row-action-item {
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
  .ddm-row-action-item:hover { background: var(--primary-light); color: var(--primary); }
  .ddm-container td.action-column.action-column--menu-open {
    z-index: 60;
    overflow: visible !important;
  }
  .ddm-container .table-scroll { display: block; }
  .ddm-toolbar { padding: 12px; }
  .ddm-toolbar-group { gap: 8px; }
  .ddm-sort-group .sort-select,
  .ddm-actions-group .base-button { min-width: 0; }
  .ddm-actions-group { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ddm-actions-group :deep(.base-button) { width: 100%; padding-inline: 8px; }
  .ddm-container .table-command-strip { padding: 10px 12px; }
  .ddm-container .pagination { padding: 12px; gap: 8px; }
  .ddm-modal { max-height: calc(100vh - 24px); border-radius: var(--radius-md); }
  .ddm-overlay { padding: 12px; }
  .ddm-modal-head,
  .ddm-modal-foot { padding: 12px 14px; }
}

@media (max-width: 420px) {
  .ddm-mobile-grid { grid-template-columns: 1fr; }
  .ddm-actions-group { grid-template-columns: 1fr; }
}
</style>
