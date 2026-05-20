<template>
  <div class="insight-dash">
    <!-- Hero / Header -->
    <header class="insight-hero">
      <div class="insight-hero-bg"></div>
      <div class="insight-hero-content">
        <div class="insight-title-group">
          <div class="insight-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div>
            <h1>Energy Intelligence Matrix</h1>
            <p>Comprehensive aggregated consumption data across all network endpoints.</p>
          </div>
        </div>
        <div class="insight-actions">
          <BaseButton variant="secondary" @click="fetchData" :disabled="loading">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon" :class="{ 'spin': loading }">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {{ loading ? 'Synchronizing...' : 'Refresh Matrix' }}
          </BaseButton>
          <BaseButton variant="primary" @click="exportData" :disabled="loading || !allRows.length">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Dataset
          </BaseButton>
        </div>
      </div>
    </header>

    <!-- Range Selector -->
    <section class="insight-filters">
      <div class="insight-pills">
        <BaseButton
          v-for="range in RANGES"
          :key="range.key"
          :variant="activeRange === range.key ? 'primary' : 'secondary'"
          class="insight-pill"
          @click="setRange(range.key)"
        >
          {{ range.label }}
        </BaseButton>
      </div>
      <div class="insight-date-display">
        <span class="date-label">Reporting Period:</span>
        <span class="date-value">{{ formatDate(dateFrom) }} &mdash; {{ formatDate(dateTo) }}</span>
      </div>
    </section>

    <!-- Global KPIs -->
    <section class="insight-kpis">
      <div class="kpi-card glass">
        <div class="kpi-icon total"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
        <div class="kpi-info">
          <span class="kpi-label">Total Network Consumption</span>
          <strong class="kpi-val">{{ formatNumber(globalTotal) }} <small>kWh</small></strong>
        </div>
      </div>
      <div class="kpi-card glass">
        <div class="kpi-icon peak"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="kpi-info">
          <span class="kpi-label">Highest Consuming Station</span>
          <strong class="kpi-val">{{ peakStation.name || 'N/A' }} <small v-if="peakStation.val">{{ formatNumber(peakStation.val) }} kWh</small></strong>
        </div>
      </div>
      <div class="kpi-card glass">
        <div class="kpi-icon meter"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        <div class="kpi-info">
          <span class="kpi-label">Active Meters Found</span>
          <strong class="kpi-val">{{ activeMetersCount }}</strong>
        </div>
      </div>
    </section>

    <!-- Content Area: Stations & Meters -->
    <div class="insight-content" v-if="!loading && allRows.length">
      
      <!-- Stations Grid -->
      <div class="insight-section-title">
        <h2>Station Performance Breakdown</h2>
      </div>
      <div class="station-grid">
        <div 
          v-for="st in stationTotals" 
          :key="st.id" 
          class="station-card glass"
          :class="{ 'station-active': selectedStation === st.id }"
          @click="selectedStation = (selectedStation === st.id ? null : st.id)"
          :style="{ '--st-color': st.color }"
        >
          <div class="st-color-bar"></div>
          <div class="st-header">
            <h3>{{ st.label }}</h3>
            <span class="st-percent">{{ getPercent(st.total, globalTotal) }}%</span>
          </div>
          <div class="st-total">
            {{ formatNumber(st.total) }} <span>kWh</span>
          </div>
          <div class="st-bar-wrap">
            <div class="st-bar-fill" :style="{ width: getPercent(st.total, globalTotal) + '%' }"></div>
          </div>
        </div>
      </div>

      <!-- Meters Breakdown Table -->
      <div class="insight-section-title mt-4">
        <h2>{{ selectedStation ? `Meters at ${getStationLabel(selectedStation)}` : 'Top Meters Across Network' }}</h2>
        <span class="title-meta">{{ filteredMeters.length }} meters</span>
      </div>
      
      <div class="meters-table-wrap glass">
        <table class="meters-table">
          <thead>
            <tr>
              <th class="col-id">Meter ID</th>
              <th class="col-st">Station</th>
              <th class="col-num">Consumption (kWh)</th>
              <th class="col-share">Share</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredMeters.length === 0">
              <td colspan="4" class="empty-state">No meters found for this selection.</td>
            </tr>
            <tr v-for="m in filteredMeters" :key="m.meterId">
              <td class="col-id">
                <span class="meter-dot" :style="{ background: getStationColor(m.stationId) }"></span>
                {{ m.meterId }}
              </td>
              <td class="col-st">{{ getStationLabel(m.stationId) }}</td>
              <td class="col-num"><strong>{{ formatNumber(m.total) }}</strong></td>
              <td class="col-share">
                <div class="share-cell">
                  <div class="mini-bar">
                    <div class="mini-bar-fill" :style="{ width: getPercent(m.total, selectedStation ? getStationTotal(selectedStation) : globalTotal) + '%', background: getStationColor(m.stationId) }"></div>
                  </div>
                  <span>{{ getPercent(m.total, selectedStation ? getStationTotal(selectedStation) : globalTotal) }}%</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
    
    <!-- Empty / Loading State -->
    <div v-else-if="loading" class="insight-loading glass">
      <div class="spinner"></div>
      <h3>Extracting Data Matrix...</h3>
      <p>Gathering intelligence across all nodes. This may take a moment.</p>
    </div>
    <div v-else class="insight-loading glass">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
      </div>
      <h3>No Data Available</h3>
      <p>There is no consumption recorded for the selected period.</p>
    </div>
  </div>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import { fetchConsumptionStatistics } from "../services/consumption-statistics-service.mjs";
