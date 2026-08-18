<template>
  <section class="archive-reports">
    <header class="archive-reports__head">
      <div>
        <h2 class="archive-reports__title">Archive Reports</h2>
        <p class="archive-reports__subtitle">
          Readings and payments exported to cold storage as gzipped CSVs, partitioned by
          OEM, station and period. Readings age out of the live retention window; payments
          are exported for bulk download.
        </p>
      </div>
      <BaseButton variant="secondary" :disabled="loading" @click="load">
        {{ loading ? "Loading…" : "Refresh" }}
      </BaseButton>
    </header>

    <!-- The archive is provisioned by migration + a nightly sweep, so "not set up yet"
         is a normal state on a fresh environment, not a fault. Distinguish it from a
         real error so nobody debugs a missing table as a broken page. -->
    <div v-if="notProvisioned" class="archive-reports__notice">
      <strong>Archive not provisioned yet.</strong>
      Apply migration <code>20260811110000_archive_reports.sql</code>, then let the
      nightly <code>/api/cron/archive-readings</code> sweep run (or trigger it manually)
      to export settled months.
    </div>
    <div v-else-if="error" class="archive-reports__error" role="alert">{{ error }}</div>

    <!-- Summary tiles. storageQuotaMb is surfaced because the whole point of the
         archive is that it bills against the 1 GB Storage quota, not the 500 MB
         Postgres quota that the live tables compete for. -->
    <div v-if="summary" class="archive-reports__tiles">
      <article class="archive-tile">
        <span class="archive-tile__label">Archived partitions</span>
        <strong class="archive-tile__value">{{ formatNumber(summary.totalReports) }}</strong>
      </article>
      <article class="archive-tile">
        <span class="archive-tile__label">Rows archived</span>
        <strong class="archive-tile__value">{{ formatNumber(summary.totalRows) }}</strong>
        <span class="archive-tile__hint">yearly bundles re-cover their monthly siblings</span>
      </article>
      <article class="archive-tile">
        <span class="archive-tile__label">Storage used</span>
        <strong class="archive-tile__value">{{ summary.totalSizeMb }} MB</strong>
        <span class="archive-tile__hint">of {{ summary.storageQuotaMb }} MB bucket quota</span>
      </article>
      <article class="archive-tile">
        <span class="archive-tile__label">Coverage</span>
        <strong class="archive-tile__value archive-tile__value--sm">
          {{ summary.dateRange?.earliest ? formatMonth(summary.dateRange.earliest) : "—" }}
          →
          {{ summary.dateRange?.latest ? formatMonth(summary.dateRange.latest) : "—" }}
        </strong>
      </article>
    </div>

    <div class="archive-reports__filters">
      <label class="archive-filter">
        <span>Station</span>
        <BaseSelect v-model="filters.stationId" @change="load">
          <option value="">All stations</option>
          <option v-for="station in stationOptions" :key="station" :value="station">{{ station }}</option>
        </BaseSelect>
      </label>
      <label class="archive-filter">
        <span>Year</span>
        <BaseSelect v-model="filters.year" @change="load">
          <option value="">All years</option>
          <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
        </BaseSelect>
      </label>
      <label class="archive-filter">
        <span>Type</span>
        <BaseSelect v-model="filters.reportType" @change="load">
          <option value="">All types</option>
          <option v-for="type in typeOptions" :key="type" :value="type">{{ titleCase(type) }}</option>
        </BaseSelect>
      </label>
      <label class="archive-filter">
        <span>Granularity</span>
        <BaseSelect v-model="filters.granularity" @change="load">
          <option value="">All grains</option>
          <option v-for="grain in granularityOptions" :key="grain" :value="grain">{{ titleCase(grain) }}</option>
        </BaseSelect>
      </label>
      <label class="archive-filter">
        <span>Month</span>
        <BaseSelect v-model="filters.month" :disabled="!filters.year || filters.granularity === 'yearly'" @change="load">
          <option value="">All months</option>
          <option v-for="(name, index) in monthNames" :key="name" :value="index + 1">{{ name }}</option>
        </BaseSelect>
      </label>
      <BaseButton
        v-if="hasActiveFilters"
        variant="ghost"
        class="archive-reports__clear"
        @click="clearFilters"
      >
        Clear filters
      </BaseButton>
      <span class="archive-reports__filtercount">
        {{ formatNumber(reports.length) }} {{ reports.length === 1 ? "partition" : "partitions" }}
      </span>
    </div>

    <div class="archive-reports__tablewrap">
      <table class="archive-table">
        <thead>
          <tr>
            <th>OEM</th>
            <th>Station</th>
            <th>Type</th>
            <th>Grain</th>
            <th>Period</th>
            <th>Covers</th>
            <th class="archive-table__num">Readings</th>
            <th class="archive-table__num">Size</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="9" class="archive-table__empty">Loading archive catalogue…</td>
          </tr>
          <tr v-else-if="!reports.length">
            <td colspan="9" class="archive-table__empty">
              No archived partitions yet. Months are exported once they have been closed
              for {{ graceDays }} days.
            </td>
          </tr>
          <tr v-for="report in pagedReports" v-else :key="report.id">
            <td class="archive-table__muted">{{ report.oemSlug || '—' }}</td>
            <td class="archive-table__station">{{ report.stationId }}</td>
            <td>
              <span :class="['archive-table__type', `archive-table__type--${report.reportType}`]">
                {{ titleCase(report.reportType) }}
              </span>
            </td>
            <td>{{ titleCase(report.granularity) }}</td>
            <td>{{ report.granularity === 'yearly' ? report.periodStart.slice(0, 4) : formatMonth(report.periodStart) }}</td>
            <td class="archive-table__muted">
              {{ report.coversFrom || "—" }} → {{ report.coversTo || "—" }}
            </td>
            <td class="archive-table__num">{{ formatNumber(report.rowCount) }}</td>
            <td class="archive-table__num">{{ formatSize(report.byteSize) }}</td>
            <td>
              <BaseButton
                variant="ghost"
                :disabled="downloadingId === report.id"
                @click="download(report)"
              >
                {{ downloadingId === report.id ? "Preparing…" : "Download" }}
              </BaseButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Same controls and helpers as TablePage's footer (pageNumbers / totalPages /
         paginateRows from table-service), so paging behaves identically across the CRM. -->
    <div v-if="reports.length" class="archive-pagination">
      <span>Total {{ formatNumber(reports.length) }}</span>
      <span class="archive-pagination__spacer"></span>
      <BaseSelect v-model.number="pageSize" aria-label="Page size" @change="goToPage(1)">
        <option v-for="option in pageSizeOptions" :key="option" :value="option">{{ option }}/page</option>
      </BaseSelect>
      <BaseButton class="page-chip" size="sm" :disabled="currentPage === 1" aria-label="Previous page" @click="goToPage(currentPage - 1)">&#8249;</BaseButton>
      <BaseButton
        v-for="page in pages"
        :key="page"
        :class="['page-chip', page === currentPage ? 'active' : '']"
        size="sm"
        :aria-current="page === currentPage ? 'page' : null"
        @click="goToPage(page)"
      >{{ page }}</BaseButton>
      <BaseButton class="page-chip" size="sm" :disabled="currentPage === pageCount" aria-label="Next page" @click="goToPage(currentPage + 1)">&#8250;</BaseButton>
      <span>Page {{ currentPage }} / {{ pageCount }}</span>
    </div>

    <p class="archive-reports__footnote">
      <strong>Readings</strong> files carry every raw column for the period, including
      telemetry and tamper flags — the two things the rollups cannot reconstruct.
      <strong>Payments</strong> files carry the vend/recharge ledger for the same period.
      Yearly bundles hold the same rows as their twelve monthly siblings, offered as one
      download. Per-customer history is obtained by filtering a station file, which is
      also how SparkMeter's own report API works. Monthly and yearly consumption totals
      remain queryable live and are never archived away.
    </p>
  </section>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseSelect from "./base/BaseSelect.vue";
