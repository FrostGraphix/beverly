<template>
  <div class="ledger-card">
    <div class="ledger-header">
      <div class="ledger-title">
        <span>{{ title }}</span>
        <span v-if="!loading" class="ledger-count">{{ filtered.length }} accounts</span>
      </div>
      <div class="ledger-controls">
        <button v-if="!loading && filtered.length" class="ledger-export-btn" title="Export CSV" @click="exportCsv">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          CSV
        </button>
        <input v-model="search" class="ledger-search" placeholder="Search by name, meter, ID..." type="text" />
        <select v-model="riskFilter" class="ledger-select">
          <option value="">All Risk Tiers</option>
          <option value="CRITICAL">Critical (81-100)</option>
          <option value="HIGH">High (61-80)</option>
          <option value="MEDIUM">Medium (31-60)</option>
          <option value="LOW">Low (0-30)</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="ledger-loading">
      <div class="ledger-progress">
        <div class="ledger-progress-bar" :style="{ width: progressPct + '%' }"></div>
      </div>
      <div class="ledger-loading-msg">Analyzing {{ progressLabel || "stations" }}...</div>
      <div v-for="n in 6" :key="n" class="ledger-skeleton">
        <div class="skel-col skel-wide"></div>
        <div class="skel-col skel-mid"></div>
        <div class="skel-col skel-mid"></div>
        <div class="skel-col skel-narrow"></div>
        <div class="skel-col skel-narrow"></div>
        <div class="skel-col skel-badge"></div>
      </div>
    </div>

    <div v-else-if="!filtered.length" class="ledger-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>
      <span>No accounts match your filters</span>
    </div>

    <div v-else class="ledger-wrap">
      <table class="ledger-table">
        <thead>
          <tr>
            <th class="sortable" @click="sort('customerName')">Customer <span class="sort-arrow">{{ sortArrow('customerName') }}</span></th>
            <th class="sortable" @click="sort('stationId')">Station <span class="sort-arrow">{{ sortArrow('stationId') }}</span></th>
            <th class="sortable" @click="sort('totalConsumed')">Consumed (kWh) <span class="sort-arrow">{{ sortArrow('totalConsumed') }}</span></th>
            <th class="sortable" @click="sort('totalPaid')">Paid (N) <span class="sort-arrow">{{ sortArrow('totalPaid') }}</span></th>
            <th class="sortable" @click="sort('netGap')">Balance (N) <span class="sort-arrow">{{ sortArrow('netGap') }}</span></th>
            <th class="sortable" @click="sort('shortfallGap')">Shortfall (N) <span class="sort-arrow">{{ sortArrow('shortfallGap') }}</span></th>
            <th class="sortable" @click="sort('daysSinceRecharge')">Last Recharge <span class="sort-arrow">{{ sortArrow('daysSinceRecharge') }}</span></th>
            <th class="sortable" @click="sort('riskScore')">Risk <span class="sort-arrow">{{ sortArrow('riskScore') }}</span></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in paginated"
            :key="`${row.customerId}-${row.meterId}`"
            class="ledger-row"
            @click="$emit('select', row)"
          >
            <td>
              <div class="ledger-customer">
                <span class="ledger-name">{{ row.customerName }}</span>
                <span class="ledger-id">{{ row.customerId }}</span>
              </div>
            </td>
            <td><span class="station-badge">{{ row.stationId }}</span></td>
            <td>{{ formatNumber(row.totalConsumed, 1) }}</td>
            <td>{{ formatNumber(row.totalPaid, 0) }}</td>
            <td :class="row.netGap >= 0 ? 'text-danger' : 'text-success'">
              {{ row.netGap >= 0 ? '+' : '-' }}{{ formatNumber(Math.abs(row.netGap), 0) }}
            </td>
            <td :class="row.shortfallGap > 0 ? 'text-danger' : 'text-muted'">
              {{ formatNumber(row.shortfallGap, 0) }}
            </td>
            <td :class="row.daysSinceRecharge > 30 ? 'text-danger' : ''">
              {{ row.daysSinceRecharge != null ? row.daysSinceRecharge + 'd ago' : '-' }}
            </td>
            <td>
              <div class="risk-cell">
                <div class="risk-bar-bg">
                  <div class="risk-bar-fill" :class="row.riskTier.cls" :style="{ width: row.riskScore + '%' }"></div>
                </div>
                <span :class="['risk-badge', row.riskTier.cls]">{{ row.riskScore }}</span>
              </div>
            </td>
            <td>
              <button class="drill-btn" title="Inspect customer" @click.stop="$emit('select', row)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="ledger-pagination">
        <button class="page-btn" :disabled="page <= 1" @click="page--">‹</button>
        <span class="page-info">{{ page }} / {{ totalPages }}</span>
        <button class="page-btn" :disabled="page >= totalPages" @click="page++">›</button>
        <span class="page-size-label">{{ filtered.length }} total</span>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "SuspectLedger",
  props: {
    ledger: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    loadedCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 0 },
    progressLabel: { type: String, default: "" },
    title: { type: String, default: "Suspect Ledger" },
  },
  data() {
    return {
      search: "",
      riskFilter: "",
      sortKey: "riskScore",
      sortDir: -1,
      page: 1,
      pageSize: 20,
    };
  },
  computed: {
    progressPct() {
      if (!this.totalCount) return 0;
      return Math.round((this.loadedCount / this.totalCount) * 100);
    },
    filtered() {
      let rows = this.ledger;
      if (this.riskFilter) rows = rows.filter((row) => row.riskTier.label === this.riskFilter);
      if (this.search) {
        const query = this.search.toLowerCase();
        rows = rows.filter((row) =>
          String(row.customerName || "").toLowerCase().includes(query) ||
          String(row.customerId || "").toLowerCase().includes(query) ||
          String(row.meterId || "").toLowerCase().includes(query)
        );
      }
      return [...rows].sort((left, right) => {
        const leftValue = left[this.sortKey];
        const rightValue = right[this.sortKey];
        if (typeof leftValue === "string") return leftValue.localeCompare(rightValue) * this.sortDir;
        return ((leftValue ?? 0) - (rightValue ?? 0)) * this.sortDir;
      });
    },
    totalPages() {
      return Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
    },
    paginated() {
      const start = (this.page - 1) * this.pageSize;
      return this.filtered.slice(start, start + this.pageSize);
    },
  },
  watch: {
    search() { this.page = 1; },
    riskFilter() { this.page = 1; },
  },
  methods: {
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
    formatNumber(value, decimals) {
      return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: decimals });
    },
    exportCsv() {
      const headers = [
        "Customer",
        "ID",
        "Meter",
        "Station",
        "Tariff",
        "Consumed (kWh)",
        "Paid (N)",
        "Balance (N)",
        "Shortfall (N)",
        "Credit (N)",
        "Days Since Recharge",
        "Risk Score",
        "Tier",
        "Tokens Used",
        "Tokens Unused",
      ];
      const rows = this.filtered.map((row) => {
        const used = (row.recharges || []).filter((token) => token.vend).length;
        const unused = (row.recharges || []).length - used;
        return [
          row.customerName,
          row.customerId,
          row.meterId,
          row.stationId,
          row.tariffId,
          row.totalConsumed,
          row.totalPaid,
          row.netGap,
          row.shortfallGap,
          row.creditGap,
          row.daysSinceRecharge ?? "",
          row.riskScore,
          row.riskTier?.label || "",
          used,
          unused,
        ];
      });
      const csv = [headers, ...rows]
        .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `suspect_ledger_${new Date().toISOString().substring(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    },
  },
};
</script>

<style scoped>
.ledger-card { background: var(--bg-card); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); overflow: hidden; }
.ledger-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border-color); flex-wrap: wrap; gap: 10px; }
.ledger-title { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; color: var(--text-strong); }
.ledger-count { font-size: 11px; background: var(--primary-light); color: var(--primary); border-radius: 20px; padding: 2px 8px; font-weight: 600; }
.ledger-controls { display: flex; gap: 8px; align-items: center; }
.ledger-export-btn { height: 30px; padding: 0 10px; border-radius: var(--radius-md); border: 1px solid var(--border-color); background: var(--bg-main); font-size: 11px; font-family: var(--font-family); font-weight: 600; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; gap: 5px; transition: all 0.15s; }
.ledger-export-btn svg { width: 14px; height: 14px; }
.ledger-export-btn:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
.ledger-search { height: 30px; padding: 0 10px; border-radius: var(--radius-md); border: 1px solid var(--border-color); font-size: 12px; font-family: var(--font-family); background: var(--bg-main); color: var(--text-main); width: 200px; }
.ledger-select { height: 30px; padding: 0 8px; border-radius: var(--radius-md); border: 1px solid var(--border-color); font-size: 12px; font-family: var(--font-family); background: var(--bg-main); color: var(--text-main); cursor: pointer; }
.ledger-wrap { overflow-x: auto; }
.ledger-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ledger-table th { padding: 10px 12px; text-align: left; font-size: 11px; color: var(--text-muted); border-bottom: 1px solid var(--border-color); white-space: nowrap; background: var(--bg-main); }
.ledger-table td { padding: 10px 12px; border-bottom: 1px solid var(--border-color); color: var(--text-main); vertical-align: middle; }
.ledger-row { cursor: pointer; transition: background 0.12s; }
.ledger-row:hover { background: var(--primary-light); }
.sortable { cursor: pointer; user-select: none; }
.sortable:hover { color: var(--primary); }
.sort-arrow { font-size: 10px; color: var(--primary); }
.ledger-customer { display: flex; flex-direction: column; gap: 1px; }
.ledger-name { font-weight: 600; color: var(--text-strong); font-size: 12px; }
.ledger-id { font-size: 10px; color: var(--text-muted); }
.station-badge { background: var(--primary-light); color: var(--primary); border-radius: 4px; padding: 1px 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; }
.text-danger { color: #f4516c; font-weight: 600; }
.text-success { color: #34bfa3; }
.text-muted { color: var(--text-muted); }
.risk-cell { display: flex; align-items: center; gap: 8px; min-width: 90px; }
.risk-bar-bg { flex: 1; height: 5px; background: var(--border-color); border-radius: 3px; overflow: hidden; }
.risk-bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease; }
.risk-badge { font-size: 11px; font-weight: 700; min-width: 28px; text-align: right; }
.risk-low { background: #34bfa3; color: #34bfa3; }
.risk-medium { background: #ffb822; color: #ffb822; }
.risk-high { background: #f4516c; color: #f4516c; }
.risk-critical { background: #aa00ff; color: #aa00ff; }
.risk-badge.risk-low, .risk-badge.risk-medium, .risk-badge.risk-high, .risk-badge.risk-critical { background: none; }
.drill-btn { background: none; border: 1px solid var(--border-color); border-radius: var(--radius-md); width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-muted); transition: all 0.15s; }
.drill-btn:hover { border-color: var(--primary); color: var(--primary); }
.drill-btn svg { width: 14px; height: 14px; }
.ledger-pagination { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--border-color); font-size: 12px; color: var(--text-muted); }
.page-btn { background: none; border: 1px solid var(--border-color); border-radius: var(--radius-md); width: 26px; height: 26px; cursor: pointer; font-size: 14px; color: var(--text-main); transition: all 0.15s; display: flex; align-items: center; justify-content: center; }
.page-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.page-info { font-weight: 600; color: var(--text-main); }
.page-size-label { margin-left: auto; }
.ledger-loading { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.ledger-progress { height: 3px; background: var(--border-color); border-radius: 3px; overflow: hidden; }
.ledger-progress-bar { height: 100%; background: var(--primary); border-radius: 3px; transition: width 0.3s ease; }
.ledger-loading-msg { font-size: 11px; color: var(--text-muted); text-align: center; }
.ledger-skeleton { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border-color); }
.skel-col { height: 14px; border-radius: 4px; background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
.skel-wide { width: 140px; }
.skel-mid { width: 80px; }
.skel-narrow { width: 60px; }
.skel-badge { width: 50px; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.ledger-empty { padding: 48px; display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--text-muted); font-size: 13px; }
.ledger-empty svg { width: 40px; height: 40px; opacity: 0.35; }
</style>
