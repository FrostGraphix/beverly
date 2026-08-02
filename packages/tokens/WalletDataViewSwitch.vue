<script setup lang="ts">
type DataView = 'grid' | 'list' | 'table';

const icons: Record<DataView, string[]> = {
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  table: ['M3 4h18v16H3z', 'M3 10h18', 'M3 16h18', 'M9 4v16', 'M15 4v16'],
};

withDefaults(defineProps<{
  modelValue: DataView;
  modes?: DataView[];
  label?: string;
}>(), {
  modes: () => ['grid', 'list', 'table'],
  label: 'Display view',
});

const emit = defineEmits<{
  'update:modelValue': [value: DataView];
}>();
</script>

<template>
  <div class="bw-data-view-switch" role="group" :aria-label="label">
    <button
      v-for="mode in modes"
      :key="mode"
      type="button"
      :class="['bw-data-view-option', { active: modelValue === mode }]"
      :aria-label="`${mode} view`"
      :aria-pressed="modelValue === mode"
      :title="`${mode} view`"
      @click="emit('update:modelValue', mode)"
    >
      <svg class="bw-data-view-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path v-for="path in icons[mode]" :key="path" :d="path" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.bw-data-view-switch {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-2);
}

.bw-data-view-option {
  min-height: 34px;
  min-width: 40px;
  padding: 0 10px;
  border: 0;
  border-radius: calc(var(--r-md) - 3px);
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: var(--t-xs);
  font-weight: 700;
  cursor: pointer;
}

.bw-data-view-icon {
  display: block;
  width: 18px;
  height: 18px;
  margin: auto;
}

.bw-data-view-option:hover { color: var(--text); }
.bw-data-view-option.active { background: var(--surface); color: var(--brand); box-shadow: var(--shadow-xs); }
.bw-data-view-option:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
</style>
