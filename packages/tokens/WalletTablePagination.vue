<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    page?: number;
    pageSize?: number;
    totalItems?: number;
    itemLabel?: string;
    loading?: boolean;
  }>(),
  {
    page: 1,
    pageSize: 10,
    totalItems: 0,
    itemLabel: 'matching items',
    loading: false,
  }
);

const emit = defineEmits<{
  (e: 'update:page', page: number): void;
  (e: 'update:pageSize', pageSize: number): void;
  (e: 'change', payload: { page: number; pageSize: number }): void;
}>();

const totalPages = computed(() => {
  const count = Math.ceil(props.totalItems / (props.pageSize || 10));
  return Math.max(1, count);
});

const fromIndex = computed(() => {
  if (props.totalItems === 0) return 0;
  return (props.page - 1) * props.pageSize + 1;
});

const toIndex = computed(() => {
  return Math.min(props.page * props.pageSize, props.totalItems);
});

function changePage(newPage: number) {
  if (newPage < 1 || newPage > totalPages.value || newPage === props.page) return;
  emit('update:page', newPage);
  emit('change', { page: newPage, pageSize: props.pageSize });
}

function onPageSizeChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  const newSize = Number(target.value) || 10;
  emit('update:pageSize', newSize);
  emit('update:page', 1);
  emit('change', { page: 1, pageSize: newSize });
}
</script>

<template>
  <div v-if="loading" class="bw-pagination-bar dashboard-pagination-skeleton" aria-hidden="true">
    <span class="bw-skeleton dashboard-pagination-skeleton-copy"></span>
    <span class="bw-skeleton dashboard-pagination-skeleton-actions"></span>
  </div>
  <div v-else-if="totalItems > 0" class="bw-pagination-bar">
    <div class="bw-pagination-info">
      Showing {{ fromIndex }}–{{ toIndex }} of {{ totalItems }} {{ itemLabel }}
    </div>
    <div class="bw-pagination-controls">
      <label class="filter-label inline" style="margin: 0; flex-direction: row; align-items: center; gap: 6px;">
        <span>Per page</span>
        <select
          :value="pageSize"
          class="bw-select bw-select-sm"
          style="width: auto"
          aria-label="Rows per page"
          @change="onPageSizeChange"
        >
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </label>
      <button
        type="button"
        class="bw-btn sm ghost"
        :disabled="page <= 1"
        aria-label="Previous page"
        @click="changePage(page - 1)"
      >
        Previous
      </button>
      <span class="bw-page-num" style="font-size: var(--t-xs); font-weight: 600; color: var(--text-muted)">
        Page {{ page }} of {{ totalPages }}
      </span>
      <button
        type="button"
        class="bw-btn sm ghost"
        :disabled="page >= totalPages"
        aria-label="Next page"
        @click="changePage(page + 1)"
      >
        Next
      </button>
    </div>
  </div>
</template>
