<template>
  <div class="table-page ddm-container">
    <div class="sr-only">Meter interval ledger</div>

    <div class="filter-toolbar ddm-toolbar">
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
        <BaseSelect v-model="sortField" class="sort-select" aria-label="Sort by" @change="reload">
          <option value="">Sort by...</option>
          <option value="customerName">Customer Name</option>
          <option value="meterId">Meter Id</option>
          <option value="currentDate">Collection Date</option>
          <option value="total1">Total Energy</option>
          <option value="usage1">Last Hour Usage</option>
          <option value="remain1">Credit Balance</option>
          <option value="intervalDemand">Maximum Demand</option>
          <option value="power">Power</option>
          <option value="stationId">Station Id</option>
        </BaseSelect>
        <BaseSelect v-model="sortDir" class="sort-select" aria-label="Sort direction" @change="reload">
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </BaseSelect>
      </div>
      <div class="ddm-toolbar-group ddm-actions-group">
        <BaseButton variant="primary" :disabled="loading" @click="onSearch">Search</BaseButton>
        <BaseButton @click="resetFilters">Reset</BaseButton>
        <BaseButton variant="primary" :disabled="!rows.length" @click="exportCsv">Export</BaseButton>
      </div>
    </div>

    <div class="table-command-strip" aria-live="polite">
      <div>{{ totalRecords }} visible</div>
      <div class="table-command-meta">
        <span>Page {{ page }} / {{ totalPages }}</span>
        <span>{{ pageSize }}/page</span>
      </div>
    </div>

    <div class="table-scroll">
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
            <td><span :class="healthClass(row.relayOpen)">{{ healthText(row.relayOpen) }}</span></td>
            <td><span :class="healthClass(row.batteryLow)">{{ healthText(row.batteryLow) }}</span></td>
            <td><span :class="healthClass(row.magneticInterference)">{{ healthText(row.magneticInterference) }}</span></td>
            <td><span :class="healthClass(row.terminalCoverOpen)">{{ healthText(row.terminalCoverOpen) }}</span></td>
            <td><span :class="healthClass(row.coverOpen)">{{ healthText(row.coverOpen) }}</span></td>
            <td><span :class="healthClass(row.currentReverse)">{{ healthText(row.currentReverse) }}</span></td>
            <td><span :class="healthClass(row.currentUnbalance)">{{ healthText(row.currentUnbalance) }}</span></td>
            <td class="mono-sm text-muted">{{ dateTimeText(row.updateDate) }}</td>
            <td class="action-column">
              <BaseButton
                class="hourly-btn"
                aria-label="Open hourly hover modal"
                @click.stop="openHourly(row)"
              >
                Hourly
              </BaseButton>
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
          <span :class="healthClass(row.relayOpen)">Relay {{ healthText(row.relayOpen) }}</span>
          <span :class="healthClass(row.batteryLow)">Battery {{ healthText(row.batteryLow) }}</span>
          <span :class="healthClass(row.magneticInterference)">Magnetic {{ healthText(row.magneticInterference) }}</span>
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
                    <td class="mono-sm text-muted">{{ dateTimeText(row.createDate || row.timestamp || row.currentDate || row.collectionDate) }}</td>
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
import { getApi, postApi } from "../services/api.js";
import { downloadTextFile, exportReportCsvText } from "../services/import-export.mjs";

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

function normalizeDailyRow(row) {
  return {
    ...row,
    meterId: row.meterId || row.serialNumber || "",
    gatewayId: row.gatewayId || row.gateway || "",
    currentDate: row.currentDate || row.collectionDate || row.timestamp || row.createDate || "",
    customerId: row.customerId || row.customerAccountId || "",
    customerName: row.customerName || row.name || "",
    stationId: row.stationId || row.station || row.siteId || "",
    total1: row.total1 ?? row.totalEnergy ?? row.energyReadingKwh,
    usage1: row.usage1 ?? row.lastHourUsage ?? row.energyConsumptionKwh,
    remain1: row.remain1 ?? row.creditBalance ?? row.energyBalanceKwh,
    intervalDemand: row.intervalDemand ?? row.maximumDemand,
    power: row.power,
    relayOpen: row.relayOpen ?? row.relayStatus,
    batteryLow: row.batteryLow ?? row.batteryStatus,
    magneticInterference: row.magneticInterference ?? row.magneticStatus,
    terminalCoverOpen: row.terminalCoverOpen ?? row.terminalCover,
    coverOpen: row.coverOpen ?? row.upperOpen,
    currentReverse: row.currentReverse,
    currentUnbalance: row.currentUnbalance,
    updateDate: row.updateDate || row.updateTime || row.createDate || row.timestamp || "",
    status: row.status
  };
}

