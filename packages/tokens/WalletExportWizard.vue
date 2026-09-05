<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { exportCsv, printPdf, type WalletExportColumn, type WalletExportMeta } from './wallet-export';
import type { WalletExportOption, WalletExportSelection } from './wallet-export-wizard';

const props = withDefaults(defineProps<{
  rows: T[];
  columns: WalletExportColumn<T>[];
  filename: string;
  title: string;
  subtitle?: string;
  meta?: WalletExportMeta[];
  loading?: boolean;
  label?: string;
  formats?: Array<'csv' | 'pdf'>;
  statusOptions?: WalletExportOption[];
  stationOptions?: WalletExportOption[];
  actorOptions?: WalletExportOption[];
  statusLabel?: string;
  stationLabel?: string;
  actorLabel?: string;
  allStatusLabel?: string;
  allStationLabel?: string;
  allActorLabel?: string;
  hoverTitle?: string;
  hoverDescription?: string;
  initialStatus?: string;
  initialStation?: string;
  initialActor?: string;
  initialSince?: string;
  initialUntil?: string;
  dateValue?: (row: T) => string | null | undefined;
  statusValue?: (row: T) => string | null | undefined;
  stationValue?: (row: T) => string | null | undefined;
  actorValue?: (row: T) => string | null | undefined;
  resolveRows?: (selection: WalletExportSelection) => Promise<T[]>;
}>(), {
  subtitle: '',
  meta: () => [],
  loading: false,
  label: 'Export',
  formats: () => ['csv', 'pdf'],
  statusOptions: () => [],
  stationOptions: () => [],
  actorOptions: () => [],
  statusLabel: 'Transaction status',
  stationLabel: 'StationID',
  actorLabel: 'Vendor or customer',
  allStatusLabel: 'All statuses',
  allStationLabel: 'All stations',
  allActorLabel: 'All vendors and customers',
  hoverTitle: 'Choose export contents',
  hoverDescription: 'Dates, status, station, actor.',
  initialStatus: '',
  initialStation: '',
  initialActor: '',
  initialSince: '',
  initialUntil: '',
});

const emit = defineEmits<{
  (event: 'success', payload: { format: 'csv' | 'pdf'; count: number; selection: WalletExportSelection }): void;
  (event: 'error', error: Error): void;
}>();

const open = ref(false);
const step = ref(1);
const busy = ref(false);
const message = ref('');
const format = ref<'csv' | 'pdf'>(props.formats[0] ?? 'pdf');
const since = ref(props.initialSince);
const until = ref(props.initialUntil);
const status = ref(props.initialStatus);
const station = ref(props.initialStation);
const actor = ref(props.initialActor);
const selectedColumns = ref<string[]>(props.columns.map((column) => column.key));

const disabled = computed(() => props.loading || busy.value || props.rows.length === 0);
const chosenColumns = computed(() => props.columns.filter((column) => selectedColumns.value.includes(column.key)));
const selectedScopeCount = computed(() => [since.value || until.value, status.value, station.value, actor.value].filter(Boolean).length);
const scopeSummary = computed(() => {
  const labels = [
    props.stationOptions.length ? (station.value ? props.stationOptions.find((item) => item.value === station.value)?.label : props.allStationLabel) : '',
    props.statusOptions.length ? (status.value ? props.statusOptions.find((item) => item.value === status.value)?.label : props.allStatusLabel) : '',
    props.actorOptions.length ? (actor.value ? props.actorOptions.find((item) => item.value === actor.value)?.label : props.allActorLabel) : '',
  ];
  return labels.filter(Boolean).join(' · ');
});

function reset() {
  step.value = 1;
  format.value = props.formats[0] ?? 'pdf';
  since.value = props.initialSince;
  until.value = props.initialUntil;
  status.value = props.initialStatus;
  station.value = props.initialStation;
  actor.value = props.initialActor;
  selectedColumns.value = props.columns.map((column) => column.key);
  message.value = '';
}

