<script setup>
/**
 * Shared table pagination for the wallet portals.
 *
 * Lives here rather than in each app because admin, vendor and customer all
 * paginate consumption tables and the controls have to behave — and look —
 * identically across the three. Styling uses theme tokens only, so it flips
 * with the active theme instead of baking in a light palette.
 */
import { computed, watch } from 'vue';
import { DEFAULT_PAGE_SIZE, clampPage, pageCount as countPages, pageRange } from './index.js';

const props = defineProps({
    /** Total number of rows across all pages. */
    total: { type: Number, required: true },
    /** Current 1-based page. Use with v-model:page. */
    page: { type: Number, required: true },
    pageSize: { type: Number, default: DEFAULT_PAGE_SIZE },
    /** Noun for the row type, e.g. "meters". Used in the summary and a11y label. */
    itemLabel: { type: String, default: 'rows' },
});

const emit = defineEmits(['update:page']);

const pageCount = computed(() => countPages(props.total, props.pageSize));
const current = computed(() => clampPage(props.page, props.total, props.pageSize));
const range = computed(() => pageRange(props.page, props.total, props.pageSize));
const firstIndex = computed(() => range.value.first);
const lastIndex = computed(() => range.value.last);

// Filtering or a period change can shrink the list under the current page.
// Without this the table would render empty with no way back except reload.
watch([pageCount, () => props.page], () => {
    if (props.page > pageCount.value) emit('update:page', pageCount.value);
    else if (props.page < 1) emit('update:page', 1);
});

function go(target) {
    const next = clampPage(target, props.total, props.pageSize);
    if (next !== props.page) emit('update:page', next);
}
</script>

<template>
  <nav v-if="total > pageSize" class="bw-pager" :aria-label="`${itemLabel} pagination`">
    <p class="bw-pager-summary" role="status" aria-live="polite">
      Showing <strong>{{ firstIndex.toLocaleString('en-NG') }}</strong>–<strong>{{ lastIndex.toLocaleString('en-NG') }}</strong>
      of <strong>{{ total.toLocaleString('en-NG') }}</strong> {{ itemLabel }}
    </p>

    <div class="bw-pager-controls">
      <button
        type="button"
        class="bw-pager-btn"
        :disabled="current <= 1"
        :aria-label="`First page of ${itemLabel}`"
        @click="go(1)"
      >«</button>
      <button
        type="button"
        class="bw-pager-btn"
        :disabled="current <= 1"
        :aria-label="`Previous page of ${itemLabel}`"
        @click="go(current - 1)"
      >Prev</button>

      <span class="bw-pager-count">Page {{ current.toLocaleString('en-NG') }} of {{ pageCount.toLocaleString('en-NG') }}</span>

      <button
        type="button"
        class="bw-pager-btn"
        :disabled="current >= pageCount"
        :aria-label="`Next page of ${itemLabel}`"
        @click="go(current + 1)"
      >Next</button>
      <button
        type="button"
        class="bw-pager-btn"
        :disabled="current >= pageCount"
        :aria-label="`Last page of ${itemLabel}`"
        @click="go(pageCount)"
      >»</button>
    </div>
  </nav>
</template>

<style scoped>
.bw-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 0.8125rem;
}
.bw-pager-summary { margin: 0; }
.bw-pager-summary strong { color: var(--text); font-variant-numeric: tabular-nums; font-weight: 600; }
.bw-pager-controls { display: flex; align-items: center; gap: 0.375rem; }
.bw-pager-count {
  padding: 0 0.5rem;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.bw-pager-btn {
  min-height: 36px;
  min-width: 36px;
  padding: 0 0.7rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: border-color .15s, background .15s, color .15s;
}
.bw-pager-btn:hover:not(:disabled) { border-color: var(--brand); color: var(--brand); }
.bw-pager-btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.bw-pager-btn:disabled { opacity: .45; cursor: not-allowed; }

@media (max-width: 560px) {
  .bw-pager { flex-direction: column; align-items: stretch; }
  .bw-pager-controls { justify-content: center; }
}
</style>
