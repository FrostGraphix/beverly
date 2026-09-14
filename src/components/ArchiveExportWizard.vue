<template>
  <div ref="dialogBackdrop" class="archive-wizard-backdrop" role="presentation" @click.self="requestClose" @keydown.esc="requestClose" @keydown.tab="trapFocus">
    <BaseModalShell class="archive-wizard" role="dialog" aria-modal="true" aria-labelledby="archive-wizard-title">
      <template #header>
        <div class="archive-wizard__header">
          <div>
            <span class="archive-wizard__eyebrow">Archive export</span>
            <h2 id="archive-wizard-title" ref="title" tabindex="-1">Build a report bundle</h2>
            <p>Select sites, report coverage, and file format.</p>
          </div>
          <BaseIconButton class="archive-wizard__close" aria-label="Close export wizard" :disabled="exporting" @click="requestClose">×</BaseIconButton>
        </div>
      </template>

      <ol v-if="!complete" class="archive-wizard__steps" aria-label="Export progress">
        <li v-for="item in steps" :key="item.id" :class="{ active: step === item.id, done: step > item.id }" :aria-current="step === item.id ? 'step' : null">
          <span>{{ step > item.id ? '✓' : item.id }}</span>
          <strong>{{ item.label }}</strong>
        </li>
      </ol>

      <section v-if="complete" class="archive-wizard__complete" aria-live="polite">
        <span class="archive-wizard__success">✓</span>
        <h3>Archive bundle downloaded</h3>
        <p>{{ completedFilename }}</p>
        <dl>
          <div><dt>Files</dt><dd>{{ matchedReports.length }}</dd></div>
          <div><dt>Sites</dt><dd>{{ selectedSiteCount }}</dd></div>
          <div><dt>Format</dt><dd>{{ selection.format === 'csv' ? 'Spreadsheet CSV' : 'Original CSV.gz' }}</dd></div>
        </dl>
      </section>

      <section v-else-if="step === 1" class="archive-wizard__panel" aria-labelledby="archive-sites-title">
        <div class="archive-wizard__sectionhead">
          <div><span>Step 1</span><h3 id="archive-sites-title">Choose archive sites</h3></div>
          <BaseButton variant="quiet" size="sm" class="archive-wizard__link" @click="toggleVisibleSites">{{ allVisibleSelected ? 'Clear visible' : 'Select visible' }}</BaseButton>
        </div>
        <label class="archive-wizard__search">
          <span>Search sites</span>
          <BaseInput v-model="siteSearch" type="search" placeholder="Site name or StationID" autocomplete="off" />
        </label>
        <div class="archive-wizard__site-list" role="group" aria-label="Available archive sites">
          <div v-for="site in visibleSites" :key="site.stationId" class="archive-wizard__site" :class="{ selected: selection.stationIds.includes(site.stationId) }">
            <BaseCheckbox
              :model-value="selection.stationIds.includes(site.stationId)"
              :disabled="site.state !== 'ready'"
              :aria-label="`Select ${site.label}`"
              @update:model-value="toggleSite(site.stationId, $event)"
            />
            <span class="archive-wizard__site-copy">
              <strong>{{ site.label }}</strong>
              <small>{{ site.state === 'ready' ? `${site.reportCount} files · ${formatRange(site.coversFrom, site.coversTo)}` : 'No archives available' }}</small>
            </span>
            <span :class="['archive-wizard__status', `archive-wizard__status--${site.state}`]">{{ site.state === 'ready' ? 'Ready' : 'Empty' }}</span>
          </div>
          <p v-if="!visibleSites.length" class="archive-wizard__empty">No sites match your search.</p>
        </div>
      </section>

      <section v-else-if="step === 2" class="archive-wizard__panel" aria-labelledby="archive-options-title">
        <div class="archive-wizard__sectionhead">
          <div><span>Step 2</span><h3 id="archive-options-title">Define report coverage</h3></div>
          <small>{{ selectedSiteCount }} sites selected</small>
        </div>
        <div class="archive-wizard__formgrid">
          <fieldset class="archive-wizard__fieldset archive-wizard__span-two">
            <legend>Report types</legend>
            <div v-for="type in availableReportTypes" :key="type" class="archive-wizard__check">
              <BaseCheckbox
                :model-value="selection.reportTypes.includes(type)"
                :aria-label="`Include ${titleCase(type)}`"
                @update:model-value="toggleReportType(type, $event)"
              />
              <span><strong>{{ titleCase(type) }}</strong><small>{{ type === 'readings' ? 'Meter readings and telemetry' : 'Vend and recharge transactions' }}</small></span>
            </div>
          </fieldset>
          <label class="archive-wizard__field">
            <span>From date</span>
            <BaseInput v-model="selection.from" type="date" :min="coverageBounds.from" :max="selection.to || coverageBounds.to" />
          </label>
          <label class="archive-wizard__field">
            <span>Through date</span>
            <BaseInput v-model="selection.to" type="date" :min="selection.from || coverageBounds.from" :max="coverageBounds.to" />
          </label>
          <label class="archive-wizard__field archive-wizard__span-two">
            <span>Archive grain</span>
            <BaseSelect v-model="selection.granularity">
              <option value="monthly">Monthly partitions</option>
              <option value="yearly">Yearly bundles</option>
            </BaseSelect>
            <small>Monthly gives precise ranges. Yearly minimizes files.</small>
          </label>
          <fieldset class="archive-wizard__fieldset archive-wizard__span-two">
            <legend>Bundle contents</legend>
            <BaseButton role="radio" :aria-checked="selection.format === 'gzip'" variant="quiet" class="archive-wizard__choice" :class="{ selected: selection.format === 'gzip' }" @click="selection.format = 'gzip'">
              <span><strong>Original archives</strong><small>Preserves verified CSV.gz files inside one TAR bundle.</small></span>
              <em>Recommended</em>
            </BaseButton>
            <BaseButton role="radio" :aria-checked="selection.format === 'csv'" variant="quiet" class="archive-wizard__choice" :class="{ selected: selection.format === 'csv', disabled: !csvAvailable }" :disabled="!csvAvailable" @click="selection.format = 'csv'">
              <span><strong>Spreadsheet files</strong><small>{{ csvAvailable ? 'Expands each archive into CSV files inside one TAR bundle.' : 'Browser conversion is unavailable for this selection.' }}</small></span>
            </BaseButton>
          </fieldset>
        </div>
        <p class="archive-wizard__notice">Date ranges include complete intersecting partitions.</p>
      </section>

      <section v-else class="archive-wizard__panel" aria-labelledby="archive-review-title">
        <div class="archive-wizard__sectionhead">
          <div><span>Step 3</span><h3 id="archive-review-title">Review archive bundle</h3></div>
          <span class="archive-wizard__ready">Ready</span>
        </div>
        <div class="archive-wizard__review-grid">
          <div><span>Sites</span><strong>{{ selectedSiteCount }}</strong></div>
          <div><span>Files</span><strong>{{ matchedReports.length }}</strong></div>
          <div><span>Source rows</span><strong>{{ formatNumber(matchedRows) }}</strong></div>
          <div><span>Compressed size</span><strong>{{ formatSize(matchedBytes) }}</strong></div>
        </div>
        <dl class="archive-wizard__review-details">
          <div><dt>Coverage</dt><dd>{{ formatRange(selection.from, selection.to) }}</dd></div>
          <div><dt>Reports</dt><dd>{{ selection.reportTypes.map(titleCase).join(', ') }}</dd></div>
          <div><dt>Grain</dt><dd>{{ titleCase(selection.granularity) }}</dd></div>
          <div><dt>Output</dt><dd>{{ selection.format === 'csv' ? 'Spreadsheet CSV bundle' : 'Verified archive bundle' }}</dd></div>
        </dl>
        <div class="archive-wizard__manifest">
          <div class="archive-wizard__manifest-head"><strong>Bundle manifest</strong><span>{{ matchedReports.length }} files</span></div>
          <ul>
            <li v-for="report in matchedReports.slice(0, 8)" :key="report.id">
              <span>{{ siteLabel(report.stationId) }}</span>
              <small>{{ titleCase(report.reportType) }} · {{ formatRange(report.coversFrom, report.coversTo) }}</small>
            </li>
          </ul>
          <p v-if="matchedReports.length > 8">Plus {{ matchedReports.length - 8 }} more files.</p>
        </div>
        <div v-if="exporting" class="archive-wizard__progress" aria-live="polite">
          <span><i :style="{ width: `${progressPercent}%` }"></i></span>
          <p>Preparing {{ progress.completed }} of {{ progress.total }} files.</p>
        </div>
      </section>

      <p v-if="error" class="archive-wizard__error" role="alert">{{ error }}</p>

      <template #footer>
        <div class="archive-wizard__actions">
          <BaseButton v-if="complete" variant="primary" @click="requestClose">Done</BaseButton>
          <template v-else>
            <BaseButton variant="ghost" :disabled="exporting" @click="step === 1 ? requestClose() : previousStep()">{{ step === 1 ? 'Cancel' : 'Back' }}</BaseButton>
            <BaseButton v-if="step < 3" variant="primary" :disabled="exporting" @click="nextStep">Continue</BaseButton>
            <BaseButton v-else variant="primary" :disabled="exporting || !matchedReports.length" @click="exportBundle">{{ exporting ? 'Preparing bundle…' : `Download ${matchedReports.length} files` }}</BaseButton>
          </template>
        </div>
      </template>
    </BaseModalShell>
  </div>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseCheckbox from "./base/BaseCheckbox.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseModalShell from "./base/BaseModalShell.vue";