function show() {
  if (disabled.value) return;
  reset();
  open.value = true;
}

function close() {
  if (!busy.value) open.value = false;
}

function toggleColumn(key: string) {
  selectedColumns.value = selectedColumns.value.includes(key)
    ? selectedColumns.value.filter((item) => item !== key)
    : [...selectedColumns.value, key];
}

function rowMatches(row: T) {
  const date = props.dateValue?.(row);
  const rowStatus = props.statusValue?.(row);
  const rowStation = props.stationValue?.(row);
  const rowActor = props.actorValue?.(row);
  if (since.value && date && new Date(date) < new Date(`${since.value}T00:00:00`)) return false;
  if (until.value && date && new Date(date) > new Date(`${until.value}T23:59:59.999`)) return false;
  if (status.value && String(rowStatus ?? '') !== status.value) return false;
  if (station.value && String(rowStation ?? '') !== station.value) return false;
  if (actor.value && String(rowActor ?? '') !== actor.value) return false;
  return true;
}

function selection(): WalletExportSelection {
  return {
    format: format.value,
    since: since.value,
    until: until.value,
    status: status.value,
    station: station.value,
    actor: actor.value,
    columnKeys: [...selectedColumns.value],
  };
}

async function run() {
  if (!chosenColumns.value.length) {
    message.value = 'Select at least one field.';
    return;
  }
  if (since.value && until.value && since.value > until.value) {
    message.value = 'Start date must precede end date.';
    return;
  }
  busy.value = true;
  message.value = '';
  try {
    const currentSelection = selection();
    const sourceRows = props.resolveRows ? await props.resolveRows(currentSelection) : props.rows;
    const exportRows = props.resolveRows ? sourceRows : sourceRows.filter(rowMatches);
    if (!exportRows.length) throw new Error('No records match this scope.');
    const scopeMeta = [
      ...props.meta,
      { label: 'Scope', value: scopeSummary.value },
      { label: 'Period', value: since.value || until.value ? `${since.value || 'First record'} to ${until.value || 'Latest record'}` : 'All loaded dates' },
      { label: 'Records', value: String(exportRows.length) },
    ];
    if (format.value === 'csv') exportCsv(props.filename, exportRows, chosenColumns.value);
    else printPdf({ title: props.title, subtitle: props.subtitle, rows: exportRows, columns: chosenColumns.value, meta: scopeMeta });
    message.value = `${exportRows.length} records exported.`;
    emit('success', { format: format.value, count: exportRows.length, selection: currentSelection });
    open.value = false;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error('Export failed.');
    message.value = error.message;
    emit('error', error);
  } finally {
    busy.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) close();
}

