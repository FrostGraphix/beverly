<template>
  <section class="audit-panel">
    <div class="audit-head">
      <div>
        <h3 class="audit-title">Data Integrity</h3>
        <p class="audit-sub">Supabase coverage, live parity, and backfill verdict.</p>
      </div>
      <div class="audit-head-actions">
        <BaseButton
          v-if="admin"
          class="audit-export-btn"
          data-testid="site-consumption-audit-panel-export"
          @click="$emit('export-audit')"
        >
          Export
        </BaseButton>
        <span :class="['audit-status', `audit-status--${overallTone}`]">{{ overallLabel }}</span>
      </div>
    </div>

    <div class="audit-story">
      <article class="audit-story-card">
        <span class="audit-story-label">Backfill Verdict</span>
        <strong class="audit-story-value">{{ verdictTitle }}</strong>
        <p class="audit-story-copy">{{ verdictCopy }}</p>
      </article>
      <article class="audit-story-card">
        <span class="audit-story-label">Serving Purpose</span>
        <strong class="audit-story-value">{{ servingTitle }}</strong>
        <p class="audit-story-copy">{{ servingCopy }}</p>
      </article>
    </div>

    <div class="audit-kpis">
      <article class="audit-kpi">
        <span class="audit-kpi-label">Rows in Supabase</span>
        <strong class="audit-kpi-value">{{ formatCount(audit?.overall?.totalRows) }}</strong>
      </article>
      <article class="audit-kpi">
        <span class="audit-kpi-label">Historical Start</span>
        <strong class="audit-kpi-value">{{ audit?.overall?.earliestReadingDate || "n/a" }}</strong>
      </article>
      <article class="audit-kpi">
        <span class="audit-kpi-label">Latest Reading</span>
        <strong class="audit-kpi-value">{{ audit?.overall?.latestReadingDate || "n/a" }}</strong>
      </article>
      <article class="audit-kpi">
        <span class="audit-kpi-label">Configured Start</span>
        <strong class="audit-kpi-value">{{ audit?.configuredFrom || "n/a" }}</strong>
      </article>
    </div>

    <div v-if="rows.length" class="audit-table-wrap">
      <table class="audit-table">
        <thead>
          <tr>
            <th>Station</th>
            <th>Store Rows</th>
            <th>Live Rows</th>
            <th>Metric</th>
            <th>Delta</th>
            <th>Coverage</th>
            <th>Latest</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.station"
            :class="{ 'audit-table-row--active': activeStation === row.station }"
          >
            <td>{{ row.station }}</td>
            <td>{{ formatCount(row.rows) }}</td>
            <td>{{ formatCount(row.liveTotalRows) }}</td>
            <td>{{ metricText(row) }}</td>
            <td :class="deltaClass(row.deltaStoreVsLive)">{{ formatDelta(row.deltaStoreVsLive) }}</td>
            <td>{{ coverageText(row) }}</td>
            <td>{{ row.latestReadingDate || "n/a" }}</td>
            <td>
              <span :class="['audit-pill', `audit-pill--${rowTone(row)}`]">{{ rowLabel(row) }}</span>
            </td>
            <td>
              <BaseButton class="audit-row-btn" @click="$emit('select-station', row.station)">
                Focus
              </BaseButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="audit?.warnings?.length" class="audit-warning-list">
      <article v-for="warning in audit.warnings" :key="warning" class="audit-warning-item">
        {{ warning }}
      </article>
    </div>

    <div v-if="admin && syncLogs.length" class="sync-log-panel" data-testid="site-consumption-sync-logs">
      <div class="sync-log-head">
        <h4>Sync Logs</h4>
        <span>{{ syncLogs.length }} stations</span>
      </div>
      <div class="sync-log-grid">
        <article v-for="log in syncLogs" :key="log.station" class="sync-log-card">
          <strong>{{ log.station }}</strong>
          <span>Midnight: {{ log.midnightStatus }}</span>
          <span>Expected: {{ log.expectedMidnightDate || "n/a" }}</span>
          <span>Latest: {{ log.latestReadingDate || "n/a" }}</span>
          <span>Drift: {{ log.backfillStatus }}</span>
          <span>Delta: {{ formatDelta(log.deltaStoreVsLive) }}</span>
        </article>
      </div>
    </div>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";