import { downloadTextFile } from "../services/import-export.mjs";

const STATION_LIST = [
  { id: "TUNGA",   label: "Tunga",   color: "#40c9c6" },
  { id: "UMAISHA", label: "Umaisha", color: "#10b981" },
  { id: "OGUFA",   label: "Ogufa",   color: "#f4516c" },
  { id: "KYAKALE", label: "Kyakale", color: "#34bfa3" },
  { id: "MUSHA",   label: "Musha",   color: "#ffb822" }
];

const RANGES = [
  { key: "daily", label: "Today" },
  { key: "weekly", label: "Last 7 Days" },
  { key: "monthly", label: "This Month" },
  { key: "yearly", label: "This Year" },
  { key: "allTime", label: "All Time" },
];

export default {
  name: "LiveProbingPage",
  components: { BaseButton },
  data() {
    return {
      RANGES,
      activeRange: "monthly",
      loading: false,
      allRows: [], // raw rows from fetchConsumptionStatistics
      dateFrom: "",
      dateTo: "",
      selectedStation: null,
    };
  },
  computed: {
    // Aggregations
    stationTotals() {
      const map = {};
      STATION_LIST.forEach(s => map[s.id] = { ...s, total: 0 });
      this.allRows.forEach(r => {
        if (map[r.stationId]) map[r.stationId].total += (Number(r.consumption) || 0);
      });
      return Object.values(map).sort((a,b) => b.total - a.total);
    },
    globalTotal() {
      return this.stationTotals.reduce((sum, st) => sum + st.total, 0);
    },
    peakStation() {
      if (!this.stationTotals.length) return {};
      const peak = this.stationTotals[0];
      return { name: peak.label, val: peak.total };
    },
    meterTotals() {
      const map = {};
      this.allRows.forEach(r => {
        const mid = r.meterId || 'Unknown';
        if (!map[mid]) map[mid] = { meterId: mid, stationId: r.stationId, total: 0 };
        map[mid].total += (Number(r.consumption) || 0);
      });
      return Object.values(map).sort((a,b) => b.total - a.total);
    },
    activeMetersCount() {
      return this.meterTotals.filter(m => m.total > 0).length;
    },
    filteredMeters() {
      let list = this.meterTotals;
      if (this.selectedStation) {
        list = list.filter(m => m.stationId === this.selectedStation);
      }
      return list;
    }
  },
  mounted() {
    this.setRange("monthly");
  },
  methods: {
    formatNumber(num) {
      return Number(num || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
    },
    formatDate(dStr) {
      if (!dStr) return "";
      const d = new Date(dStr);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    },
    getPercent(val, total) {
      if (!total) return 0;
      return ((val / total) * 100).toFixed(1);
    },
    getStationLabel(id) {
      return STATION_LIST.find(s => s.id === id)?.label || id;
    },
    getStationColor(id) {
      return STATION_LIST.find(s => s.id === id)?.color || "#ffffff";
    },
    getStationTotal(id) {
      return this.stationTotals.find(s => s.id === id)?.total || 0;
    },
    pad(n) { return String(n).padStart(2, "0"); },
    calculateDates(rangeKey) {
      const now = new Date();
      const endStr = `${now.getFullYear()}-${this.pad(now.getMonth() + 1)}-${this.pad(now.getDate())}`;
      let startStr = endStr;

      if (rangeKey === "daily") {
        // Today
      } else if (rangeKey === "weekly") {
        const start = new Date(); start.setDate(start.getDate() - 7);
        startStr = `${start.getFullYear()}-${this.pad(start.getMonth() + 1)}-${this.pad(start.getDate())}`;
      } else if (rangeKey === "monthly") {
        startStr = `${now.getFullYear()}-${this.pad(now.getMonth() + 1)}-01`;
      } else if (rangeKey === "yearly") {
        startStr = `${now.getFullYear()}-01-01`;
      } else if (rangeKey === "allTime") {
        startStr = `2020-01-01`;
      }
      return { startStr, endStr };
    },
    async setRange(key) {
      this.activeRange = key;
      const { startStr, endStr } = this.calculateDates(key);
      this.dateFrom = startStr;
      this.dateTo = endStr;
      this.selectedStation = null;
      await this.fetchData();
    },
    async fetchData() {
      this.loading = true;
      this.allRows = [];
      try {
        const promises = STATION_LIST.map(st => 
          fetchConsumptionStatistics({
            stationId: st.id,
            dateFrom: this.dateFrom,
            dateTo: this.dateTo,
            granularity: "daily"
          }, { pageSize: 50000 })
        );
        const results = await Promise.all(promises);
        results.forEach(res => {
          if (res && res.rows) {
            this.allRows.push(...res.rows);
          }
        });
      } catch (err) {
        console.error("Failed to fetch consumption data:", err);
        alert("An error occurred while fetching data.");
      } finally {
        this.loading = false;
      }
    },
    exportData() {
      if (!this.allRows.length) return;
      
      const csvRows = [];
      // Header
      csvRows.push(["Period", "Station", "Meter ID", "Total Consumption (kWh)"]);
      
      // Period string
      const periodStr = `${this.activeRange.toUpperCase()} (${this.dateFrom} to ${this.dateTo})`;
      
      // We will export the breakdown by Meter, since it's the most granular
      this.meterTotals.forEach(m => {
        csvRows.push([
          periodStr,
          this.getStationLabel(m.stationId),
          m.meterId,
          Number(m.total).toFixed(3)
        ]);
      });
      
      // Add Station Summaries at the bottom
      csvRows.push([]);
      csvRows.push(["--- STATION SUMMARIES ---"]);
      this.stationTotals.forEach(s => {
        csvRows.push([periodStr, s.label, "ALL METERS", Number(s.total).toFixed(3)]);
      });

      // Global Total
      csvRows.push([]);
      csvRows.push(["--- GLOBAL TOTAL ---"]);
      csvRows.push([periodStr, "ALL STATIONS", "ALL METERS", Number(this.globalTotal).toFixed(3)]);

      const csvContent = csvRows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
      
      downloadTextFile(csvContent, `Energy_Intelligence_${this.activeRange}_${this.dateTo}.csv`, "text/csv");
    }
  }
};
</script>

<style scoped>
/* 
 * AESTHETIC & PREMIUM DESIGN
 * Using Dark Mode by default for a high-tech "Intelligence Matrix" feel.
 * Glassmorphism, deep gradients, subtle animations.
 */
.insight-dash {
  min-height: 100vh;
  background-color: #0b0f19;
  color: #e2e8f0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  padding-bottom: 4rem;
}

.glass {
  background: rgba(30, 41, 59, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  border-radius: 16px;
}

/* Header */
.insight-hero {
  position: relative;
  padding: 3rem 2rem;
  overflow: hidden;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.insight-hero-bg {
  position: absolute;
  top: -50%; left: -10%; right: -10%; bottom: -50%;
  background: radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.15) 0%, transparent 60%),
              radial-gradient(circle at 80% 50%, rgba(16, 185, 129, 0.1) 0%, transparent 50%);
  z-index: 0;
  pointer-events: none;
}

.insight-hero-content {
  position: relative;
  z-index: 1;
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 2rem;
}

.insight-title-group {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.insight-icon {
  width: 56px; height: 56px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
}

.insight-icon svg {
  width: 28px; height: 28px;
}

.insight-title-group h1 {
  margin: 0 0 0.25rem 0;
  font-size: 2.2rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  background: linear-gradient(to right, #ffffff, #a5b4fc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.insight-title-group p {
  margin: 0;
  color: #94a3b8;
  font-size: 1.05rem;
}

.insight-actions {
  display: flex;
  gap: 1rem;
}

.btn-icon {
  width: 18px; height: 18px; margin-right: 8px;
  display: inline-block; vertical-align: middle;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin { 100% { transform: rotate(360deg); } }

/* Filters */
.insight-filters {
  max-width: 1400px; margin: -1.5rem auto 2rem auto;
  position: relative; z-index: 10;
  display: flex; justify-content: space-between; align-items: center;
  padding: 1rem 2rem;
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 100px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.4);
  width: calc(100% - 4rem);
}

.insight-pills {
  display: flex; gap: 0.5rem;
}

.insight-pill {
  border-radius: 100px !important;
  padding: 0.5rem 1.25rem !important;
  font-weight: 600 !important;
  transition: all 0.3s ease !important;
}

.date-display {
  display: flex; align-items: center; gap: 0.75rem;
}
.date-label { color: #64748b; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
.date-value { color: #f8fafc; font-weight: 600; background: rgba(255,255,255,0.05); padding: 0.25rem 1rem; border-radius: 100px; }

/* KPIs */
.insight-kpis {
  max-width: 1400px; margin: 0 auto 2rem auto;
  display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;
  padding: 0 2rem;
}

.kpi-card {
  padding: 1.25rem;
  display: flex; align-items: center; gap: 1.25rem;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(0,0,0,0.3);
}

.kpi-icon {
  width: 44px; height: 44px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; color: #fff;
}
.kpi-icon svg { width: 22px; height: 22px; }
.kpi-icon.total { background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 0 15px rgba(16,185,129,0.3); }
.kpi-icon.peak { background: linear-gradient(135deg, #f43f5e, #e11d48); box-shadow: 0 0 15px rgba(244,63,94,0.3); }
.kpi-icon.meter { background: linear-gradient(135deg, #3b82f6, #2563eb); box-shadow: 0 0 15px rgba(59,130,246,0.3); }

.kpi-info { display: flex; flex-direction: column; gap: 0.15rem; }
.kpi-label { color: #94a3b8; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
.kpi-val { font-size: 1.5rem; font-weight: 800; color: #f8fafc; }
.kpi-val small { font-size: 0.9rem; color: #cbd5e1; font-weight: 600; }

/* Content Area */
.insight-content {
  max-width: 1400px; margin: 0 auto; padding: 0 2rem;
}

.insight-section-title {
  display: flex; align-items: baseline; gap: 1rem;
  margin-bottom: 1rem;
}
.insight-section-title h2 {
  font-size: 1.35rem; font-weight: 700; color: #f8fafc; margin: 0;
}
.title-meta {
  color: #64748b; font-weight: 600; font-size: 0.9rem;
}
.mt-4 { margin-top: 2.5rem; }

/* Stations Grid */
.station-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;
}
.station-card {
  position: relative; padding: 1.25rem; overflow: hidden; cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(255,255,255,0.05);
}
.station-card:hover {
  transform: translateY(-2px);
  border-color: var(--st-color);
  box-shadow: 0 8px 25px rgba(0,0,0,0.3), inset 0 0 15px rgba(255,255,255,0.02);
}
.station-active {
  border-color: var(--st-color);
  background: rgba(30, 41, 59, 0.8);
  box-shadow: 0 0 0 2px var(--st-color), 0 8px 30px rgba(0,0,0,0.4);
}

.st-color-bar {
  position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: var(--st-color);
}
.st-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;
}
.st-header h3 { margin: 0; font-size: 1rem; color: #e2e8f0; font-weight: 700; }
.st-percent { font-size: 0.8rem; color: var(--st-color); font-weight: 700; background: rgba(255,255,255,0.05); padding: 0.15rem 0.4rem; border-radius: 4px; }
.st-total { font-size: 1.4rem; font-weight: 800; color: #fff; margin-bottom: 0.75rem; }
.st-total span { font-size: 0.85rem; font-weight: 600; color: #94a3b8; }

.st-bar-wrap {
  height: 5px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden;
}
.st-bar-fill {
  height: 100%; background: var(--st-color); border-radius: 3px;
  transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Meters Table (Compact) */
.meters-table-wrap {
  overflow: auto;
  max-height: 450px;
  border-radius: 12px;
}
.meters-table-wrap::-webkit-scrollbar { width: 6px; height: 6px; }
.meters-table-wrap::-webkit-scrollbar-track { background: transparent; }
.meters-table-wrap::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }

.meters-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.meters-table th {
  position: sticky; top: 0;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(8px);
  color: #94a3b8;
  font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  z-index: 2;
}
.meters-table td {
  padding: 0.6rem 1rem;
  font-size: 0.9rem; color: #cbd5e1;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.meters-table tbody tr {
  transition: background 0.15s;
}
.meters-table tbody tr:hover {
  background: rgba(255,255,255,0.03);
}

.col-id { font-family: monospace; font-size: 0.95rem; color: #fff; width: 25%; }
.col-st { width: 25%; }
.col-num { text-align: right; width: 25%; color: #fff; font-size: 1rem; }
.col-share { text-align: right; width: 25%; }

.meter-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 8px currentColor; margin-right: 0.5rem; vertical-align: middle; }

.share-cell { display: flex; align-items: center; justify-content: flex-end; gap: 0.75rem; }
.mini-bar { width: 60px; height: 5px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden; }
.mini-bar-fill { height: 100%; border-radius: 3px; transition: width 1s ease; }

.empty-state { padding: 2rem !important; text-align: center !important; color: #64748b; font-style: italic; }

/* Loading & Empty Global */
.insight-loading {
  max-width: 600px; margin: 3rem auto; padding: 3rem 2rem;
  text-align: center; display: flex; flex-direction: column; align-items: center; gap: 1rem;
}
.insight-loading h3 { margin: 0; font-size: 1.3rem; color: #f8fafc; }
.insight-loading p { margin: 0; color: #94a3b8; font-size: 0.95rem; }
.spinner { width: 40px; height: 40px; border: 3px solid rgba(99, 102, 241, 0.2); border-top-color: #6366f1; border-radius: 50%; animation: spin 1s linear infinite; }
.empty-icon { width: 56px; height: 56px; background: rgba(255,255,255,0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #64748b; }
.empty-icon svg { width: 28px; height: 28px; }

/* Responsive */
@media (max-width: 1024px) {
  .insight-filters { flex-direction: column; gap: 1rem; border-radius: 12px; padding: 1.25rem; }
  .insight-pills { flex-wrap: wrap; justify-content: center; }
  .col-share { display: none; }
}
</style>
