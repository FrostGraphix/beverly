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
      <div class="archive-reports__actions">
        <BaseButton variant="primary" :disabled="loading || !readySiteCount" @click="openExport()">
          Export archives
        </BaseButton>
        <BaseButton variant="secondary" :disabled="loading" @click="load()">
          {{ loading ? "Loading…" : "Refresh" }}
        </BaseButton>
      </div>
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

    <div
      v-if="summary?.syncHealth"
      :class="['archive-reports__freshness', { 'archive-reports__freshness--stale': summary.syncHealth.staleCount > 0 }]"
      role="status"
    >
      <strong>Source freshness</strong>
      <span>
        {{ summary.syncHealth.healthyCount }} current.
        {{ summary.syncHealth.staleCount }} stale.
        Maximum lag: {{ summary.syncHealth.maximumLagDays }} days.
      </span>
    </div>

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
        <span class="archive-tile__label">Coverage through</span>
        <strong class="archive-tile__value archive-tile__value--sm">
          {{ summary.coverageRange?.latest || summary.dateRange?.latest || "—" }}
        </strong>
        <span class="archive-tile__hint">actual rows, not generation time</span>
      </article>
    </div>

    <div class="archive-reports__filters archive-reports__site-tools">
      <label class="archive-filter">
        <span>Search sites</span>
        <BaseInput v-model="siteSearch" type="search" placeholder="Site name or StationID" autocomplete="off" />
      </label>
      <label class="archive-filter">
        <span>Archive status</span>
        <BaseSelect v-model="siteStateFilter">
          <option value="">All sites</option>
          <option value="ready">Archive ready</option>
          <option value="empty">No archives</option>
        </BaseSelect>
      </label>
      <span class="archive-reports__filtercount" aria-live="polite">
        {{ formatNumber(filteredSites.length) }} of {{ formatNumber(siteRows.length) }} sites
      </span>
    </div>

    <div class="archive-reports__tablewrap" tabindex="0" aria-label="Archive coverage by site; scroll horizontally to see all columns">
      <table class="archive-table" :aria-busy="loading ? 'true' : 'false'">
        <thead>
          <tr>
            <th scope="col">OEM</th>
            <th scope="col">Site</th>
            <th scope="col">Status</th>
            <th scope="col">Reports</th>
            <th scope="col">Coverage</th>
            <th scope="col" class="archive-table__num">Files</th>
            <th scope="col" class="archive-table__num">Source rows</th>
            <th scope="col" class="archive-table__num">Storage</th>
            <th scope="col">Last refreshed</th>
            <th scope="col">Export</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="10" class="archive-table__empty">Loading archive catalogue…</td>
          </tr>
          <tr v-else-if="!filteredSites.length">
            <td colspan="10" class="archive-table__empty">
              No sites match these filters.
            </td>
          </tr>
          <tr v-for="site in filteredSites" v-else :key="site.stationId">
            <td class="archive-table__muted">{{ site.oemSlug || '—' }}</td>
            <td class="archive-table__station">{{ site.label }}</td>
            <td><span :class="['archive-site-state', `archive-site-state--${site.state}`]">{{ site.state === 'ready' ? 'Ready' : 'No archives' }}</span></td>
            <td>{{ site.reportTypes.length ? site.reportTypes.map(titleCase).join(', ') : '—' }}</td>
            <td class="archive-table__muted">{{ site.coversFrom && site.coversTo ? `${site.coversFrom} → ${site.coversTo}` : 'Awaiting first archive' }}</td>
            <td class="archive-table__num">{{ formatNumber(site.reportCount) }}</td>
            <td class="archive-table__num">{{ formatNumber(site.rowCount) }}</td>
            <td class="archive-table__num">{{ formatSize(site.byteSize) }}</td>
            <td class="archive-table__muted">{{ formatDateTime(site.refreshedAt) }}</td>
            <td>
              <BaseButton variant="ghost" :disabled="site.state !== 'ready'" @click="openExport(site)">Configure</BaseButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="archive-mobile-list" :aria-busy="loading ? 'true' : 'false'">
      <p v-if="loading" class="archive-table__empty">Loading archive catalogue…</p>
      <p v-else-if="!filteredSites.length" class="archive-table__empty">
        No sites match these filters.
      </p>
      <article v-for="site in filteredSites" v-else :key="site.stationId" class="archive-mobile-card">
        <div class="archive-mobile-card__head">
          <div>
            <span class="archive-mobile-card__eyebrow">{{ site.oemSlug || "Unmapped OEM" }}</span>
            <h3>{{ site.label }}</h3>
          </div>
          <span :class="['archive-site-state', `archive-site-state--${site.state}`]">{{ site.state === 'ready' ? 'Ready' : 'Empty' }}</span>
        </div>
        <dl>
          <div><dt>Files</dt><dd>{{ formatNumber(site.reportCount) }}</dd></div>
          <div><dt>Source rows</dt><dd>{{ formatNumber(site.rowCount) }}</dd></div>
          <div><dt>Reports</dt><dd>{{ site.reportTypes.length ? site.reportTypes.map(titleCase).join(', ') : '—' }}</dd></div>
          <div><dt>Storage</dt><dd>{{ formatSize(site.byteSize) }}</dd></div>
          <div><dt>Refreshed</dt><dd>{{ formatDateTime(site.refreshedAt) }}</dd></div>
          <div class="archive-mobile-card__coverage"><dt>Covers</dt><dd>{{ site.coversFrom && site.coversTo ? `${site.coversFrom} → ${site.coversTo}` : 'Awaiting first archive' }}</dd></div>
        </dl>
        <BaseButton variant="secondary" :disabled="site.state !== 'ready'" @click="openExport(site)">
          Configure export
        </BaseButton>
      </article>
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

    <ArchiveExportWizard
      v-if="exportWizardOpen"
      :reports="reports"
      :sites="siteRows"
      :initial-station-id="exportStationId"
      @close="closeExport"
    />
  </section>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseSelect from "./base/BaseSelect.vue";
