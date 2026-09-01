<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { exportCsv, printPdf, type WalletExportColumn, type WalletExportMeta } from './wallet-export';

const props = withDefaults(defineProps<{
  rows: T[];
  columns: WalletExportColumn<T>[];
  filename: string;
  title: string;
  subtitle?: string;
  meta?: WalletExportMeta[];
  loading?: boolean;
  label?: string;
}>(), {
  subtitle: '',
  meta: () => [],
  loading: false,
  label: 'Export',
});

const emit = defineEmits<{
  (event: 'success', payload: { format: 'csv' | 'pdf'; count: number }): void;
  (event: 'error', error: Error): void;
}>();

const root = ref<HTMLElement | null>(null);
const open = ref(false);
const busy = ref(false);
const message = ref('');
const disabled = computed(() => props.loading || busy.value || props.rows.length === 0);

function close() {
  open.value = false;
}

function toggle() {
  if (!disabled.value) open.value = !open.value;
}

function onDocumentClick(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) close();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
}

function run(format: 'csv' | 'pdf') {
  busy.value = true;
  message.value = '';
  try {
    if (format === 'csv') exportCsv(props.filename, props.rows, props.columns);
    else printPdf({ title: props.title, subtitle: props.subtitle, rows: props.rows, columns: props.columns, meta: props.meta });
    message.value = `${props.rows.length} records exported.`;
    emit('success', { format, count: props.rows.length });
    close();
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error('Export failed.');
    message.value = error.message;
    emit('error', error);
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div ref="root" class="bw-export-menu">
    <button
      type="button"
      class="bw-btn sm bw-export-trigger"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click.stop="toggle"
    >
      {{ busy ? 'Exporting…' : label }}
    </button>
    <div v-if="open" class="bw-export-panel" role="menu" aria-label="Export formats">
      <button type="button" role="menuitem" @click="run('csv')">
        <strong>Export CSV</strong>
        <span>Spreadsheet-ready records</span>
      </button>
      <button type="button" role="menuitem" @click="run('pdf')">
        <strong>Export PDF</strong>
        <span>Print-ready report</span>
      </button>
      <div class="bw-export-count">{{ rows.length }} records</div>
    </div>
    <span class="bw-sr-only" aria-live="polite">{{ message }}</span>
  </div>
</template>

