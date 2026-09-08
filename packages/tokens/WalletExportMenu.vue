<script setup lang="ts" generic="T extends Record<string, any>">
import WalletExportWizard from './WalletExportWizard.vue';
import type { WalletExportColumn, WalletExportMeta } from './wallet-export';

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
}>(), {
  subtitle: '', meta: () => [], loading: false, label: 'Export', formats: () => ['csv', 'pdf'],
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
    hover-title="Build a tailored report"
    hover-description="Choose the fields for this page."
    @success="emit('success', $event)"
    @error="emit('error', $event)"
  />
</template>
