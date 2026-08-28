<template>
  <section class="archive-reports">
    <header class="archive-reports__head">
      <div>
        <h2 class="archive-reports__title">Archive Reports</h2>
        <p class="archive-reports__subtitle">
          Protected gzip CSV snapshots of readings and payments, partitioned by OEM,
          station and period. Settled reading months can age out of the live database only
          after a verified archive index exists; payment exports remain bulk-download copies.
        </p>
      </div>
      <BaseButton variant="secondary" :disabled="loading" @click="load()">
        {{ loading ? "Loading…" : "Refresh" }}
      </BaseButton>
    </header>

    <!-- The archive is provisioned by migration + a nightly sweep, so "not set up yet"
         is a normal state on a fresh environment, not a fault. Distinguish it from a
         real error so nobody debugs a missing table as a broken page. -->
    <div v-if="notProvisioned" class="archive-reports__notice">
      <strong>Archive not provisioned yet.</strong>
      Apply the pending archive migrations, then let the
      nightly <code>/api/cron/archive-readings</code> sweep run (or trigger it manually)
      to export settled months.
    </div>
    <div v-else-if="error" class="archive-reports__error" role="alert">{{ error }}</div>

    <!-- Summary tiles. storageQuotaMb is surfaced because the whole point of the
         archive is that it bills against the 1 GB Storage quota, not the 500 MB
         Postgres quota that the live tables compete for. -->
    <div v-if="summary" class="archive-reports__tiles">
      <article class="archive-tile archive-tile--primary">
        <span class="archive-tile__label">Archived partitions</span>
        <strong class="archive-tile__value">{{ formatNumber(summary.totalReports) }}</strong>
        <span class="archive-tile__hint">monthly files and yearly download bundles</span>
      </article>
      <article class="archive-tile archive-tile--success">
        <span class="archive-tile__label">Source rows protected</span>
        <strong class="archive-tile__value">{{ formatNumber(summary.totalRows) }}</strong>
        <span class="archive-tile__hint">monthly source rows; yearly duplicates excluded</span>
      </article>
      <article class="archive-tile archive-tile--info">
        <span class="archive-tile__label">Storage used</span>
        <strong class="archive-tile__value">{{ summary.totalSizeMb }} MB</strong>
        <span class="archive-tile__hint">of {{ summary.storageQuotaMb }} MB bucket quota</span>
      </article>
      <article class="archive-tile archive-tile--neutral">
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
        <BaseSelect v-model="filters.stationId" @change="applyFilters">
          <option value="">All stations</option>
          <option v-for="station in stationOptions" :key="station.value" :value="station.value">{{ station.label }}</option>
        </BaseSelect>
      </label>
      <label class="archive-filter">
        <span>Year</span>
        <BaseSelect v-model="filters.year" @change="applyFilters">
          <option value="">All years</option>
          <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
        </BaseSelect>
      </label>
      <label class="archive-filter">
        <span>Type</span>
        <BaseSelect v-model="filters.reportType" @change="applyFilters">
          <option value="">All types</option>
          <option v-for="type in typeOptions" :key="type" :value="type">{{ titleCase(type) }}</option>
        </BaseSelect>
      </label>
      <label class="archive-filter">
        <span>Granularity</span>
        <BaseSelect v-model="filters.granularity" @change="applyFilters">
          <option value="">All grains</option>
          <option v-for="grain in granularityOptions" :key="grain" :value="grain">{{ titleCase(grain) }}</option>
        </BaseSelect>
      </label>
      <label class="archive-filter">
        <span>Month</span>
        <BaseSelect v-model="filters.month" :disabled="!filters.year || filters.granularity === 'yearly'" @change="applyFilters">
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
      <span class="archive-reports__filtercount" aria-live="polite">
        {{ formatNumber(totalCount) }} {{ totalCount === 1 ? "partition" : "partitions" }}
      </span>
    </div>

    <div class="archive-reports__tablewrap" tabindex="0" aria-label="Archive report catalogue; scroll horizontally to see all columns">
      <table class="archive-table" :aria-busy="loading ? 'true' : 'false'">
        <thead>
          <tr>
            <th scope="col">OEM</th>
            <th scope="col">Station</th>
            <th scope="col">Type</th>
            <th scope="col">Grain</th>
            <th scope="col">Period</th>
            <th scope="col">Covers</th>
            <th scope="col" class="archive-table__num">Rows</th>
            <th scope="col" class="archive-table__num">Size</th>
            <th scope="col">Actions</th>
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
          <tr v-for="report in reports" v-else :key="report.id">
            <td class="archive-table__muted">{{ report.oemSlug || '—' }}</td>
            <td class="archive-table__station">{{ formatStationLabel(report.stationId) }}</td>
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

    <div class="archive-mobile-list" :aria-busy="loading ? 'true' : 'false'">
      <p v-if="loading" class="archive-table__empty">Loading archive catalogue…</p>
      <p v-else-if="!reports.length" class="archive-table__empty">
        No archived partitions match these filters.
      </p>
      <article v-for="report in reports" v-else :key="report.id" class="archive-mobile-card">
        <div class="archive-mobile-card__head">
          <div>
            <span class="archive-mobile-card__eyebrow">{{ report.oemSlug || "Unmapped OEM" }}</span>
            <h3>{{ formatStationLabel(report.stationId) }}</h3>
          </div>
          <span :class="['archive-table__type', `archive-table__type--${report.reportType}`]">
            {{ titleCase(report.reportType) }}
          </span>
        </div>
        <dl>
          <div><dt>Period</dt><dd>{{ report.granularity === "yearly" ? report.periodStart.slice(0, 4) : formatMonth(report.periodStart) }}</dd></div>
          <div><dt>Grain</dt><dd>{{ titleCase(report.granularity) }}</dd></div>
          <div><dt>Rows</dt><dd>{{ formatNumber(report.rowCount) }}</dd></div>
          <div><dt>Size</dt><dd>{{ formatSize(report.byteSize) }}</dd></div>
          <div class="archive-mobile-card__coverage"><dt>Covers</dt><dd>{{ report.coversFrom || "—" }} → {{ report.coversTo || "—" }}</dd></div>
        </dl>
        <BaseButton variant="secondary" :disabled="downloadingId === report.id" @click="download(report)">
          {{ downloadingId === report.id ? "Preparing…" : "Download CSV.gz" }}
        </BaseButton>
      </article>
    </div>

    <!-- Same controls and helpers as TablePage's footer (pageNumbers / totalPages /
         paginateRows from table-service), so paging behaves identically across the CRM. -->
    <div v-if="reports.length" class="archive-pagination">
      <span>Showing {{ visibleStart }}–{{ visibleEnd }} of {{ formatNumber(totalCount) }}</span>
      <span class="archive-pagination__spacer"></span>
      <BaseSelect v-model.number="pageSize" aria-label="Page size" @change="changePageSize">
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
      <label class="archive-pagination__goto">
        <span>Go to</span>
        <BaseInput v-model="gotoPageInput" type="number" min="1" :max="pageCount" aria-label="Go to page" @keyup.enter="applyGoto" />
      </label>
      <BaseButton class="page-chip" size="sm" @click="applyGoto">Go</BaseButton>
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
import BaseInput from "./base/BaseInput.vue";
import BaseSelect from "./base/BaseSelect.vue";
import {
  fetchArchiveReports,
  fetchArchiveReportsSummary,
  requestArchiveDownloadUrl,
} from "../services/consumption-service.mjs";
import {
  pageNumbers,
  pageSizeOptions,
  totalPages,
} from "../services/table-helpers.mjs";
import { formatStationDisplayLabel } from "../services/station-registry.mjs";
import { loadDynamicStationOptions, tableSiteOptions } from "../services/table-service.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default {
  name: "ArchiveReportsPage",
  components: { BaseButton, BaseInput, BaseSelect },
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
      totalCount: 0,
      downloadingId: "",
      graceDays: 35,
      monthNames: MONTH_NAMES,
      filters: { stationId: "", year: "", month: "", reportType: "", granularity: "" },
      currentPage: 1,
      pageSize: 10,
      pageSizeOptions,
      gotoPageInput: "1",
      loadToken: 0,
    };
  },
  computed: {
    hasActiveFilters() {
      return Object.values(this.filters).some(Boolean);
    },
    stationOptions() {
      const summaryStations = Object.keys(this.summary?.byStation || {});
      const dynamicStations = tableSiteOptions.map((s) => s.value).filter(Boolean);
      const allIds = Array.from(new Set([...summaryStations, ...dynamicStations])).sort();
      const map = new Map();
      for (const id of allIds) {
        const label = this.formatStationLabel(id);
        if (!map.has(label)) {
          map.set(label, { value: id, label });
        }
      }
      return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
    },
    pageCount() {
      return totalPages(this.totalCount, this.pageSize);
    },
    pages() {
      return pageNumbers(this.currentPage, this.pageCount);
    },
    visibleStart() {
      return this.totalCount ? (this.currentPage - 1) * this.pageSize + 1 : 0;
    },
    visibleEnd() {
      return Math.min(this.currentPage * this.pageSize, this.totalCount);
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
    loadDynamicStationOptions(undefined, true).catch(() => null);
    this.load();
  },
  methods: {
    formatStationLabel(rawId) {
      const norm = String(rawId || "").trim();
      if (!norm) return "";
      const match = tableSiteOptions.find((opt) => String(opt.value || "").toUpperCase() === norm.toUpperCase());
      return formatStationDisplayLabel(rawId, match?.label);
    },
    async load({ includeSummary = true } = {}) {
      const loadToken = ++this.loadToken;
      this.loading = true;
      this.error = "";
      this.notProvisioned = false;
      const requests = [
        fetchArchiveReports({
          stationId: this.filters.stationId || null,
          year: this.filters.year || null,
          // A yearly row's period_start is 1 Jan, so a month filter would exclude every
          // yearly bundle. Drop it when the grain filter is explicitly yearly.
          month: this.filters.granularity === "yearly" ? null : (this.filters.month || null),
          reportType: this.filters.reportType || null,
          granularity: this.filters.granularity || null,
          page: this.currentPage,
          pageSize: this.pageSize,
        }),
      ];
      // Pagination and filters only need the requested catalogue slice. The global KPI
      // summary can be expensive on an environment that has not deployed the aggregate
      // RPC yet, so refresh it only on initial load and an explicit Refresh click.
      if (includeSummary) requests.unshift(fetchArchiveReportsSummary());
      const settled = await Promise.allSettled(requests);
      const summary = includeSummary ? settled[0] : null;
      const listing = settled[includeSummary ? 1 : 0];

      if (loadToken !== this.loadToken) return;

      if (summary?.status === "fulfilled") this.summary = summary.value;
      this.reports = listing.status === "fulfilled" ? (listing.value?.reports || []) : [];
      this.totalCount = listing.status === "fulfilled" ? Number(listing.value?.totalCount || 0) : 0;

      const failures = [summary, listing].filter((result) => result?.status === "rejected");
      if (failures.length) {
        const messages = failures.map((result) => String(result.reason?.message || result.reason));
        // PGRST205 is PostgREST's "table missing from schema cache" -- i.e. the migration
        // has not been applied. That is a setup step, not a failure worth alarming on.
        this.notProvisioned = messages.some((message) => /PGRST205|archive_reports/i.test(message));
        if (!this.notProvisioned) this.error = messages[0];
      }
      this.loading = false;
    },
    async goToPage(page) {
      const next = Math.min(Math.max(1, Number(page) || 1), Math.max(1, this.pageCount));
      if (next === this.currentPage && this.reports.length) return;
      this.currentPage = next;
      this.gotoPageInput = String(next);
      await this.load({ includeSummary: false });
    },
    applyFilters() {
      if (this.filters.granularity === "yearly") this.filters.month = "";
      this.currentPage = 1;
      this.gotoPageInput = "1";
      this.load({ includeSummary: false });
    },
    changePageSize() {
      this.currentPage = 1;
      this.gotoPageInput = "1";
      this.load({ includeSummary: false });
    },
    applyGoto() {
      this.goToPage(this.gotoPageInput);
    },
    clearFilters() {
      this.filters = { stationId: "", year: "", month: "", reportType: "", granularity: "" };
      this.applyFilters();
    },
    async download(report) {
      this.downloadingId = report.id;
      this.error = "";
      try {
        // Signed URLs are short-lived, so one is minted per click rather than cached
        // with the row.
        const result = await requestArchiveDownloadUrl(report.id);
        if (!result?.url) throw new Error(result?.reason || "No download URL returned");
        const anchor = document.createElement("a");
        anchor.href = result.url;
        anchor.rel = "noopener";
        if (result.filename) anchor.download = result.filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
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
  gap: var(--bev-space-4);
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
  gap: var(--bev-space-3);
}

.archive-tile {
  --archive-accent: var(--text-muted);
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: var(--bev-space-1);
  padding: var(--bev-space-4);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--archive-accent) 24%, var(--border-color));
  border-left: 3px solid var(--archive-accent);
  border-radius: var(--wallet-card-radius);
  background: var(--bg-card);
  background-image: radial-gradient(
    ellipse at top right,
    color-mix(in srgb, var(--archive-accent) 8%, transparent),
    transparent 68%
  );
  box-shadow: var(--bev-shadow-xs);
  transition: border-color var(--bev-motion-fast), box-shadow var(--bev-motion-fast), transform var(--bev-motion-fast);
}

.archive-tile--primary { --archive-accent: var(--primary); }
.archive-tile--success { --archive-accent: var(--success); }
.archive-tile--info { --archive-accent: var(--info); }
.archive-tile--neutral { --archive-accent: var(--text-muted); }

.archive-tile:hover {
  border-color: color-mix(in srgb, var(--archive-accent) 52%, var(--border-color));
  box-shadow: var(--bev-shadow-sm);
  transform: translateY(-1px);
}

.archive-tile__label {
  font-size: var(--bev-font-size-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.archive-tile__value {
  font-size: var(--bev-font-size-2xl);
  font-weight: 800;
  color: var(--text-strong);
  /* Tabular figures stop the tile width jittering as counts change. */
  font-variant-numeric: tabular-nums;
}

.archive-tile__value--sm { font-size: var(--bev-font-size-md); }

.archive-tile__hint {
  margin-top: auto;
  font-size: var(--bev-font-size-xs);
  line-height: var(--bev-line-normal);
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
  border-radius: var(--wallet-card-radius);
  background: var(--bg-card);
  box-shadow: var(--bev-shadow-xs);
  scrollbar-gutter: stable;
}

.archive-reports__tablewrap:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
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

.archive-mobile-list { display: none; }

.archive-mobile-card {
  display: flex;
  flex-direction: column;
  gap: var(--bev-space-3);
  padding: var(--bev-space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--wallet-card-radius);
  background: var(--bg-card);
  box-shadow: var(--bev-shadow-xs);
}

.archive-mobile-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bev-space-3);
}

.archive-mobile-card__eyebrow {
  color: var(--text-muted);
  font-size: var(--bev-font-size-2xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.archive-mobile-card h3 {
  margin: var(--bev-space-1) 0 0;
  color: var(--text-strong);
  font-size: var(--bev-font-size-md);
}

.archive-mobile-card dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bev-space-3);
  margin: 0;
}

.archive-mobile-card dl div { min-width: 0; }
.archive-mobile-card dt {
  color: var(--text-muted);
  font-size: var(--bev-font-size-2xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.archive-mobile-card dd {
  margin: var(--bev-space-1) 0 0;
  color: var(--text-main);
  font-size: var(--bev-font-size-sm);
  overflow-wrap: anywhere;
}
.archive-mobile-card__coverage { grid-column: 1 / -1; }

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

.archive-pagination__goto {
  display: inline-flex;
  align-items: center;
  gap: var(--bev-space-2);
}

.archive-pagination__goto :deep(input) {
  width: 64px;
  min-height: var(--bev-touch-target-min);
}

.archive-reports__footnote {
  margin: 0;
  max-width: 78ch;
  font-size: 0.8125rem;
  line-height: var(--bev-line-normal, 1.55);
  color: var(--text-muted);
}

.archive-reports__footnote strong { color: var(--text-main); }

@media (max-width: 760px) {
  .archive-reports__head :deep(button) { width: 100%; }
  .archive-reports__tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .archive-reports__filters { flex-direction: column; align-items: stretch; }
  .archive-filter :deep(select) { min-width: 0; width: 100%; }
  .archive-reports__filtercount { margin-left: 0; }
  .archive-reports__tablewrap { display: none; }
  .archive-mobile-list { display: grid; gap: var(--bev-space-3); }
  .archive-pagination { align-items: stretch; }
  .archive-pagination__spacer { display: none; }
  .archive-pagination :deep(select) { flex: 1 1 100%; width: 100%; }
  .archive-pagination__goto { margin-left: auto; }
}

@media (max-width: 420px) {
  .archive-reports__tiles { grid-template-columns: 1fr; }
  .archive-tile { min-height: 116px; }
}

/* Motion is decorative here; honour the user's system preference. */
@media (prefers-reduced-motion: reduce) {
  .archive-table tbody tr,
  .archive-tile { transition: none; }
}
</style>
