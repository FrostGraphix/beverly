<script setup lang="ts">
import { ref, computed } from 'vue';
import WalletDataViewSwitch from './WalletDataViewSwitch.vue';

export interface FilterOption {
  label: string;
  value: string;
}

const props = withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    totalCount?: number;
    loading?: boolean;
    searchQuery?: string;
    searchPlaceholder?: string;
    statusFilter?: string;
    statusOptions?: FilterOption[];
    exportRange?: string;
    rangeOptions?: FilterOption[];
    exporting?: boolean;
    exportLabel?: string;
    viewMode?: 'table' | 'list';
    showViewSwitch?: boolean;
    showExport?: boolean;
    showStatusFilter?: boolean;
    showSearch?: boolean;
  }>(),
  {
    title: '',
    subtitle: '',
    totalCount: 0,
    loading: false,
    searchQuery: '',
    searchPlaceholder: 'Search...',
    statusFilter: 'all',
    statusOptions: () => [
      { label: 'All', value: 'all' },
      { label: 'Delivered', value: 'delivered' },
      { label: 'Pending', value: 'pending' },
      { label: 'Failed', value: 'failed' },
    ],
    exportRange: '30d',
    rangeOptions: () => [
      { label: 'Last day', value: '1d' },
      { label: 'Last 7 days', value: '7d' },
      { label: 'Last 30 days', value: '30d' },
      { label: 'All time', value: 'all' },
    ],
    exporting: false,
    exportLabel: 'Export CSV',
    viewMode: 'table',
    showViewSwitch: true,
    showExport: true,
    showStatusFilter: true,
    showSearch: true,
  }
);

const emit = defineEmits<{
  (e: 'update:searchQuery', val: string): void;
  (e: 'update:statusFilter', val: string): void;
  (e: 'update:exportRange', val: string): void;
  (e: 'update:viewMode', val: 'table' | 'list'): void;
  (e: 'export'): void;
  (e: 'reset'): void;
}>();

const showFilters = ref(false);

const activeFilterCount = computed(() => {
  let count = 0;
  if (props.searchQuery && props.searchQuery.trim() !== '') count++;
  if (props.statusFilter && props.statusFilter !== 'all') count++;
  if (props.exportRange && props.exportRange !== '30d' && props.exportRange !== 'all') count++;
  return count;
});

function toggleFilters() {
  showFilters.value = !showFilters.value;
}

function handleSearchInput(e: Event) {
  emit('update:searchQuery', (e.target as HTMLInputElement).value);
}

function handleStatusSelect(val: string) {
  emit('update:statusFilter', val);
}

function handleRangeChange(e: Event) {
  emit('update:exportRange', (e.target as HTMLSelectElement).value);
}

function handleViewModeChange(val: 'table' | 'list') {
  emit('update:viewMode', val);
}

function handleExportClick() {
  emit('export');
}
</script>

<template>
  <div class="bw-table-filter-bar-container">
    <div class="bw-table-head-bar recent-head-bar">
      <div class="recent-heading">
        <div class="recent-title-row">
          <div v-if="title" class="bw-card-title">{{ title }}</div>
          <span v-if="loading" class="bw-skeleton recent-count-skeleton" aria-hidden="true"></span>
          <span v-else-if="totalCount !== undefined" class="recent-count">{{ totalCount }}</span>
        </div>
        <div v-if="subtitle" class="bw-card-sub">{{ subtitle }}</div>
      </div>
      <div class="recent-actions">
        <WalletDataViewSwitch
          v-if="showViewSwitch"
          :model-value="viewMode"
          label="Display view"
          @update:model-value="handleViewModeChange"
        />
        <button
          type="button"
          class="bw-btn sm recent-filter-button"
          :class="{ active: showFilters || activeFilterCount > 0 }"
          :aria-expanded="showFilters"
          title="Filter records"
          @click="toggleFilters"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <span class="recent-action-label">Filter</span>
          <span v-if="activeFilterCount" class="recent-filter-count">{{ activeFilterCount }}</span>
        </button>
      </div>
    </div>

    <!-- Expanded filter panel -->
    <div v-if="showFilters" class="recent-filter-panel">
      <div class="recent-filter-grid">
        <div v-if="showSearch" class="filter-group search-group">
          <label class="filter-label">Search</label>
          <input
            :value="searchQuery"
            type="text"
            class="bw-input bw-input-sm"
            :placeholder="searchPlaceholder"
            @input="handleSearchInput"
          />
        </div>

        <div v-if="showStatusFilter && statusOptions.length" class="filter-group full-width">
          <label class="filter-label">Filter Type</label>
          <div class="recent-tabs-row">
            <button
              v-for="opt in statusOptions"
              :key="opt.value"
              type="button"
              :class="['bw-btn sm', statusFilter === opt.value ? 'primary' : '']"
              @click="handleStatusSelect(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div v-if="showExport" class="filter-group">
          <label class="filter-label">Period</label>
          <select :value="exportRange" class="bw-select bw-select-sm" @change="handleRangeChange">
            <option v-for="opt in rangeOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div v-if="showExport" class="filter-group">
          <label class="filter-label">Actions</label>
          <button type="button" class="bw-btn sm primary" :disabled="exporting" @click="handleExportClick">
            {{ exporting ? 'Exporting...' : exportLabel }}
          </button>
        </div>
      </div>
    </div>

    <!-- Mobile filter pills -->
    <div v-if="showStatusFilter && statusOptions.length" class="bw-filter-bar">
      <button
        v-for="opt in statusOptions"
        :key="opt.value"
        type="button"
        :class="['bw-filter-pill', statusFilter === opt.value ? 'active' : '']"
        @click="handleStatusSelect(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.bw-table-filter-bar-container {
  width: 100%;
}
</style>