export default {
  name: "SiteConsumptionAuditPanel",
  components: { BaseButton },
  emits: ["export-audit", "select-station"],
  props: {
    activeStation: { type: String, default: null },
    admin: { type: Boolean, default: false },
    audit: { type: Object, default: null },
  },
  computed: {
    rows() {
      return Array.isArray(this.audit?.stations)
        ? this.audit.stations.slice().sort((left, right) => Math.abs(Number(right.deltaStoreVsLive) || 0) - Math.abs(Number(left.deltaStoreVsLive) || 0))
        : [];
    },
    overallTone() {
      return this.audit?.overall?.completenessStatus === "complete" ? "ok" : this.audit?.overall?.completenessStatus === "unverified" ? "muted" : "warn";
    },
    overallLabel() {
      if (this.audit?.overall?.completenessStatus === "complete") return "Backfill Complete";
      if (this.audit?.overall?.completenessStatus === "unverified") return "Backfill Unverified";
      return "Backfill Incomplete";
    },
    verdictTitle() {
      if (this.audit?.overall?.completenessStatus === "complete") return "Historical backfill is complete.";
      if (this.audit?.overall?.completenessStatus === "unverified") return "Historical backfill still needs verification.";
      return "Historical backfill still has gaps.";
    },
    verdictCopy() {
      if (this.audit?.overall?.completenessStatus === "complete") {
        return "Stored row counts match live totals and the configured backfill window is covered.";
      }
      if (this.audit?.overall?.completenessStatus === "unverified") {
        return "Some stations still rely on raw live totals, so Supabase coverage cannot be called complete yet.";
      }
      return "Supabase is populated, but stored row totals and historical start dates still drift from the intended live dataset.";
    },
    servingTitle() {
      return this.audit?.overall?.freshnessStatus === "fresh" ? "Serving current monitoring." : "Serving is degraded.";
    },
    servingCopy() {
      if (this.audit?.overall?.freshnessStatus === "fresh") {
        return "Current-day reads are available, so the page is useful for live operational review even while historical backfill remains incomplete.";
      }
      return "Freshness drift means even operational review is at risk until reads are brought current.";
    },
    syncLogs() {
      return Array.isArray(this.audit?.syncLogs) ? this.audit.syncLogs : [];
    },
  },
  methods: {
    formatCount(value) {
      return Number(value || 0).toLocaleString();
    },
    formatDelta(value) {
      const numeric = Number(value || 0);
      if (!numeric) return "0";
      return numeric > 0 ? `+${numeric.toLocaleString()}` : numeric.toLocaleString();
    },
    coverageText(row) {
      if (!row?.coverage) return "Unknown";
      if (row.coverage.status === "full") return "Full";
      if (row.coverage.status === "partial") return `${Number(row.coverage.gapDays || 0).toLocaleString()} days missing`;
      return "Unknown";
    },
    metricText(row) {
      if (row?.liveMetric === "unique") return "Unique";
      if (row?.liveMetric === "raw") return "Raw";
      return "n/a";
    },
    rowTone(row) {
      if (row?.completenessStatus === "complete" && row?.coverage?.status === "full") return "ok";
      if (row?.completenessStatus === "unverified" || row?.completenessStatus === "estimated-match") return "muted";
      return "warn";
    },
    rowLabel(row) {
      if (row?.completenessStatus === "complete" && row?.coverage?.status === "full") return "Healthy";
      if (row?.completenessStatus === "unverified" || row?.completenessStatus === "estimated-match") return "Unverified";
      if (row?.freshness?.status !== "fresh") return "Stale";
      return "Gap";
    },
    deltaClass(value) {
      return Number(value || 0) === 0 ? "audit-delta audit-delta--flat" : "audit-delta audit-delta--warn";
    },
  },
};
</script>

<style scoped>
.audit-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.98));
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
}

.audit-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.audit-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.audit-export-btn {
  height: 30px;
  min-width: 72px;
  border: 1px solid var(--border-color);
  background: var(--bg-main);
  color: var(--text-main);
  font-size: 11px;
  font-weight: 800;
}

.audit-title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-strong);
}

.audit-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.audit-status {
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.audit-status--ok {
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
}

.audit-status--warn {
  background: rgba(244, 81, 108, 0.12);
  color: #f4516c;
}

.audit-status--muted {
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
}

.audit-story {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.audit-story-card,
.audit-kpi {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
}

.audit-story-label,
.audit-kpi-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text-muted);
}

.audit-story-value,
.audit-kpi-value {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-strong);
}

.audit-story-copy {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-main);
}

.audit-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.audit-table-wrap {
  overflow-x: auto;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
}

.audit-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 880px;
}

.audit-table th,
.audit-table td {
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-main);
}

.audit-table th {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text-muted);
  background: rgba(15, 23, 42, 0.02);
}

.audit-table-row--active {
  background: rgba(5, 150, 105, 0.06);
}

.audit-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
}

.audit-pill--ok {
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
}

.audit-pill--warn {
  background: rgba(244, 81, 108, 0.12);
  color: #f4516c;
}

.audit-pill--muted {
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
}

.audit-delta--warn {
  color: #f4516c;
  font-weight: 700;
}

.audit-delta--flat {
  color: #047857;
  font-weight: 700;
}

.audit-row-btn {
  min-width: 72px;
  height: 30px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-main);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-main);
}

.audit-warning-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.audit-warning-item {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: rgba(244, 81, 108, 0.08);
  border: 1px solid rgba(244, 81, 108, 0.22);
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-strong);
}

.sync-log-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(15, 23, 42, 0.03);
}

.sync-log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sync-log-head h4 {
  margin: 0;
  font-size: 13px;
  color: var(--text-strong);
}

.sync-log-head span {
  font-size: 11px;
  color: var(--text-muted);
}

.sync-log-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.sync-log-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-main);
}

.sync-log-card strong {
  font-size: 12px;
  color: var(--text-strong);
}

@media (max-width: 1100px) {
  .audit-story,
  .audit-kpis,
  .audit-warning-list,
  .sync-log-grid {
    grid-template-columns: 1fr;
  }
}
</style>
