<template>
  <section class="alarm-page" aria-labelledby="alarm-title">
    <header class="alarm-heading">
      <div>
        <p class="alarm-kicker">Interval intelligence</p>
        <h1 id="alarm-title">Abnormal alarms</h1>
        <p>Telemetry exceptions needing review.</p>
      </div>
      <div class="alarm-heading-actions">
        <BaseButton :loading="loading" @click="load">Refresh</BaseButton>
        <ExportRangeMenu
          ref="exportMenu"
          v-model="exportRange"
          title="Export abnormal alarms"
          description="CSV includes matching alarm evidence."
          :search-term="searchTerm"
          :loading="exportLoading"
          :error="exportError"
          @download="downloadExport"
        />
      </div>
    </header>

    <div v-if="meta.truncated" class="alarm-notice warning" role="status">
      <strong>Partial source coverage.</strong>
      <span>{{ formatNumber(meta.scannedRows) }} of {{ formatNumber(meta.sourceTotal) }} readings scanned. Select one station for complete review.</span>
    </div>
    <div v-else-if="meta.warning" class="alarm-notice danger" role="alert">
      <strong>Telemetry source warning.</strong>
      <span>{{ meta.warning }}</span>
    </div>

    <div class="alarm-filters" aria-label="Alarm filters">
      <label>
        <span>Station</span>
        <BaseSelect v-model="stationId" @change="applyFilters">
          <option value="">All stations</option>
          <option v-for="station in stations" :key="station.value || station" :value="station.value || station">{{ station.label || station }}</option>
        </BaseSelect>
      </label>
      <label>
        <span>Alarm type</span>
        <BaseSelect v-model="alarmType" @change="applyFilters">
          <option value="">All alarms</option>
          <option v-for="type in alarmTypes" :key="type.key" :value="type.key">{{ type.label }}</option>
        </BaseSelect>
      </label>
      <label class="alarm-search">
        <span>Search</span>
        <BaseInput v-model="searchTerm" type="search" placeholder="Meter, customer, gateway" @keyup.enter="applyFilters" />
      </label>
      <div class="alarm-severity">
        <span>Severity</span>
        <div class="alarm-segments" role="group" aria-label="Severity">
          <BaseButton v-for="option in severityOptions" :key="option.value" size="sm" :class="{ active: severity === option.value }" @click="setSeverity(option.value)">{{ option.label }}</BaseButton>
        </div>
      </div>
      <label>
        <span>From</span>
        <BaseInput v-model="from" type="date" @change="applyFilters" />
      </label>
      <label>
        <span>To</span>
        <BaseInput v-model="to" type="date" @change="applyFilters" />
      </label>
      <div class="alarm-filter-actions">
        <BaseButton @click="applyFilters">Apply</BaseButton>
        <BaseButton variant="quiet" @click="resetFilters">Reset</BaseButton>
      </div>
    </div>

    <div class="alarm-stats" aria-label="Alarm summary">
      <article v-for="stat in statCards" :key="stat.label" :class="['alarm-stat', stat.tone]">
        <span>{{ stat.label }}</span>
        <strong>{{ loading ? "-" : formatNumber(stat.value) }}</strong>
        <small>{{ stat.note }}</small>
      </article>
    </div>

    <div class="alarm-ledger">
      <div class="alarm-ledger-head">
        <div>
          <h2>Alarm ledger</h2>
          <p>{{ formatNumber(total) }} matching events</p>
        </div>
        <div class="alarm-ledger-tools">
          <div class="alarm-view-switch" role="group" aria-label="Alarm result view">
            <BaseButton size="sm" aria-label="List view" title="List view" :class="{ active: viewMode === 'list' }" :aria-pressed="viewMode === 'list'" @click="setViewMode('list')">
              <svg class="alarm-view-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>
            </BaseButton>
            <BaseButton size="sm" aria-label="Table view" title="Table view" :class="{ active: viewMode === 'table' }" :aria-pressed="viewMode === 'table'" @click="setViewMode('table')">
              <svg class="alarm-view-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h18v16H3zM3 10h18M3 16h18M9 4v16M15 4v16" /></svg>
            </BaseButton>
          </div>
          <div class="alarm-source">
            <span>Source</span>
            <strong>Interval data API</strong>
          </div>
        </div>
      </div>

      <div v-if="error" class="alarm-state danger" role="alert">
        <strong>Alarms could not load.</strong>
        <span>{{ error }}</span>
        <BaseButton @click="load">Retry</BaseButton>
      </div>
      <div v-else-if="loading" class="alarm-loading" aria-label="Loading alarms">
        <span v-for="item in 6" :key="item" />
      </div>
      <div v-else-if="!rows.length" class="alarm-state">
        <strong>No alarms found.</strong>
        <span>Adjust filters or widen dates.</span>
      </div>

      <div v-else-if="viewMode === 'table'" class="alarm-table-wrap">
        <table class="alarm-table">
          <thead>
            <tr><th>Severity</th><th>Alarm</th><th>Meter</th><th>Customer</th><th>Station</th><th>Evidence</th><th>Observed</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="rowKey(row)">
              <td><span :class="['alarm-pill', row.severity]">{{ row.severity }}</span></td>
              <td><strong>{{ row.alarmLabel }}</strong><small>{{ row.category }}</small></td>
              <td class="alarm-mono">{{ row.meterId || "-" }}</td>
              <td>{{ row.customerName || row.customerId || "-" }}</td>
              <td>{{ row.stationId || "-" }}<small>{{ row.gatewayId || "No gateway" }}</small></td>
              <td><span :class="['alarm-risk', row.bypassRisk]">{{ riskLabel(row.bypassRisk) }}</span></td>
              <td>{{ formatDate(row.currentDate || row.updateDate) }}</td>
              <td><BaseButton size="sm" @click="selected = row">Inspect</BaseButton></td>
            </tr>
          </tbody>
        </table>


      </div>

      <div v-else class="alarm-card-list" aria-label="Alarm list">
        <article v-for="row in rows" :key="rowKey(row)" class="alarm-card">
          <header>
            <div><span :class="['alarm-pill', row.severity]">{{ row.severity }}</span><h3>{{ row.alarmLabel }}</h3></div>
            <span :class="['alarm-risk', row.bypassRisk]">{{ riskLabel(row.bypassRisk) }}</span>
          </header>
          <dl>
            <div><dt>Meter</dt><dd class="alarm-mono">{{ row.meterId || "-" }}</dd></div>
            <div><dt>Customer</dt><dd>{{ row.customerName || row.customerId || "-" }}</dd></div>
            <div><dt>Station</dt><dd>{{ row.stationId || "-" }}</dd></div>
            <div><dt>Observed</dt><dd>{{ formatDate(row.currentDate || row.updateDate) }}</dd></div>
          </dl>
          <footer><span>{{ row.gatewayId || "No gateway" }}</span><BaseButton size="sm" @click="selected = row">Inspect</BaseButton></footer>
        </article>
      </div>

      <footer v-if="total" class="alarm-pagination">
        <span>Page {{ page }} / {{ pageCount }}</span>
        <div><BaseButton size="sm" :disabled="page <= 1" @click="goPage(page - 1)">Previous</BaseButton><BaseButton size="sm" :disabled="page >= pageCount" @click="goPage(page + 1)">Next</BaseButton></div>
      </footer>
    </div>

    <div v-if="selected" class="alarm-detail-backdrop" @click.self="selected = null">
      <aside class="alarm-detail" role="dialog" aria-modal="true" aria-labelledby="alarm-detail-title">
        <header><div><span :class="['alarm-pill', selected.severity]">{{ selected.severity }}</span><h2 id="alarm-detail-title">{{ selected.alarmLabel }}</h2></div><BaseButton variant="ghost" size="sm" aria-label="Close alarm details" @click="selected = null">&times;</BaseButton></header>
        <p>{{ selected.description }}</p>
        <section><h3>Meter identity</h3><dl class="alarm-detail-grid"><div><dt>Meter</dt><dd>{{ selected.meterId || "-" }}</dd></div><div><dt>Customer</dt><dd>{{ selected.customerName || selected.customerId || "-" }}</dd></div><div><dt>Station</dt><dd>{{ selected.stationId || "-" }}</dd></div><div><dt>Gateway</dt><dd>{{ selected.gatewayId || "-" }}</dd></div></dl></section>
        <section><h3>Interval evidence</h3><dl class="alarm-detail-grid"><div><dt>Power</dt><dd>{{ valueOrDash(selected.power) }}</dd></div><div><dt>Demand</dt><dd>{{ valueOrDash(selected.intervalDemand) }}</dd></div><div><dt>Usage</dt><dd>{{ valueOrDash(selected.usage1) }}</dd></div><div><dt>Credit</dt><dd>{{ valueOrDash(selected.remain1) }}</dd></div><div><dt>Currents A/B/C</dt><dd>{{ joinedValues(selected.currentA, selected.currentB, selected.currentC) }}</dd></div><div><dt>Voltages A/B/C</dt><dd>{{ joinedValues(selected.voltageA, selected.voltageB, selected.voltageC) }}</dd></div></dl></section>
        <section class="alarm-assessment"><h3>Assessment</h3><div><span>Bypass risk</span><strong :class="selected.bypassRisk">{{ riskLabel(selected.bypassRisk) }}</strong></div><p>{{ selected.recommendedAction }}</p><small>Risk indicates correlated telemetry. Field inspection confirms bypass.</small></section>
      </aside>
    </div>
  </section>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseSelect from "./base/BaseSelect.vue";