watch(() => props.columns, (columns) => {
  if (!open.value) selectedColumns.value = columns.map((column) => column.key);
});

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="bw-export-wizard-root">
    <button
      type="button"
      class="bw-btn sm bw-export-wizard-trigger"
      :disabled="disabled"
      aria-haspopup="dialog"
      @click="show"
    >
      {{ busy ? 'Exporting…' : label }}
      <span v-if="selectedScopeCount" class="bw-export-scope-count">{{ selectedScopeCount }}</span>
    </button>
    <div class="bw-export-hover-card" role="tooltip">
      <strong>{{ hoverTitle }}</strong>
      <span>{{ hoverDescription }}</span>
      <span>Then choose fields{{ formats.length > 1 ? ' and format' : '' }}.</span>
    </div>

    <Teleport to="body">
      <Transition name="bw-export-modal">
        <div v-if="open" class="bw-export-scrim" @click.self="close">
          <section class="bw-export-dialog" role="dialog" aria-modal="true" :aria-label="`${title} export`">
            <header class="bw-export-dialog-head">
              <div>
                <span class="bw-export-kicker">Export builder</span>
                <h2>{{ title }}</h2>
                <p>{{ subtitle || 'Choose exact export contents.' }}</p>
              </div>
              <button type="button" class="bw-export-close" aria-label="Close export builder" @click="close">×</button>
            </header>

            <ol class="bw-export-steps" aria-label="Export steps">
              <li v-for="number in 3" :key="number" :class="{ active: step === number, done: step > number }">
                <span>{{ number }}</span>
                {{ number === 1 ? 'Scope' : number === 2 ? 'Fields' : 'Format' }}
              </li>
            </ol>

            <div v-if="step === 1" class="bw-export-step-panel">
              <h3>Choose record scope</h3>
              <div class="bw-export-form-grid">
                <label v-if="dateValue"><span>Start date</span><input v-model="since" type="date" class="bw-input" /></label>
                <label v-if="dateValue"><span>End date</span><input v-model="until" type="date" class="bw-input" /></label>
                <label v-if="statusOptions.length"><span>{{ statusLabel }}</span><select v-model="status" class="bw-select"><option value="">{{ allStatusLabel }}</option><option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
                <label v-if="stationOptions.length"><span>{{ stationLabel }}</span><select v-model="station" class="bw-select"><option value="">{{ allStationLabel }}</option><option v-for="option in stationOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
                <label v-if="actorOptions.length" class="wide"><span>{{ actorLabel }}</span><select v-model="actor" class="bw-select"><option value="">{{ allActorLabel }}</option><option v-for="option in actorOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
              </div>
            </div>

            <div v-else-if="step === 2" class="bw-export-step-panel">
              <div class="bw-export-step-title">
                <div><h3>Choose exported fields</h3><p>{{ selectedColumns.length }} fields selected.</p></div>
                <div class="bw-export-inline-actions"><button type="button" class="bw-btn sm" @click="selectedColumns = columns.map(column => column.key)">Select all</button><button type="button" class="bw-btn sm" @click="selectedColumns = []">Clear</button></div>
              </div>
              <div class="bw-export-field-grid">
                <label v-for="column in columns" :key="column.key" :class="{ selected: selectedColumns.includes(column.key) }">
                  <input type="checkbox" :checked="selectedColumns.includes(column.key)" @change="toggleColumn(column.key)" />
                  <span>{{ column.header }}</span>
                </label>
              </div>
            </div>

            <div v-else class="bw-export-step-panel">
              <h3>Choose export format</h3>
              <div class="bw-export-format-grid">
                <button v-if="formats.includes('csv')" type="button" :class="{ selected: format === 'csv' }" @click="format = 'csv'"><strong>CSV</strong><span>Power BI and spreadsheets</span></button>
                <button v-if="formats.includes('pdf')" type="button" :class="{ selected: format === 'pdf' }" @click="format = 'pdf'"><strong>PDF</strong><span>Printable Beverly report</span></button>
              </div>
              <dl class="bw-export-review">
                <div><dt>Scope</dt><dd>{{ scopeSummary }}</dd></div>
                <div><dt>Fields</dt><dd>{{ selectedColumns.length }} selected</dd></div>
                <div><dt>Source</dt><dd>{{ resolveRows ? 'Complete filtered dataset' : `${rows.length} loaded records` }}</dd></div>
              </dl>
            </div>

            <p v-if="message" class="bw-export-message" role="status">{{ message }}</p>
            <footer class="bw-export-dialog-actions">
              <button type="button" class="bw-btn" @click="step === 1 ? close() : step--">{{ step === 1 ? 'Cancel' : 'Back' }}</button>
              <button v-if="step < 3" type="button" class="bw-btn primary" :disabled="step === 2 && !selectedColumns.length" @click="step++">Continue</button>
              <button v-else type="button" class="bw-btn primary" :disabled="busy || !selectedColumns.length" @click="run">{{ busy ? 'Preparing…' : `Export ${format.toUpperCase()}` }}</button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
    <span class="bw-sr-only" aria-live="polite">{{ message }}</span>
  </div>
</template>