import {
  fetchArchiveReports,
  fetchArchiveReportsSummary,
  requestArchiveDownloadUrl,
} from "../services/consumption-service.mjs";
import {
  pageNumbers,
  pageSizeOptions,
  paginateRows,
  totalPages,
} from "../services/table-helpers.mjs";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default {
  name: "ArchiveReportsPage",
  components: { BaseButton, BaseSelect },
  props: {
    route: {
      type: Object,
      default: () => ({}),
    },
  },
  data() {
    return {
      loading: false,
      error: "",
      notProvisioned: false,
      summary: null,
      reports: [],
      downloadingId: "",
      graceDays: 35,
      monthNames: MONTH_NAMES,
      filters: { stationId: "", year: "", month: "", reportType: "", granularity: "" },
      currentPage: 1,
      pageSize: 20,
      pageSizeOptions,
    };
  },
  computed: {
    hasActiveFilters() {
      return Object.values(this.filters).some(Boolean);
    },
    stationOptions() {
      return Object.keys(this.summary?.byStation || {}).sort();
    },
    pageCount() {
      return totalPages(this.reports.length, this.pageSize);
    },
    pages() {
      return pageNumbers(this.currentPage, this.pageCount);
    },
    pagedReports() {
      return paginateRows(this.reports, this.currentPage, this.pageSize);
    },
    typeOptions() {
      return Object.keys(this.summary?.byType || {}).sort();
    },
    granularityOptions() {
      // Monthly before yearly -- alphabetical would invert the natural reading order.
      return Object.keys(this.summary?.byGranularity || {})
        .sort((a, b) => (a === "monthly" ? -1 : b === "monthly" ? 1 : a.localeCompare(b)));
    },
    yearOptions() {
      const earliest = this.summary?.dateRange?.earliest;
      const latest = this.summary?.dateRange?.latest;
      if (!earliest || !latest) return [];
      const from = Number(String(earliest).slice(0, 4));
      const to = Number(String(latest).slice(0, 4));
      const years = [];
      for (let year = to; year >= from; year -= 1) years.push(year);
      return years;
    },
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      this.currentPage = 1;
      this.loading = true;
      this.error = "";
      this.notProvisioned = false;
      // allSettled, not all: the summary and the listing fail independently. A summary
      // outage should not blank the table (or vice versa) when the other call succeeded.
      const [summary, listing] = await Promise.allSettled([
        fetchArchiveReportsSummary(),
        fetchArchiveReports({
          stationId: this.filters.stationId || null,
          year: this.filters.year || null,
          // A yearly row's period_start is 1 Jan, so a month filter would exclude every
          // yearly bundle. Drop it when the grain filter is explicitly yearly.
          month: this.filters.granularity === "yearly" ? null : (this.filters.month || null),
          reportType: this.filters.reportType || null,
          granularity: this.filters.granularity || null,
        }),
      ]);

      this.summary = summary.status === "fulfilled" ? summary.value : null;
      this.reports = listing.status === "fulfilled" ? (listing.value?.reports || []) : [];

      const failures = [summary, listing].filter((result) => result.status === "rejected");
      if (failures.length) {
        const messages = failures.map((result) => String(result.reason?.message || result.reason));
        // PGRST205 is PostgREST's "table missing from schema cache" -- i.e. the migration
        // has not been applied. That is a setup step, not a failure worth alarming on.
        this.notProvisioned = messages.some((message) => /PGRST205|archive_reports/i.test(message));
        if (!this.notProvisioned) this.error = messages[0];
      }
      this.loading = false;
    },
    goToPage(page) {
      const next = Math.min(Math.max(1, Number(page) || 1), Math.max(1, this.pageCount));
      this.currentPage = next;
    },
    clearFilters() {
      this.filters = { stationId: "", year: "", month: "", reportType: "", granularity: "" };
      this.load();
    },
    async download(report) {
      this.downloadingId = report.id;
      this.error = "";
      try {
        // Signed URLs are short-lived, so one is minted per click rather than cached
        // with the row.
        const result = await requestArchiveDownloadUrl(report.id);
        if (!result?.url) throw new Error(result?.reason || "No download URL returned");
        window.open(result.url, "_blank", "noopener");
      } catch (err) {
        this.error = String(err?.message || err);
      } finally {
        this.downloadingId = "";
      }
    },
    formatNumber(value) {
      return Number(value || 0).toLocaleString();
    },
    formatSize(bytes) {
      const size = Number(bytes || 0);
      if (size < 1024) return `${size} B`;
      if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`;
      return `${(size / 1048576).toFixed(2)} MB`;
    },
    formatMonth(value) {
      const text = String(value || "");
      if (text.length < 7) return text || "—";
      const month = Number(text.slice(5, 7));
      return `${MONTH_NAMES[month - 1] || text.slice(5, 7)} ${text.slice(0, 4)}`;
    },
    titleCase(value) {
      const text = String(value || "");
      return text ? text.charAt(0).toUpperCase() + text.slice(1) : "—";
    },
  },
};
</script>

<style scoped>
/* Tokens come from src/styles/tokens.css. An earlier pass used --surface,
   --surface-muted and --border, none of which exist in this project, so every one of
   them silently fell through to its light-mode literal fallback -- which is why the
   table header rendered white-on-white in dark mode. The real names are --bg-card,
   --bg-page, --border-color, --text-main, --text-muted. No raw hex below. */

.archive-reports {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.archive-reports__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.archive-reports__title {
  margin: 0;
  font-size: var(--bev-font-size-xl, 1.25rem);
  font-weight: 600;
  color: var(--text-strong);
}

.archive-reports__subtitle {
  margin: 0.25rem 0 0;
  max-width: 68ch;           /* keeps the measure inside the 60-75 char readable range */
  font-size: var(--bev-font-size-sm, 0.875rem);
  line-height: var(--bev-line-normal, 1.55);
  color: var(--text-muted);
}

.archive-reports__error {
  padding: 0.75rem 1rem;
  border: 1px solid var(--danger);
  border-radius: var(--bev-radius-md, 8px);
  background: var(--danger-bg);
  color: var(--danger);
  font-size: var(--bev-font-size-sm, 0.875rem);
}

.archive-reports__notice {
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: var(--bev-radius-md, 8px);
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: var(--bev-font-size-sm, 0.875rem);
  line-height: var(--bev-line-normal, 1.55);
}

.archive-reports__notice code {
  padding: 0.1rem 0.35rem;
  border: 1px solid var(--border-color);
  border-radius: var(--bev-radius-xs, 4px);
  background: var(--bg-page);
  font-family: var(--bev-font-mono, monospace);
  font-size: 0.8125rem;
}

/* ── summary tiles ─────────────────────────────────────────────────────────── */

.archive-reports__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 0.75rem;
}

.archive-tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: var(--bev-radius-lg, 10px);
  background: var(--bg-card);
}

.archive-tile__label {
  font-size: var(--bev-font-size-xs, 0.75rem);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.archive-tile__value {
  font-size: 1.375rem;
  font-weight: 600;
  color: var(--text-strong);
  /* Tabular figures stop the tile width jittering as counts change. */
  font-variant-numeric: tabular-nums;
}

.archive-tile__value--sm { font-size: 0.9375rem; }

.archive-tile__hint {
  font-size: var(--bev-font-size-xs, 0.75rem);
  color: var(--text-faint, var(--text-muted));
}

/* ── filters ───────────────────────────────────────────────────────────────── */

.archive-reports__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: var(--bev-radius-lg, 10px);
  background: var(--bg-card);
}

.archive-filter {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: var(--bev-font-size-xs, 0.75rem);
  color: var(--text-muted);
}

.archive-filter :deep(select) { min-width: 160px; }

.archive-reports__filtercount {
  margin-left: auto;
  align-self: center;
  font-size: var(--bev-font-size-xs, 0.75rem);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* ── table ─────────────────────────────────────────────────────────────────── */

.archive-reports__tablewrap {
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--bev-radius-lg, 10px);
  background: var(--bg-card);
}

.archive-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--bev-font-size-sm, 0.875rem);
  color: var(--text-main);
}

.archive-table th,
.archive-table td {
  padding: 0.625rem 0.875rem;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
}

.archive-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  font-size: var(--bev-font-size-xs, 0.75rem);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  /* --bg-page (not a hardcoded grey) so the sticky header stays legible in both themes. */
  background: var(--bg-page);
}

.archive-table tbody tr:hover { background: var(--bg-glass); }
.archive-table tbody tr:last-child td { border-bottom: none; }

.archive-table__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.archive-table__station {
  font-weight: 600;
  color: var(--text-strong);
}

.archive-table__muted { color: var(--text-muted); }

.archive-table__empty {
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--text-muted);
  white-space: normal;
}

.archive-table__type {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.5rem;
  border-radius: var(--bev-radius-pill, 999px);
  border: 1px solid var(--border-color);
  font-size: var(--bev-font-size-xs, 0.75rem);
  /* Type is also carried by the label text, never by colour alone. */
  color: var(--text-muted);
}

.archive-table__type--payments {
  color: var(--success);
  border-color: var(--success);
  background: var(--success-bg);
}

/* ── pagination (mirrors TablePage's footer controls) ──────────────────────── */

.archive-pagination {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.25rem 0.125rem;
  font-size: var(--bev-font-size-xs, 0.75rem);
  color: var(--text-muted);
}

.archive-pagination__spacer { margin-left: auto; }

.archive-pagination :deep(.page-chip) {
  min-width: 32px;
  padding-inline: 0.5rem;
  font-variant-numeric: tabular-nums;
}

.archive-pagination :deep(.page-chip.active) {
  border-color: var(--primary);
  color: var(--primary);
}

.archive-pagination :deep(select) { min-width: 96px; }

.archive-reports__footnote {
  margin: 0;
  max-width: 78ch;
  font-size: 0.8125rem;
  line-height: var(--bev-line-normal, 1.55);
  color: var(--text-muted);
}

.archive-reports__footnote strong { color: var(--text-main); }

@media (max-width: 640px) {
  .archive-reports__filters { flex-direction: column; align-items: stretch; }
  .archive-filter :deep(select) { min-width: 0; width: 100%; }
  .archive-reports__filtercount { margin-left: 0; }
}

/* Motion is decorative here; honour the user's system preference. */
@media (prefers-reduced-motion: reduce) {
  .archive-table tbody tr { transition: none; }
}
</style>