import ExportRangeMenu from "./base/ExportRangeMenu.vue";
import { fetchStations, formatStationDisplayLabel, stationsSync } from "../services/station-registry.mjs";
import { downloadTextFile } from "../services/import-export.mjs";
import { loadDynamicStationOptions, tableSiteOptions } from "../services/table-service.js";

const DAY = 86400000;

function dateInput(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default {
  name: "AbnormalAlarmPage",
  components: { BaseButton, BaseInput, BaseSelect, ExportRangeMenu },
  data() {
    return {
      rows: [], total: 0, summary: {}, meta: {}, loading: false, error: "", selected: null,
      viewMode: "table",
      stationId: "", alarmType: "", severity: "", searchTerm: "", page: 1, pageSize: 20,
      from: dateInput(Date.now() - (7 * DAY)), to: dateInput(Date.now()),
      exportRange: "30d", exportLoading: false, exportError: "",
      fetchedStations: [],
      alarmTypes: [],
      severityOptions: [{ value: "", label: "All" }, { value: "critical", label: "Critical" }, { value: "warning", label: "Warning" }]
    };
  },
  computed: {
    stations() {
      const dynamic = tableSiteOptions.filter((s) => s.value).map((s) => ({ value: s.value, label: s.label }));
      const synced = stationsSync().map((id) => ({ value: id, label: formatStationDisplayLabel(id) }));
      const fetched = (this.fetchedStations || []).map((id) => ({ value: id, label: formatStationDisplayLabel(id) }));
      const map = new Map();
      [...synced, ...dynamic, ...fetched].forEach((item) => {
        if (item.value) map.set(item.value, item.label || item.value);
      });
      return Array.from(map.entries())
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    pageCount() { return Math.max(1, Math.ceil(this.total / this.pageSize)); },
    statCards() {
      return [
        { label: "Total alarms", value: this.summary.total || 0, note: "Matching events", tone: "neutral" },
        { label: "Critical", value: this.summary.critical || 0, note: "Immediate review", tone: "critical" },
        { label: "Bypass candidates", value: this.summary.bypassCandidates || 0, note: "Correlated signals", tone: "bypass" },
        { label: "Affected meters", value: this.summary.affectedMeters || 0, note: "Unique meters", tone: "meters" },
        { label: "Affected stations", value: this.summary.affectedStations || 0, note: "Operational sites", tone: "stations" }
      ];
    }
  },
  mounted() {
    loadDynamicStationOptions(undefined, true).catch(() => null);
    if (typeof window !== "undefined" && window.location && window.location.hash.includes("?")) {
      const params = new URLSearchParams(window.location.hash.split("?")[1]);
      const initialTerm = params.get("q") || params.get("search") || params.get("searchTerm") || "";
      if (initialTerm) this.searchTerm = initialTerm;
      if (params.get("alarm")) this.alarmType = params.get("alarm");
    }
    fetchStations()
      .then((stations) => { if (stations.length) this.fetchedStations = stations; })
      .catch(() => { /* registry unreachable — keep the seeded list */ });
    this.load();
  },
  methods: {
    requestBody(overrides = {}) {
      return { stationId: this.stationId, alarm: this.alarmType, severity: this.severity, searchTerm: this.searchTerm, from: new Date(`${this.from}T00:00:00`).toISOString(), to: new Date(`${this.to}T23:59:59.999`).toISOString(), offset: (this.page - 1) * this.pageSize, pageLimit: this.pageSize, sortBy: "currentDate", sortDirection: "desc", ...overrides };
    },
    async request(body) {
      const response = await fetch("/api/local/abnormal-alarms", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.reason || payload.msg || "Alarm request failed.");
      if (payload.data?.rows) return payload.data;
      if (payload.result?.rows) return payload.result;
      return payload;
    },
    async load() {
      this.loading = true; this.error = "";
      try {
        const payload = await this.request(this.requestBody());
        this.rows = payload.rows || payload.data || payload.result?.data || [];
        this.total = Number(payload.total || payload.result?.total || 0);
        this.summary = payload.summary || {};
        this.meta = payload.meta || {};
        if (this.meta.alarmTypes?.length) this.alarmTypes = this.meta.alarmTypes;
      } catch (error) {
        this.rows = []; this.total = 0; this.summary = {}; this.error = error.message || "Alarm request failed.";
      } finally { this.loading = false; }
    },
    applyFilters() { this.page = 1; this.load(); },
    setSeverity(value) { this.severity = value; this.applyFilters(); },
    setViewMode(value) { this.viewMode = value; },
    resetFilters() { this.stationId = ""; this.alarmType = ""; this.severity = ""; this.searchTerm = ""; this.from = dateInput(Date.now() - (7 * DAY)); this.to = dateInput(Date.now()); this.applyFilters(); },
    goPage(page) { this.page = Math.max(1, Math.min(this.pageCount, page)); this.load(); },
    exportDates() { const to = new Date(); const from = new Date(to); if (this.exportRange === "all") from.setTime(0); else if (this.exportRange === "1d") from.setDate(from.getDate() - 1); else if (this.exportRange === "7d") from.setDate(from.getDate() - 7); else if (this.exportRange === "30d") from.setDate(from.getDate() - 30); else from.setFullYear(from.getFullYear() - 1); return { from: from.toISOString(), to: to.toISOString() }; },
    async downloadExport() {
      this.exportLoading = true; this.exportError = "";
      try {
        const dates = this.exportDates(); const all = []; let offset = 0; let total = 0;
        do { const payload = await this.request(this.requestBody({ ...dates, offset, pageLimit: 1000 })); const batch = payload.rows || payload.data || payload.result?.data || []; all.push(...batch); total = Number(payload.total || payload.result?.total || 0); offset += batch.length; if (!batch.length) break; } while (offset < total);
        const keys = ["severity", "alarmLabel", "category", "bypassRisk", "meterId", "customerId", "customerName", "stationId", "gatewayId", "power", "intervalDemand", "usage1", "remain1", "currentDate", "recommendedAction"];
        const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
        const csv = [keys.join(","), ...all.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\r\n");
        downloadTextFile(`abnormal_alarms_${this.exportRange}.csv`, csv, "text/csv;charset=utf-8"); this.$refs.exportMenu?.close();
      } catch (error) { this.exportError = error.message || "Export failed."; } finally { this.exportLoading = false; }
    },
    rowKey(row) { return `${row.meterId}-${row.alarmKey}-${row.currentDate || row.updateDate}`; },
    formatNumber(value) { return new Intl.NumberFormat("en-NG").format(Number(value) || 0); },
    formatDate(value) { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date); },
    riskLabel(value) { return value === "high" ? "High bypass risk" : value === "medium" ? "Review tamper" : "Standard review"; },
    valueOrDash(value) { return value === undefined || value === null || value === "" ? "-" : value; },
    joinedValues(...values) { return values.map(this.valueOrDash).join(" / "); }
  }
};
</script>

<style scoped>
.alarm-page {
  display: grid;
  gap: clamp(14px, 2.2vw, 24px);
  width: min(100%, 1500px);
  margin-inline: auto;
  padding: 0;
  color: var(--text-main);
  box-sizing: border-box;
}

.alarm-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.alarm-heading h1 {
  margin: 2px 0 4px;
  color: var(--text-strong);
  font-size: clamp(24px, 4.5vw, 42px);
  line-height: 1.1;
  letter-spacing: -0.01em;
}

.alarm-heading p {
  margin: 0;
  color: var(--text-muted);
  font-size: clamp(13px, 2vw, 15px);
}

.alarm-kicker {
  color: var(--primary) !important;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.alarm-heading-actions,
.alarm-filter-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.alarm-notice {
  display: flex;
  align-items: flex-start;
  gap: 10px 14px;
  padding: 12px 16px;
  border: 1px solid;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.45;
}

.alarm-notice strong {
  white-space: nowrap;
}

.alarm-notice.warning {
  border-color: color-mix(in srgb, var(--warning) 45%, var(--border-color));
  background: color-mix(in srgb, var(--warning) 10%, var(--bg-card));
}

.alarm-notice.danger,
.alarm-state.danger {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 45%, var(--border-color));
  background: color-mix(in srgb, var(--danger) 8%, var(--bg-card));
}

.alarm-filters {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) minmax(140px, 1fr) minmax(180px, 1.4fr) auto minmax(130px, 0.9fr) minmax(130px, 0.9fr) auto;
  align-items: end;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}

.alarm-filters label,
.alarm-severity {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.alarm-filters label > span,
.alarm-severity > span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.alarm-segments {
  display: flex;
  min-height: 42px;
  padding: 3px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-page);
  gap: 2px;
}

.alarm-segments button {
  flex: 1;
  min-width: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 0 8px;
  transition: background 0.15s ease, color 0.15s ease;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.alarm-segments button.active {
  background: var(--primary);
  color: var(--text-inverse);
}

.alarm-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.alarm-stat {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-top: 3px solid var(--text-muted);
  border-radius: 8px;
  background: var(--bg-card);
  transition: transform 0.18s ease, border-color 0.18s ease;
}

.alarm-stat:hover {
  border-color: color-mix(in srgb, var(--primary) 35%, var(--border-color));
}

.alarm-stat span,
.alarm-stat small {
  display: block;
  color: var(--text-muted);
}

.alarm-stat span {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.alarm-stat strong {
  display: block;
  margin: 8px 0 4px;
  color: var(--text-strong);
  font-size: clamp(22px, 2.5vw, 32px);
  line-height: 1;
}

.alarm-stat small {
  font-size: 11px;
}

.alarm-stat.critical,
.alarm-stat.bypass {
  border-top-color: var(--danger);
}

.alarm-stat.meters {
  border-top-color: var(--primary);
}

.alarm-stat.stations {
  border-top-color: var(--warning);
}

.alarm-ledger {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  overflow: visible;
}

.alarm-ledger-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.alarm-ledger h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: clamp(17px, 2vw, 20px);
}

.alarm-ledger p {
  margin: 3px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.alarm-source {
  display: grid;
  justify-items: end;
  font-size: 12px;
}

.alarm-source span {
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.alarm-source strong {
  color: var(--text-strong);
}

.alarm-ledger-tools {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.alarm-view-switch {
  display: flex;
  min-height: 40px;
  padding: 3px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-page);
  gap: 2px;
}

.alarm-view-switch button {
  min-width: 40px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.alarm-view-icon {
  width: 18px;
  height: 18px;
}

.alarm-view-switch button.active {
  background: var(--primary);
  color: var(--text-inverse);
}

.alarm-table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  position: relative;
}

.alarm-table-wrap::-webkit-scrollbar {
  height: 6px;
}

.alarm-table-wrap::-webkit-scrollbar-track {
  background: var(--bg-page);
}

.alarm-table-wrap::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.alarm-table {
  width: 100%;
  min-width: 950px;
  border-collapse: collapse;
}

.alarm-table th,
.alarm-table td {
  padding: 13px 16px;
  border-bottom: 1px solid var(--border-color);
  text-align: left;
  vertical-align: middle;
}

.alarm-table th {
  color: var(--text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 800;
}

.alarm-table td {
  font-size: 13px;
}

.alarm-table td small {
  display: block;
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 11px;
}

.alarm-pill,
.alarm-risk {
  display: inline-flex;
  align-items: center;
  width: max-content;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.alarm-pill {
  padding: 5px 9px;
}

.alarm-pill.critical {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 14%, transparent);
}

.alarm-pill.warning {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 14%, transparent);
}

.alarm-risk {
  color: var(--text-muted);
}

.alarm-risk.high,
.alarm-assessment strong.high {
  color: var(--danger);
}

.alarm-risk.medium,
.alarm-assessment strong.medium {
  color: var(--warning);
}

.alarm-mono {
  font-family: var(--font-mono, monospace);
  letter-spacing: -0.02em;
}

.alarm-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-top: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.alarm-pagination div {
  display: flex;
  gap: 8px;
}

.alarm-state {
  display: grid;
  justify-items: start;
  gap: 8px;
  padding: 40px 20px;
  color: var(--text-muted);
}

.alarm-state strong {
  color: var(--text-strong);
  font-size: 18px;
}

.alarm-loading {
  display: grid;
  gap: 12px;
  padding: 20px;
}

.alarm-loading span {
  height: 48px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--primary) 9%, var(--bg-page));
  animation: alarm-pulse 1.3s ease-in-out infinite alternate;
}

.alarm-card-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 16px;
}

.alarm-card {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--primary);
  border-radius: 8px;
  background: var(--bg-page);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.alarm-card:hover {
  border-color: color-mix(in srgb, var(--primary) 30%, var(--border-color));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.alarm-card > header,
.alarm-card > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.alarm-card > header > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.alarm-card h3 {
  margin: 4px 0 0;
  color: var(--text-strong);
  font-size: 15px;
  word-break: break-word;
}

.alarm-card dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 14px;
  margin: 16px 0;
}

.alarm-card dl div {
  min-width: 0;
}

.alarm-card dt {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.alarm-card dd {
  overflow-wrap: anywhere;
  word-break: break-word;
  margin: 3px 0 0;
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 700;
}

.alarm-card > footer {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 12px;
}

.alarm-detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 1500);
  display: flex;
  justify-content: flex-end;
  background: color-mix(in srgb, #000 56%, transparent);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}

.alarm-detail {
  width: min(480px, 100vw);
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 24px;
  background: var(--bg-card);
  box-shadow: var(--shadow-xl);
  box-sizing: border-box;
}

.alarm-detail > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: -24px;
  background: var(--bg-card);
  z-index: 10;
  margin: -24px -24px 0 -24px;
  padding: 24px 24px 18px 24px;
}

.alarm-detail h2 {
  margin: 6px 0 0;
  color: var(--text-strong);
  font-size: 18px;
  word-break: break-word;
}

.alarm-detail header button {
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-page);
  color: var(--text-main);
  font-size: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease;
}