export default {
  name: "DailyDataMeterPage",
  components: { BaseButton, BaseIconButton, BaseInput, BaseSelect },
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
      sortField: "currentDate",
      sortDir: "desc",
      hourly: {
        open: false,
        loading: false,
        error: "",
        meterId: "",
        gatewayId: "",
        date: "",
        rows: [],
        total: 0
      }
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
  mounted() {
    this.reload();
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
          orderBy: this.sortField ? `${this.sortField} ${this.sortDir}` : undefined
        };
        if (this.searchTerm) payload.searchTerm = this.searchTerm;
        const response = await postApi("/api/DailyDataMeter/read", payload);
        const collection = normalizeCollection(response);
        let rows = collection.rows.map(normalizeDailyRow);

        const query = this.searchTerm.trim().toLowerCase();
        if (query) {
          rows = rows.filter((row) => [row.meterId, row.customerId, row.customerName, row.gatewayId, row.stationId]
            .some((value) => String(value || "").toLowerCase().includes(query)));
        }

        rows = this.sortRows(rows);
        this.rows = rows;
        this.totalRecords = query && rows.length < collection.rows.length ? rows.length : collection.total;
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
          response = await getApi("/api/DailyDataMeter/readHourly", params);
        } catch {
          response = await postApi("/api/DailyDataMeter/readMore", {
            lang: "en",
            meterId,
            FROM: params.FROM,
            TO: params.TO,
            pageNumber: 1,
            pageSize: 500
          });
        }
        const collection = normalizeCollection(response);
        const rows = collection.rows
          .filter((item) => !meterId || String(item.meterId || "").trim() === meterId)
          .filter((item) => !date || this.dateOnly(item.timestamp || item.currentDate || item.collectionDate) === date);
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
    sortRows(rows) {
      const field = this.sortField || "currentDate";
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
      this.page = 1;
      this.gotoPage = "1";
      this.reload();
    },
    resetFilters() {
      this.searchTerm = "";
      this.sortField = "currentDate";
      this.sortDir = "desc";
      this.page = 1;
      this.gotoPage = "1";
      this.reload();
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
    exportCsv() {
      const columns = [
        { label: "Meter Id", key: "meterId" },
        { label: "Gateway Id", key: "gatewayId" },
        { label: "Collection Date", key: "currentDate" },
        { label: "Customer Id", key: "customerId" },
        { label: "Customer Name", key: "customerName" },
        { label: "Station Id", key: "stationId" },
        { label: "Total Energy", key: "total1" },
        { label: "Last Hour Usage", key: "usage1" },
        { label: "Credit Balance", key: "remain1" },
        { label: "Power", key: "power" },
        { label: "Status", key: "status" }
      ];
      const content = exportReportCsvText("Interval Data", columns, this.rows, []);
      downloadTextFile("interval_data.csv", content, "text/csv;charset=utf-8");
    },
    healthText(value) {
      if (value === null || value === undefined || value === "") return "Normal";
      const text = String(value || "").toLowerCase();
      if (["normal", "closed", "false", "0", "no", "ok"].includes(text)) return "Normal";
      if (["check", "open", "true", "1", "yes", "abnormal", "error", "failed", "tamper"].includes(text)) return "Check";
      return String(value);
    },
    healthClass(value) {
      return this.healthText(value).toLowerCase() === "normal" ? "sp sp--ok" : "sp sp--danger";
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
    defaultFrom() {
      return new Date(new Date().getFullYear(), 0, 1).toISOString();
    }
  }
};
</script>

<style scoped>
.ddm-container { display: flex; flex-direction: column; min-height: 100%; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.ddm-toolbar { display: grid !important; grid-template-columns: 1fr auto auto; gap: 20px; align-items: center; }
.ddm-toolbar-group { display: flex; align-items: center; gap: 12px; }
.ddm-search-group { width: 100%; }
.ddm-search-group .search-input { width: 100%; max-width: 100%; }
.ddm-sort-group .sort-select { min-width: 140px; }
.mono-sm { font-family: "Courier New", monospace; font-size: 10px; }
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
.ddm-mobile-cards { display: none; }
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
  .ddm-toolbar { grid-template-columns: 1fr; gap: 12px; }
  .ddm-sort-group { flex-wrap: wrap; }
  .ddm-sort-group .sort-select { flex: 1; }
  .ddm-actions-group { justify-content: flex-end; width: 100%; }
}

@media (max-width: 768px) {
  .ddm-container .table-scroll { display: none; }
  .ddm-mobile-cards { display: block; }
  .ddm-toolbar { padding: 12px; }
  .ddm-toolbar-group { gap: 8px; }
  .ddm-sort-group .sort-select,
  .ddm-actions-group .base-button { min-width: 0; }
  .ddm-actions-group { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
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