import BaseSelect from "./base/BaseSelect.vue";
import { requestArchiveDownloadUrl } from "../services/consumption-service.mjs";
import {
  buildArchiveBundle,
  canExpandArchive,
  selectArchiveReports,
} from "../services/archive-content-export.mjs";

export default {
  name: "ArchiveExportWizard",
  components: { BaseButton, BaseCheckbox, BaseIconButton, BaseInput, BaseModalShell, BaseSelect },
  props: {
    reports: { type: Array, default: () => [] },
    sites: { type: Array, default: () => [] },
    initialStationId: { type: String, default: "" },
  },
  emits: ["close"],
  data() {
    return {
      step: 1,
      steps: [{ id: 1, label: "Sites" }, { id: 2, label: "Report" }, { id: 3, label: "Review" }],
      siteSearch: "",
      selection: { stationIds: [], reportTypes: ["readings"], granularity: "monthly", from: "", to: "", format: "gzip" },
      exporting: false,
      progress: { completed: 0, total: 0 },
      error: "",
      complete: false,
      completedFilename: "",
      previousActiveElement: null,
      previousBodyOverflow: "",
    };
  },
  computed: {
    readySites() { return this.sites.filter((site) => site.state === "ready"); },
    visibleSites() {
      const term = this.siteSearch.trim().toLowerCase();
      if (!term) return this.sites;
      return this.sites.filter((site) => `${site.label} ${site.stationId}`.toLowerCase().includes(term));
    },
    allVisibleSelected() {
      const ready = this.visibleSites.filter((site) => site.state === "ready");
      return ready.length > 0 && ready.every((site) => this.selection.stationIds.includes(site.stationId));
    },
    selectedSiteCount() { return this.selection.stationIds.length; },
    selectedReports() {
      const stations = new Set(this.selection.stationIds.map((value) => value.toUpperCase()));
      return this.reports.filter((report) => stations.has(String(report.stationId || "").toUpperCase()));
    },
    coverageBounds() {
      return this.selectedReports.reduce((bounds, report) => ({
        from: !bounds.from || report.coversFrom < bounds.from ? report.coversFrom : bounds.from,
        to: !bounds.to || report.coversTo > bounds.to ? report.coversTo : bounds.to,
      }), { from: "", to: "" });
    },
    availableReportTypes() {
      return Array.from(new Set(this.selectedReports.map((report) => report.reportType).filter(Boolean))).sort();
    },
    matchedReports() { return selectArchiveReports(this.reports, this.selection); },
    matchedRows() { return this.matchedReports.reduce((sum, report) => sum + Number(report.rowCount || 0), 0); },
    matchedBytes() { return this.matchedReports.reduce((sum, report) => sum + Number(report.byteSize || 0), 0); },
    csvAvailable() { return this.matchedReports.every(canExpandArchive); },
    progressPercent() { return this.progress.total ? Math.round((this.progress.completed / this.progress.total) * 100) : 0; },
  },
  watch: {
    coverageBounds: {
      immediate: true,
      deep: true,
      handler(bounds) {
        if (!this.selection.from && bounds.from) this.selection.from = bounds.from;
        if (!this.selection.to && bounds.to) this.selection.to = bounds.to;
      },
    },
    csvAvailable(value) { if (!value && this.selection.format === "csv") this.selection.format = "gzip"; },
  },
  mounted() {
    this.previousActiveElement = document.activeElement;
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const initial = this.readySites.find((site) => site.stationId.toUpperCase() === this.initialStationId.toUpperCase());
    if (initial) this.selection.stationIds = [initial.stationId];
    else if (this.readySites.length === 1) this.selection.stationIds = [this.readySites[0].stationId];
    this.$nextTick(() => this.$refs.title?.focus());
  },
  beforeUnmount() {
    document.body.style.overflow = this.previousBodyOverflow;
    this.previousActiveElement?.focus?.();
  },
  methods: {
    requestClose() { if (!this.exporting) this.$emit("close"); },
    trapFocus(event) {
      const focusable = Array.from(this.$refs.dialogBackdrop?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ) || []).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    toggleSite(stationId, checked) {
      this.selection.stationIds = checked
        ? Array.from(new Set([...this.selection.stationIds, stationId]))
        : this.selection.stationIds.filter((id) => id !== stationId);
    },
    toggleReportType(reportType, checked) {
      this.selection.reportTypes = checked
        ? Array.from(new Set([...this.selection.reportTypes, reportType]))
        : this.selection.reportTypes.filter((type) => type !== reportType);
    },
    toggleVisibleSites() {
      const visible = this.visibleSites.filter((site) => site.state === "ready").map((site) => site.stationId);
      if (this.allVisibleSelected) this.selection.stationIds = this.selection.stationIds.filter((id) => !visible.includes(id));
      else this.selection.stationIds = Array.from(new Set([...this.selection.stationIds, ...visible]));
    },
    previousStep() { this.error = ""; this.step = Math.max(1, this.step - 1); },
    nextStep() {
      this.error = "";
      if (this.step === 1 && !this.selection.stationIds.length) { this.error = "Choose at least one archived site."; return; }
      if (this.step === 2) {
        if (!this.selection.reportTypes.length) { this.error = "Choose at least one report type."; return; }
        if (!this.selection.from || !this.selection.to) { this.error = "Choose both coverage dates."; return; }
        if (this.selection.from > this.selection.to) { this.error = "The starting date must come first."; return; }
        if (!this.matchedReports.length) { this.error = "No archived files match this selection."; return; }
        if (this.matchedReports.length > 100) { this.error = "Choose a smaller range. Bundles support 100 files."; return; }
      }
      this.step = Math.min(3, this.step + 1);
    },
    async exportBundle() {
      this.error = "";
      this.exporting = true;
      this.progress = { completed: 0, total: this.matchedReports.length };
      try {
        const result = await buildArchiveBundle(this.matchedReports, {
          format: this.selection.format,
          requestDownload: requestArchiveDownloadUrl,
          onProgress: (progress) => { this.progress = progress; },
        });
        const url = URL.createObjectURL(result.blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = result.filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.completedFilename = result.filename;
        this.complete = true;
      } catch (error) {
        this.error = String(error?.message || error);
      } finally {
        this.exporting = false;
      }
    },
    siteLabel(stationId) { return this.sites.find((site) => site.stationId === stationId)?.label || stationId; },
    formatRange(from, to) { return from && to ? `${from} – ${to}` : "Unavailable"; },
    formatNumber(value) { return Number(value || 0).toLocaleString(); },
    formatSize(bytes) {
      const size = Number(bytes || 0);
      if (size < 1024) return `${size} B`;
      if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`;
      return `${(size / 1048576).toFixed(2)} MB`;
    },
    titleCase(value) { const text = String(value || ""); return text ? text.charAt(0).toUpperCase() + text.slice(1) : ""; },
  },
};
</script>

<style scoped>
.archive-wizard-backdrop { position: fixed; inset: 0; z-index: 11000; display: grid; place-items: center; padding: 16px; background: rgb(0 0 0 / 72%); }
.archive-wizard { width: min(720px, calc(100vw - 24px)); }
.archive-wizard__header { display: flex; justify-content: space-between; gap: 16px; }
.archive-wizard__eyebrow, .archive-wizard__sectionhead span { color: var(--primary); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.archive-wizard__header h2 { margin: 3px 0 4px; color: var(--text-strong); font-size: 21px; }
.archive-wizard__header p { margin: 0; color: var(--text-muted); font-size: 13px; }
.archive-wizard__close { align-self: flex-start; width: 40px; height: 40px; border: 1px solid var(--border-color); border-radius: var(--bev-radius-md, 8px); background: transparent; color: var(--text-muted); font-size: 24px; cursor: pointer; }
.archive-wizard__close:focus-visible, .archive-wizard__link:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.archive-wizard__steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0 0 22px; padding: 0; list-style: none; }
.archive-wizard__steps li { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 12px; }
.archive-wizard__steps li::after { content: ""; flex: 1; height: 1px; background: var(--border-color); }
.archive-wizard__steps li:last-child::after { display: none; }
.archive-wizard__steps li > span { display: grid; place-items: center; width: 26px; height: 26px; border: 1px solid var(--border-color); border-radius: 50%; }
.archive-wizard__steps li.active, .archive-wizard__steps li.done { color: var(--text-strong); }
.archive-wizard__steps li.active > span, .archive-wizard__steps li.done > span { border-color: var(--primary); background: var(--primary); color: var(--on-primary, #fff); }
.archive-wizard__panel { display: grid; gap: 16px; }
.archive-wizard__sectionhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.archive-wizard__sectionhead h3 { margin: 3px 0 0; color: var(--text-strong); font-size: 17px; }
.archive-wizard__sectionhead small { color: var(--text-muted); }
.archive-wizard__link { border: 0; background: transparent; color: var(--primary); font: inherit; font-weight: 700; cursor: pointer; }
.archive-wizard__search, .archive-wizard__field { display: grid; gap: 6px; color: var(--text-muted); font-size: 12px; font-weight: 700; }
.archive-wizard__site-list { display: grid; gap: 8px; max-height: 310px; overflow: auto; padding-right: 3px; }
.archive-wizard__site { display: flex; align-items: center; gap: 12px; min-height: 58px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: var(--bev-radius-md, 8px); background: var(--bg-card); cursor: pointer; }
.archive-wizard__site.selected { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, var(--bg-card)); }
.archive-wizard__site:has(input:disabled) { opacity: .6; cursor: not-allowed; }
.archive-wizard__site input, .archive-wizard__check input, .archive-wizard__choice input { accent-color: var(--primary); }
.archive-wizard__site-copy { display: grid; gap: 3px; min-width: 0; flex: 1; }
.archive-wizard__site-copy strong { overflow: hidden; color: var(--text-strong); text-overflow: ellipsis; white-space: nowrap; }
.archive-wizard__site-copy small { color: var(--text-muted); }
.archive-wizard__status { padding: 3px 7px; border-radius: 999px; font-size: 10px; font-weight: 800; text-transform: uppercase; }
.archive-wizard__status--ready { color: var(--success); background: var(--success-bg); }
.archive-wizard__status--empty { color: var(--text-muted); background: var(--bg-page); }
.archive-wizard__empty { margin: 20px; text-align: center; color: var(--text-muted); }
.archive-wizard__formgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.archive-wizard__span-two { grid-column: 1 / -1; }
.archive-wizard__fieldset { display: grid; gap: 8px; min-width: 0; margin: 0; padding: 0; border: 0; }
.archive-wizard__fieldset legend { margin-bottom: 7px; color: var(--text-muted); font-size: 12px; font-weight: 700; }
.archive-wizard__check { display: flex; align-items: flex-start; gap: 10px; padding: 9px 11px; border: 1px solid var(--border-color); border-radius: var(--bev-radius-md, 8px); }
.archive-wizard__check span, .archive-wizard__choice span { display: grid; gap: 2px; }
.archive-wizard__check strong, .archive-wizard__choice strong { color: var(--text-strong); font-size: 13px; }
.archive-wizard__check small, .archive-wizard__choice small, .archive-wizard__field small { color: var(--text-muted); font-weight: 400; }
.archive-wizard__choice { position: relative; display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--bev-radius-md, 8px); cursor: pointer; }
.archive-wizard__choice.selected { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, var(--bg-card)); }
.archive-wizard__choice.disabled { opacity: .55; cursor: not-allowed; }
.archive-wizard__choice em { margin-left: auto; color: var(--primary); font-size: 10px; font-style: normal; font-weight: 800; text-transform: uppercase; }
.archive-wizard__notice { margin: 0; padding: 10px 12px; border-left: 3px solid var(--info); background: var(--info-bg); color: var(--text-muted); font-size: 12px; }
.archive-wizard__ready { padding: 4px 8px; border-radius: 999px; color: var(--success) !important; background: var(--success-bg); }
.archive-wizard__review-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.archive-wizard__review-grid div { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--bev-radius-md, 8px); background: var(--bg-card); }
.archive-wizard__review-grid span, .archive-wizard__review-details dt { color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase; }
.archive-wizard__review-grid strong { color: var(--text-strong); font-size: 17px; }
.archive-wizard__review-details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px 20px; margin: 0; }
.archive-wizard__review-details div { min-width: 0; }
.archive-wizard__review-details dd { margin: 3px 0 0; color: var(--text-main); overflow-wrap: anywhere; }
.archive-wizard__manifest { overflow: hidden; border: 1px solid var(--border-color); border-radius: var(--bev-radius-md, 8px); }
.archive-wizard__manifest-head { display: flex; justify-content: space-between; padding: 9px 12px; background: var(--bg-page); color: var(--text-main); font-size: 12px; }
.archive-wizard__manifest ul { display: grid; margin: 0; padding: 0; list-style: none; }
.archive-wizard__manifest li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 12px; border-top: 1px solid var(--border-color); color: var(--text-main); font-size: 12px; }
.archive-wizard__manifest li small { color: var(--text-muted); text-align: right; }
.archive-wizard__manifest > p { margin: 0; padding: 8px 12px; border-top: 1px solid var(--border-color); color: var(--text-muted); font-size: 12px; }
.archive-wizard__progress > span { display: block; height: 6px; overflow: hidden; border-radius: 999px; background: var(--border-color); }
.archive-wizard__progress i { display: block; height: 100%; background: var(--primary); transition: width .16s ease; }
.archive-wizard__progress p { margin: 6px 0 0; color: var(--text-muted); font-size: 12px; }
.archive-wizard__error { margin: 14px 0 0; padding: 10px 12px; border: 1px solid var(--danger); border-radius: var(--bev-radius-md, 8px); color: var(--danger); background: var(--danger-bg); }
.archive-wizard__actions { display: flex; justify-content: flex-end; gap: 8px; width: 100%; }
.archive-wizard__complete { display: grid; justify-items: center; gap: 8px; padding: 30px 10px; text-align: center; }
.archive-wizard__success { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; background: var(--success-bg); color: var(--success); font-size: 25px; }
.archive-wizard__complete h3 { margin: 4px 0 0; color: var(--text-strong); }
.archive-wizard__complete p { margin: 0; color: var(--text-muted); overflow-wrap: anywhere; }
.archive-wizard__complete dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; margin: 14px 0 0; }
.archive-wizard__complete dl div { padding: 10px; border: 1px solid var(--border-color); border-radius: var(--bev-radius-md, 8px); }
.archive-wizard__complete dt { color: var(--text-muted); font-size: 10px; text-transform: uppercase; }
.archive-wizard__complete dd { margin: 4px 0 0; color: var(--text-strong); font-weight: 700; }
@media (max-width: 620px) {
  .archive-wizard-backdrop { place-items: end center; padding: 0; }
  .archive-wizard { width: 100vw; max-height: calc(100dvh - 8px); border-radius: var(--bev-radius-lg, 14px) var(--bev-radius-lg, 14px) 0 0; }
  .archive-wizard__steps strong { display: none; }
  .archive-wizard__formgrid, .archive-wizard__review-details { grid-template-columns: 1fr; }
  .archive-wizard__span-two { grid-column: auto; }
  .archive-wizard__review-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .archive-wizard__manifest li { display: grid; gap: 2px; }
  .archive-wizard__manifest li small { text-align: left; }
  .archive-wizard__actions > * { flex: 1; }
}
@media (prefers-reduced-motion: reduce) { .archive-wizard__progress i { transition: none; } }
</style>
