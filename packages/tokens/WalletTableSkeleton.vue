<script setup lang="ts">
withDefaults(defineProps<{
  columns?: number;
  rows?: number;
  variant?: 'rows' | 'cards';
}>(), {
  columns: 5,
  rows: 4,
  variant: 'rows',
});
</script>

<template>
  <template v-if="variant === 'rows'">
    <tr v-for="row in rows" :key="`wallet-table-skeleton-${row}`" class="wallet-table-skeleton-row" aria-hidden="true">
      <td v-for="column in columns" :key="column">
        <span :class="['bw-skeleton', 'wallet-table-skeleton-line', `column-${((column - 1) % 5) + 1}`]"></span>
        <span v-if="column === 2" class="bw-skeleton wallet-table-skeleton-line secondary"></span>
      </td>
    </tr>
  </template>

  <template v-else>
    <div v-for="row in rows" :key="`wallet-card-skeleton-${row}`" class="bw-tc wallet-card-skeleton" aria-hidden="true">
      <div class="bw-tc-top">
        <span class="wallet-card-skeleton-copy">
          <span class="bw-skeleton wallet-card-skeleton-title"></span>
          <span class="bw-skeleton wallet-card-skeleton-meta"></span>
        </span>
        <span class="bw-skeleton wallet-card-skeleton-amount"></span>
      </div>
      <div class="bw-tc-mid">
        <span class="bw-skeleton wallet-card-skeleton-detail"></span>
        <span class="bw-skeleton wallet-card-skeleton-detail short"></span>
      </div>
    </div>
  </template>
</template>

<style scoped>
.wallet-table-skeleton-row .bw-skeleton,
.wallet-card-skeleton .bw-skeleton {
  display: block;
  min-height: 0;
}
.wallet-table-skeleton-line {
  width: 76%;
  height: 10px;
  border-radius: var(--r-pill);
}
.wallet-table-skeleton-line.column-2 { width: 88%; }
.wallet-table-skeleton-line.column-3 { width: 62%; }
.wallet-table-skeleton-line.column-4 { width: 72%; }
.wallet-table-skeleton-line.column-5 { width: 54%; }
.wallet-table-skeleton-line.secondary {
  width: 58%;
  height: 8px;
  margin-top: 7px;
}
.wallet-card-skeleton {
  pointer-events: none;
}
.wallet-card-skeleton-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 7px;
}
.wallet-card-skeleton-title {
  width: min(150px, 72%);
  height: 11px;
  border-radius: var(--r-pill);
}
.wallet-card-skeleton-meta {
  width: min(104px, 54%);
  height: 8px;
  border-radius: var(--r-pill);
}
.wallet-card-skeleton-amount {
  width: 82px;
  height: 13px;
  border-radius: var(--r-pill);
}
.wallet-card-skeleton-detail {
  width: 88px;
  height: 24px;
  border-radius: var(--r-sm);
}
.wallet-card-skeleton-detail.short { width: 62px; }
</style>
