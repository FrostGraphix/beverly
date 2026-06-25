<script setup lang="ts">
import { computed } from 'vue';

interface Step {
    key: string;
    label: string;
    description?: string;
}

const props = defineProps<{
    steps: Step[];
    currentIndex: number;
    completedKeys?: string[];
}>();

const items = computed(() =>
    props.steps.map((step, i) => ({
        ...step,
        index: i,
        isActive: i === props.currentIndex,
        isCompleted: i < props.currentIndex || (props.completedKeys?.includes(step.key) ?? false),
        isUpcoming: i > props.currentIndex,
    })),
);
</script>

<template>
  <div class="stepper" :data-count="steps.length">
    <div
      v-for="item in items"
      :key="item.key"
      class="stepper-item"
      :class="{
        'stepper-item--active': item.isActive,
        'stepper-item--done': item.isCompleted,
        'stepper-item--upcoming': item.isUpcoming,
      }"
    >
      <div class="stepper-dot">
        <svg v-if="item.isCompleted" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M3 7l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span v-else>{{ item.index + 1 }}</span>
      </div>
      <div class="stepper-label">
        <span class="stepper-title">{{ item.label }}</span>
        <span v-if="item.description" class="stepper-desc">{{ item.description }}</span>
      </div>
      <div v-if="item.index < items.length - 1" class="stepper-line" :class="{ 'stepper-line--done': item.isCompleted }" />
    </div>
  </div>
</template>

<style scoped>
.stepper {
  display: grid;
  grid-template-columns: repeat(var(--step-count, 3), 1fr);
  gap: 0;
  margin-bottom: var(--s-6);
  padding: var(--s-4);
  background: var(--surface-2);
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
}
.stepper[data-count="2"] { --step-count: 2; }
.stepper[data-count="3"] { --step-count: 3; }
.stepper[data-count="4"] { --step-count: 4; }
.stepper[data-count="5"] { --step-count: 5; }

.stepper-item {
  display: grid;
  grid-template-columns: 28px 1fr;
  grid-template-rows: 28px auto;
  grid-template-areas:
    "dot label"
    "line line";
  align-items: center;
  gap: var(--s-2);
  position: relative;
  min-width: 0;
}

.stepper-dot {
  grid-area: dot;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  background: var(--surface);
  color: var(--text-muted);
  display: grid;
  place-items: center;
  font-size: var(--t-sm);
  font-weight: 700;
  flex-shrink: 0;
  transition: all var(--dur-fast) var(--ease-out);
}

.stepper-label {
  grid-area: label;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}
.stepper-title {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color var(--dur-fast);
}
.stepper-desc {
  font-size: var(--t-xs);
  color: var(--text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stepper-line {
  grid-area: line;
  height: 2px;
  background: var(--border);
  margin-top: var(--s-2);
  margin-left: 14px;
  margin-right: -8px;
  width: calc(100% + 8px);
  border-radius: 1px;
  transition: background var(--dur-fast);
}
.stepper-line--done { background: var(--brand); }

/* Active */
.stepper-item--active .stepper-dot {
  border-color: var(--brand);
  background: var(--brand);
  color: white;
  box-shadow: 0 0 0 4px var(--brand-glow);
}
.stepper-item--active .stepper-title { color: var(--text); }

/* Done */
.stepper-item--done .stepper-dot {
  border-color: var(--brand);
  background: transparent;
  color: var(--brand);
}
.stepper-item--done .stepper-title { color: var(--text-dim); }

/* Mobile */
@media (max-width: 640px) {
  .stepper { padding: var(--s-3); gap: var(--s-1); }
  .stepper-item { grid-template-columns: 24px 1fr; }
  .stepper-dot { width: 24px; height: 24px; font-size: var(--t-xs); }
  .stepper-title { font-size: var(--t-xs); }
  .stepper-desc { display: none; }
}
</style>
