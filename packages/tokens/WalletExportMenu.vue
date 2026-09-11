<script setup lang="ts" generic="T extends Record<string, any>">
import WalletExportWizard from './WalletExportWizard.vue';
import type { WalletExportColumn, WalletExportMeta } from './wallet-export';
import type { WalletExportOption, WalletExportSelection } from './wallet-export-wizard';

withDefaults(defineProps<{
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
  statusLabel?: string;
  dateValue?: (row: T) => string | null | undefined;
  statusValue?: (row: T) => string | null | undefined;
  stationValue?: (row: T) => string | null | undefined;
  resolveRows?: (selection: WalletExportSelection) => Promise<T[]>;
}>(), {
  subtitle: '', meta: () => [], loading: false, label: 'Export', formats: () => ['csv', 'pdf'],
  statusOptions: () => [], stationOptions: () => [], statusLabel: 'Status',
});

const emit = defineEmits<{
  (event: 'success', payload: { format: 'csv' | 'pdf'; count: number }): void;
  (event: 'error', error: Error): void;
}>();
</script>

<template>
  <WalletExportWizard
    :rows="rows"
    :columns="columns"
    :filename="filename"
    :title="title"
    :subtitle="subtitle"
    :meta="meta"
    :loading="loading"
    :label="label"
    :formats="formats"
    :status-options="statusOptions"
    :station-options="stationOptions"
    :status-label="statusLabel"
    :date-value="dateValue"
    :status-value="statusValue"
    :station-value="stationValue"
    :resolve-rows="resolveRows"
    hover-title="Build a tailored report"
    hover-description="Choose the fields for this page."
    @success="emit('success', $event)"
    @error="emit('error', $event)"
  />
</template>
