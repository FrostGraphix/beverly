<script setup lang="ts">
import { computed } from 'vue';

interface Step { key: string; label: string; }

const props = defineProps<{
    steps: Step[];
    currentIndex: number;
}>();

const items = computed(() =>
    props.steps.map((step, i) => ({
        ...step,
        index: i,
        isActive: i === props.currentIndex,
        isCompleted: i < props.currentIndex,
    })),
);
</script>

<template>
  <div class="stepper">
    <div
      v-for="item in items"
      :key="item.key"
      class="stepper-item"
      :class="{
        'stepper-item--active': item.isActive,
        'stepper-item--done': item.isCompleted,
      }"
    >
      <div class="stepper-dot">
        <svg v-if="item.isCompleted" width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M3 7l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span v-else>{{ item.index + 1 }}</span>
      </div>
      <span class="stepper-label">{{ item.label }}</span>
      <div v-if="item.index < items.length - 1" class="stepper-line" :class="{ 'stepper-line--done': item.isCompleted }" />
    </div>
  </div>
</template>

<style scoped>
.stepper {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: var(--s-5);
}
.stepper-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--t-xs);
  font-weight: 600;
  color: var(--text-muted);
  flex-shrink: 0;
}
.stepper-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
  background: var(--surface);
  color: var(--text-muted);
  transition: all var(--dur-fast);
}
.stepper-label {
  white-space: nowrap;
}
.stepper-line {
  flex: 1;
  height: 2px;
  background: var(--border);
  margin: 0 var(--s-2);
  min-width: 16px;
  border-radius: 1px;
  transition: background var(--dur-fast);
}
.stepper-line--done { background: var(--brand); }
.stepper-item--active .stepper-dot {
  border-color: var(--brand);
  background: var(--brand);
  color: white;
  box-shadow: 0 0 0 3px var(--brand-glow);
}
.stepper-item--active .stepper-label { color: var(--text); }
.stepper-item--done .stepper-dot {
  border-color: var(--brand);
  background: transparent;
  color: var(--brand);
}
.stepper-item--done .stepper-label { color: var(--text-dim); }

@media (max-width: 380px) {
  .stepper-label { display: none; }
  .stepper-item--active .stepper-label { display: inline; }
}
</style>