.alarm-detail header button:hover {
  background: var(--border-color);
}

.alarm-detail > p {
  color: var(--text-muted);
  line-height: 1.55;
  margin-top: 16px;
}

.alarm-detail section {
  padding: 18px 0;
  border-top: 1px solid var(--border-color);
}

.alarm-detail h3 {
  margin: 0 0 13px;
  color: var(--text-strong);
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.alarm-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin: 0;
}

.alarm-detail-grid div {
  min-width: 0;
}

.alarm-detail dt {
  color: var(--text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.alarm-detail dd {
  overflow-wrap: anywhere;
  word-break: break-word;
  margin: 4px 0 0;
  color: var(--text-strong);
  font-weight: 700;
}

.alarm-assessment div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.alarm-assessment p {
  color: var(--text-main);
}

.alarm-assessment small {
  color: var(--text-muted);
}

@keyframes alarm-pulse {
  to { opacity: 0.45; }
}

/* Breakpoint 1: Laptops & Medium Screens (1024px - 1280px) */
@media (max-width: 1280px) {
  .alarm-filters {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .alarm-search {
    grid-column: span 2;
  }
  .alarm-filter-actions {
    grid-column: span 2;
    justify-self: end;
  }
}

/* Breakpoint 2: Tablets (768px - 1023px) */
@media (max-width: 1023px) {
  .alarm-filters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .alarm-search {
    grid-column: 1 / -1;
  }
  .alarm-severity {
    grid-column: 1 / -1;
  }
  .alarm-filter-actions {
    grid-column: 1 / -1;
    justify-self: stretch;
  }
  .alarm-filter-actions > * {
    flex: 1;
  }
  .alarm-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .alarm-card-list {
    grid-template-columns: 1fr;
  }
}

/* Breakpoint 3: Small Tablets & Mobile Landscape (481px - 767px) */
@media (max-width: 767px) {
  .alarm-page {
    gap: 16px;
  }
  .alarm-heading {
    align-items: flex-start;
  }
  .alarm-heading-actions {
    flex-direction: row;
    align-items: stretch;
    width: 100%;
  }
  .alarm-heading-actions > * {
    flex: 1;
  }
  .alarm-notice {
    flex-direction: column;
    gap: 4px;
  }
  .alarm-notice strong {
    white-space: normal;
  }
  .alarm-filters {
    grid-template-columns: 1fr 1fr;
    padding: 14px;
  }
  .alarm-stats {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .alarm-stat {
    padding: 14px;
  }
  .alarm-stat:last-child {
    grid-column: 1 / -1;
  }
  .alarm-ledger-head {
    align-items: flex-start;
    padding: 16px;
  }
  .alarm-ledger-tools {
    align-items: flex-start;
    flex-direction: column-reverse;
    width: 100%;
  }
  .alarm-view-switch {
    width: 100%;
  }
  .alarm-view-switch button {
    flex: 1;
  }
  .alarm-source {
    justify-items: start;
  }
  .alarm-card-list {
    grid-template-columns: 1fr;
    padding: 14px;
  }
  .alarm-table {
    min-width: 850px;
  }
  .alarm-table th,
  .alarm-table td {
    padding: 10px 12px;
  }
  .alarm-detail-backdrop {
    align-items: flex-end;
  }
  .alarm-detail {
    width: 100vw;
    height: 90vh;
    max-height: 90vh;
    border-radius: 16px 16px 0 0;
    padding: 20px;
    padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  }
  .alarm-detail > header {
    top: -20px;
    margin: -20px -20px 0 -20px;
    padding: 20px 20px 16px 20px;
    border-radius: 16px 16px 0 0;
  }
}

/* Breakpoint 4: Mobile Portrait & Small Phones (<= 480px) */
@media (max-width: 480px) {
  .alarm-heading {
    display: grid;
    gap: 12px;
  }
  .alarm-heading-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
  }
  .alarm-filters {
    grid-template-columns: 1fr;
    padding: 12px;
    gap: 10px;
  }
  .alarm-search,
  .alarm-severity,
  .alarm-filter-actions {
    grid-column: auto;
  }
  .alarm-filter-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .alarm-filter-actions > button {
    min-height: 44px;
  }
  .alarm-segments {
    min-height: 44px;
  }
  .alarm-segments button {
    min-height: 38px;
    font-size: 11px;
  }
  .alarm-stats {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .alarm-stat {
    padding: 12px;
  }
  .alarm-stat span {
    font-size: 10px;
  }
  .alarm-stat strong {
    font-size: 20px;
  }
  .alarm-ledger-head {
    display: grid;
    gap: 12px;
    padding: 14px;
  }
  .alarm-ledger-tools {
    width: 100%;
  }
  .alarm-card-list {
    padding: 12px;
    gap: 10px;
  }
  .alarm-card {
    padding: 14px;
  }
  .alarm-card dl {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 12px 0;
  }
  .alarm-card dl dt {
    font-size: 9px;
  }
  .alarm-card dl dd {
    font-size: 12px;
  }
  .alarm-card > footer {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .alarm-card > footer > button {
    width: 100%;
    min-height: 40px;
  }
  .alarm-pagination {
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
  }
  .alarm-pagination div {
    width: 100%;
  }
  .alarm-pagination div > button {
    flex: 1;
    min-height: 42px;
  }
  .alarm-detail-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}
</style>