import ArchiveExportWizard from "./ArchiveExportWizard.vue";
import {
  fetchArchiveReports,
  fetchArchiveReportsSummary,
} from "../services/consumption-service.mjs";
import { formatStationDisplayLabel } from "../services/station-registry.mjs";
import { loadDynamicStationOptions, tableSiteOptions } from "../services/table-service.js";
import { buildArchiveSiteRows, loadArchiveCatalogue } from "../services/archive-content-export.mjs";

export default {
  name: "ArchiveReportsPage",
  components: { ArchiveExportWizard, BaseButton, BaseInput, BaseSelect },
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
      siteDirectory: [],
      siteSearch: "",
      siteStateFilter: "",
      exportWizardOpen: false,
      exportStationId: "",
      loadToken: 0,
    };
  },
  computed: {
    stationOptions() {
      const reportStations = this.reports.map((report) => report.stationId).filter(Boolean);
      const dynamicStations = this.siteDirectory.map((site) => site.value).filter(Boolean);
      const allIds = Array.from(new Set([...reportStations, ...dynamicStations])).sort();
      const map = new Map();
      for (const id of allIds) {
        const match = this.siteDirectory.find((site) => String(site.value).toUpperCase() === String(id).toUpperCase());
        map.set(String(id).toUpperCase(), { value: id, label: match?.label || this.formatStationLabel(id) });
      }
      return Array.from(map.values()).sort((left, right) => left.label.localeCompare(right.label));
    },
    siteRows() {
      return buildArchiveSiteRows(this.stationOptions, this.reports);
    },
    filteredSites() {
      const term = this.siteSearch.trim().toLowerCase();
      return this.siteRows.filter((site) => {
        if (this.siteStateFilter && site.state !== this.siteStateFilter) return false;
        return !term || `${site.label} ${site.stationId} ${site.oemSlug}`.toLowerCase().includes(term);
      });
    },
    readySiteCount() { return this.siteRows.filter((site) => site.state === "ready").length; },
  },
  mounted() {
    this.load();
  },
  methods: {
    formatStationLabel(rawId) {
      const norm = String(rawId || "").trim();
      if (!norm) return "";
      const match = tableSiteOptions.find((opt) => String(opt.value || "").toUpperCase() === norm.toUpperCase());
      return formatStationDisplayLabel(rawId, match?.label);
    },
    async load() {
      const loadToken = ++this.loadToken;
      this.loading = true;
      this.error = "";
      this.notProvisioned = false;
      const settled = await Promise.allSettled([
        loadDynamicStationOptions(undefined, true),
        fetchArchiveReportsSummary(),
        loadArchiveCatalogue(fetchArchiveReports),
      ]);

      if (loadToken !== this.loadToken) return;
      if (settled[0].status === "fulfilled") this.siteDirectory = Array.from(settled[0].value || tableSiteOptions);
      if (settled[1].status === "fulfilled") this.summary = settled[1].value;
      if (settled[2].status === "fulfilled") this.reports = settled[2].value;
      const failures = settled.filter((result) => result.status === "rejected");
      if (failures.length) {
        const messages = failures.map((result) => String(result.reason?.message || result.reason));
        // PGRST205 is PostgREST's "table missing from schema cache" -- i.e. the migration
        // has not been applied. That is a setup step, not a failure worth alarming on.
        this.notProvisioned = messages.some((message) => /PGRST205|archive_reports/i.test(message));
        if (!this.notProvisioned) this.error = messages[0];
      }
      this.loading = false;
    },
    openExport(site = null) {
      this.exportStationId = site?.stationId || "";
      this.exportWizardOpen = true;
    },
    closeExport() {
      this.exportWizardOpen = false;
      this.exportStationId = "";
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
    formatDateTime(value) {
      if (!value) return "—";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
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

.archive-reports__actions {
  display: flex;
  align-items: center;
  gap: var(--bev-space-2);
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

.archive-reports__freshness {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bev-space-3);
  padding: 0.75rem 1rem;
  border: 1px solid var(--success);
  border-radius: var(--bev-radius-md, 8px);
  background: var(--success-bg);
  color: var(--text-main);
  font-size: var(--bev-font-size-sm, 0.875rem);
}

.archive-reports__freshness--stale {
  border-color: var(--warning);
  background: var(--warning-bg);
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
.archive-reports__site-tools .archive-filter:first-child { flex: 1 1 280px; }
.archive-reports__site-tools .archive-filter:first-child :deep(input) { width: 100%; }

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

.archive-site-state {
  display: inline-flex;
  align-items: center;
  padding: 0.18rem 0.5rem;
  border-radius: var(--bev-radius-pill, 999px);
  font-size: var(--bev-font-size-2xs, 0.6875rem);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.archive-site-state--ready { color: var(--success); background: var(--success-bg); }
.archive-site-state--empty { color: var(--text-muted); background: var(--bg-page); }

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

.archive-reports__footnote {
  margin: 0;
  max-width: 78ch;
  font-size: 0.8125rem;
  line-height: var(--bev-line-normal, 1.55);
  color: var(--text-muted);
}

.archive-reports__footnote strong { color: var(--text-main); }

@media (max-width: 760px) {
  .archive-reports__actions { width: 100%; flex-direction: column; align-items: stretch; }
  .archive-reports__actions :deep(button) { width: 100%; }
  .archive-reports__freshness { align-items: flex-start; flex-direction: column; }
  .archive-reports__tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .archive-reports__filters { flex-direction: column; align-items: stretch; }
  .archive-filter :deep(select) { min-width: 0; width: 100%; }
  .archive-reports__filtercount { margin-left: 0; }
  .archive-reports__tablewrap { display: none; }
  .archive-mobile-list { display: grid; gap: var(--bev-space-3); }
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
