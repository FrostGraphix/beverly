<template>
  <div class="ddm-page">
    <div class="ddm-filter-bar">
      <div class="ddm-filter-title">
        <svg class="ddm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        <div>
          <h1 class="ddm-h1">Interval Data (DailyDataMeter)</h1>
          <p class="ddm-sub">Daily meter readings · Relay status · Tamper events</p>
        </div>
      </div>
      <div class="ddm-controls">
        <BaseSelect v-model="stationId" class="ddm-select" @change="onFilterChange">
          <option value="">All Stations</option>
          <option v-for="s in stations" :key="s" :value="s">{{ s }}</option>
        </BaseSelect>
        <div class="ddm-date-group">
          <label class="ddm-label">From</label>
          <BaseInput type="date" v-model="from" class="ddm-input" @change="onFilterChange" />
        </div>
        <div class="ddm-date-group">
          <label class="ddm-label">To</label>
          <BaseInput type="date" v-model="to" class="ddm-input" @change="onFilterChange" />
        </div>
        <BaseButton class="ddm-btn" variant="primary" :disabled="loading" @click="reload">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ spinning: loading }"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Refresh
        </BaseButton>
      </div>
    </div>

    <div class="ddm-stats">
      <div class="ddm-stat-card">
        <div class="ddm-stat-value">{{ stats.totalMeters.toLocaleString() }}</div>
        <div class="ddm-stat-label">Meters</div>
      </div>
      <div class="ddm-stat-card">
        <div class="ddm-stat-value">{{ stats.totalReadings.toLocaleString() }}</div>
        <div class="ddm-stat-label">Readings</div>
      </div>
      <div class="ddm-stat-card">
        <div class="ddm-stat-value">{{ stats.avgUsage.toFixed(2) }}</div>
        <div class="ddm-stat-label">Avg Usage (kWh)</div>
      </div>
      <div class="ddm-stat-card ddm-stat-card--alert">
        <div class="ddm-stat-value">{{ stats.tamperEvents.toLocaleString() }}</div>
        <div class="ddm-stat-label">Tamper Events</div>
      </div>
      <div class="ddm-stat-card ddm-stat-card--warn">
        <div class="ddm-stat-value">{{ stats.relayOpen.toLocaleString() }}</div>
        <div class="ddm-stat-label">Relay Open</div>
      </div>
    </div>

    <div class="ddm-table-card">
      <div class="ddm-table-header">
        <div>
          <strong>Meter interval ledger</strong>
          <span>{{ displayRows.length.toLocaleString() }} shown</span>
        </div>
        <BaseInput v-model="search" class="ddm-search" placeholder="Search meter, customer, gateway..." type="search" aria-label="Search interval meter data" />
        <span class="ddm-page-info">
          Page {{ page }} of {{ totalPages }} ({{ totalRecords.toLocaleString() }} records)
        </span>
      </div>
      <div v-if="loading" class="ddm-loading">
        <div class="ddm-spinner"></div>
        <span>Loading meter data...</span>
      </div>
      <div v-else-if="!displayRows.length" class="ddm-empty">No meter data for this period and station filter.</div>
      <div v-else class="ddm-table-wrap">
        <table class="ddm-table">
          <thead>
            <tr>
              <th @click="sort('currentDate')" class="sortable">Date <span class="sort-arrow">{{ sortArrow('currentDate') }}</span></th>
              <th @click="sort('meterId')" class="sortable">Meter <span class="sort-arrow">{{ sortArrow('meterId') }}</span></th>
              <th @click="sort('customerName')" class="sortable">Customer <span class="sort-arrow">{{ sortArrow('customerName') }}</span></th>
              <th>Gateway</th>
              <th @click="sort('derivedUsage')" class="sortable">Usage (kWh) <span class="sort-arrow">{{ sortArrow('derivedUsage') }}</span></th>
              <th @click="sort('total1')" class="sortable">Total (kWh) <span class="sort-arrow">{{ sortArrow('total1') }}</span></th>
              <th @click="sort('remain1')" class="sortable">Remaining <span class="sort-arrow">{{ sortArrow('remain1') }}</span></th>
              <th>Power</th>
              <th>Status</th>
              <th>Station</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in displayRows" :key="row._id" :class="rowClass(row)">
              <td class="mono-sm">{{ (row.currentDate || '').substring(0, 10) }}</td>
              <td><span class="meter-badge">{{ row.meterId }}</span></td>
              <td>{{ row.customerName || row.customerId || '—' }}</td>
              <td class="text-muted">{{ row.gatewayId || '—' }}</td>
              <td>{{ fmtNum(row.derivedUsage) }}</td>
              <td class="fw-600">{{ fmtNum(row.total1) }}</td>
              <td>{{ fmtNum(row.remain1) }}</td>
              <td>{{ fmtNum(row.power) }}</td>
              <td>
                <span v-if="isTamper(row)" class="status-badge status-badge--tamper">Tamper</span>
                <span v-else-if="row.relayOpen" class="status-badge status-badge--relay">Relay Open</span>
                <span v-else class="status-badge status-badge--ok">Normal</span>
              </td>
              <td><span class="station-badge">{{ row.stationId }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="ddm-pagination">
        <BaseButton class="page-btn" size="sm" :disabled="page <= 1" @click="page--; reload()">‹</BaseButton>
        <span class="page-info-num">{{ page }} / {{ totalPages }}</span>
        <BaseButton class="page-btn" size="sm" :disabled="page >= totalPages" @click="page++; reload()">›</BaseButton>
      </div>
    </div>
  </div>
</template>

<script>
import { LIVE_STATIONS } from "../services/consumption-service.mjs";
import BaseButton from "./base/BaseButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseSelect from "./base/BaseSelect.vue";

function sortByDate(rows) {
  return rows.slice().sort((a, b) => String(a.currentDate || "").localeCompare(String(b.currentDate || "")));
}

function deriveUsageRows(rows) {
  const byMeter = new Map();
  rows.forEach((row) => {
    const key = String(row.meterId || row.customerId || "");
    if (!byMeter.has(key)) byMeter.set(key, []);
    byMeter.get(key).push(row);
  });

  const usageByKey = new Map();
  byMeter.forEach((meterRows, meterId) => {
    const sorted = sortByDate(meterRows);
    sorted.forEach((row, index) => {
      const current = Number(row.total1) || 0;
      const previous = index === 0 ? current : (Number(sorted[index - 1].total1) || 0);
      const derivedUsage = Math.max(0, current - previous);
      const id = row._id || `${meterId}-${index}`;
      usageByKey.set(id, parseFloat(derivedUsage.toFixed(3)));
    });
  });

  return rows.map((row, index) => {
    const id = row._id || `${row.meterId || row.customerId || "row"}-${index}`;
    return {
      ...row,
      _id: id,
      derivedUsage: usageByKey.get(id) ?? 0,
    };
  });
}

export default {
  name: "DailyDataMeterPage",
  components: { BaseButton, BaseInput, BaseSelect },
  data() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    return {
      stations: LIVE_STATIONS,
      stationId: "",
      from: monthStart,
      to: today,
      rows: [],
      totalRecords: 0,
      page: 1,
      pageSize: 100,
      loading: false,
      search: "",
      sortKey: "currentDate",
      sortDir: -1,
    };
  },
  computed: {
    normalizedRows() {
      return deriveUsageRows(this.rows);
    },
    stats() {
      const rows = this.normalizedRows;
      const meters = new Set(rows.map((row) => row.meterId)).size;
      const total = rows.length;
      const usage = rows.reduce((sum, row) => sum + (Number(row.derivedUsage) || 0), 0);
      const tamper = rows.filter((row) => this.isTamper(row)).length;
      const relay = rows.filter((row) => row.relayOpen).length;
      return {
        totalMeters: meters,
        totalReadings: this.totalRecords,
        avgUsage: total > 0 ? usage / total : 0,
        tamperEvents: tamper,
        relayOpen: relay,
      };
    },
    totalPages() {
      return Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
    },
    displayRows() {
      let result = this.normalizedRows;
      if (this.search) {
        const query = this.search.toLowerCase();
        result = result.filter((row) =>
          String(row.meterId || "").toLowerCase().includes(query) ||
          String(row.customerId || "").toLowerCase().includes(query) ||
          String(row.customerName || "").toLowerCase().includes(query) ||
          String(row.gatewayId || "").toLowerCase().includes(query)
        );
      }
      return result.slice().sort((a, b) => {
        const va = a[this.sortKey];
        const vb = b[this.sortKey];
        if (typeof va === "string" || typeof vb === "string") {
          return String(va || "").localeCompare(String(vb || "")) * this.sortDir;
        }
        return ((Number(va) || 0) - (Number(vb) || 0)) * this.sortDir;
      });
    },
  },
  mounted() {
    this.reload();
  },
  methods: {
    onFilterChange() {
      this.page = 1;
      this.reload();
    },
    async reload() {
      this.loading = true;
      try {
        const body = {
          lang: "en",
          pageNumber: this.page,
          pageSize: this.pageSize,
          FROM: this.from,
          TO: this.to,
        };
        if (this.stationId) body.stationId = this.stationId;

        const res = await fetch("/api/DailyDataMeter/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const result = data?.result || data?.data || {};
        this.rows = (Array.isArray(result.data) ? result.data : []).map((row, index) => ({ ...row, _id: `${this.page}-${index}` }));
        this.totalRecords = Number(result.total) || this.rows.length;
      } catch (e) {
        console.error("[DailyDataMeterPage]", e);
        this.rows = [];
        this.totalRecords = 0;
      } finally {
        this.loading = false;
      }
    },
    isTamper(row) {
      return !!(row.terminalCoverOpen || row.magneticInterference || row.currentReverse);
    },
    rowClass(row) {
      if (this.isTamper(row)) return "ddm-row ddm-row--tamper";
      if (row.relayOpen) return "ddm-row ddm-row--relay";
      return "ddm-row";
    },
    fmtNum(value) {
      if (value == null || value === "") return "—";
      const number = Number(value);
      return Number.isNaN(number) ? String(value) : number.toLocaleString(undefined, { maximumFractionDigits: 2 });
    },
    sort(key) {
      if (this.sortKey === key) this.sortDir *= -1;
      else {
        this.sortKey = key;
        this.sortDir = -1;
      }
    },
    sortArrow(key) {
      if (this.sortKey !== key) return "";
      return this.sortDir === -1 ? "↓" : "↑";
    },
  },
};
</script>

<style scoped>
.ddm-page { display: flex; flex-direction: column; gap: 16px; padding: 20px; min-height: 100%; box-sizing: border-box; font-family: var(--font-family); }
.ddm-filter-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; }
.ddm-filter-title { display: flex; align-items: center; gap: 12px; }
.ddm-icon { width: 36px; height: 36px; padding: 7px; background: var(--primary-light); color: var(--primary); border-radius: var(--radius-md); flex-shrink: 0; }
.ddm-h1 { font-size: 18px; font-weight: 800; color: var(--text-strong); margin: 0; line-height: 1.2; }
.ddm-sub { font-size: 11px; color: var(--text-muted); margin: 2px 0 0; }
.ddm-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ddm-select { height: 30px; padding: 0 10px; border-radius: var(--radius-md); border: 1px solid var(--border-color); font-size: 12px; font-family: var(--font-family); background: var(--bg-card); color: var(--text-main); cursor: pointer; }
.ddm-date-group { display: flex; flex-direction: column; gap: 3px; }
.ddm-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
.ddm-input { height: 30px; padding: 0 8px; border-radius: var(--radius-md); border: 1px solid var(--border-color); font-size: 12px; font-family: var(--font-family); background: var(--bg-card); color: var(--text-main); }
.ddm-btn { height: 30px; padding: 0 14px; border-radius: var(--radius-md); font-size: 12px; font-family: var(--font-family); font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; border: none; background: var(--primary); color: #fff; transition: all 0.15s; }
.ddm-btn svg { width: 14px; height: 14px; }
.ddm-btn:hover:not(:disabled) { opacity: 0.88; }
.ddm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.ddm-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
@media (max-width: 1000px) { .ddm-stats { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 600px) { .ddm-stats { grid-template-columns: repeat(2, 1fr); } }
.ddm-stat-card { background: var(--bg-card); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); padding: 16px 18px; text-align: center; position: relative; overflow: hidden; transition: transform 0.15s, box-shadow 0.15s; }
.ddm-stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
.ddm-stat-card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--primary); }
.ddm-stat-card--alert::before { background: #f4516c; }
.ddm-stat-card--warn::before { background: #ffb822; }
.ddm-stat-value { font-size: 22px; font-weight: 800; color: var(--text-strong); margin-bottom: 4px; }
.ddm-stat-card--alert .ddm-stat-value { color: #f4516c; }
.ddm-stat-card--warn .ddm-stat-value { color: #e6a817; }
.ddm-stat-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
.ddm-table-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden; }
.ddm-table-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border-color); flex-wrap: wrap; gap: 12px; background: linear-gradient(90deg, rgba(236,253,245,.86), rgba(255,255,255,.96)); }
.ddm-table-header strong { display: block; color: var(--text-strong); font-size: 13px; line-height: 1.2; }
.ddm-table-header span { color: var(--text-muted); font-size: 11px; font-weight: 700; }
.ddm-search { height: 36px; padding: 0 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color); font-size: 12px; font-family: var(--font-family); background: var(--bg-card); color: var(--text-main); width: min(320px, 100%); outline: 0; transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }
.ddm-search:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }
.ddm-page-info { font-size: 12px; color: var(--text-muted); }
.ddm-table-wrap { overflow-x: auto; }
.ddm-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
.ddm-table th { height: 42px; padding: 10px 12px; text-align: left; font-size: 11px; color: var(--text-muted); border-bottom: 1px solid var(--border-mid); white-space: nowrap; background: linear-gradient(180deg, rgba(240,253,244,.95), rgba(255,255,255,.95)); position: sticky; top: 0; letter-spacing: 0; text-transform: uppercase; box-shadow: inset 0 -1px 0 rgba(5,150,105,.08); }
.ddm-table td { padding: 11px 12px; border-bottom: 1px solid rgba(209,250,229,.72); color: var(--text-main); vertical-align: middle; font-variant-numeric: tabular-nums; }
.sortable { cursor: pointer; user-select: none; }
.sortable:hover { color: var(--primary); }
.sort-arrow { font-size: 10px; color: var(--primary); }
.ddm-row { transition: background var(--transition-fast), box-shadow var(--transition-fast); }
.ddm-row:hover { background: rgba(236,253,245,.68); box-shadow: inset 3px 0 0 var(--primary); }
.ddm-row--tamper { background: rgba(244, 81, 108, 0.06); }
.ddm-row--tamper:hover { background: rgba(244, 81, 108, 0.12); }
.ddm-row--relay { background: rgba(255, 184, 34, 0.06); }
.ddm-row--relay:hover { background: rgba(255, 184, 34, 0.12); }
.mono-sm { font-family: "Courier New", monospace; font-size: 11px; color: var(--text-muted); }
.fw-600 { font-weight: 600; }
.text-muted { color: var(--text-muted); }
.meter-badge { background: var(--primary-light); color: var(--primary); border-radius: 4px; padding: 1px 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; }
.station-badge { background: rgba(52,191,163,.12); color: #34bfa3; border-radius: 4px; padding: 1px 6px; font-size: 10px; font-weight: 700; }
.status-badge { padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; }
.status-badge--ok { background: rgba(52,191,163,.12); color: #34bfa3; }
.status-badge--tamper { background: rgba(244,81,108,.12); color: #f4516c; }
.status-badge--relay { background: rgba(255,184,34,.12); color: #e6a817; }
.ddm-pagination { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border-color); font-size: 12px; color: var(--text-muted); background: var(--bg-card); }
.page-btn { background: none; border: 1px solid var(--border-color); border-radius: var(--radius-md); min-width: 32px; height: 32px; cursor: pointer; font-size: 14px; color: var(--text-main); transition: all 0.15s; display: flex; align-items: center; justify-content: center; }
.page-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.page-info-num { font-weight: 600; color: var(--text-main); }
.ddm-loading { padding: 60px; display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--text-muted); font-size: 13px; }
.ddm-spinner { width: 28px; height: 28px; border: 3px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
.ddm-empty { padding: 60px; text-align: center; color: var(--text-muted); font-size: 13px; }
</style>
