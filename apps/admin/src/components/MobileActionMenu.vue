<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

defineProps<{
    label?: string;
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

function toggle() {
    open.value = !open.value;
}

function close() {
    open.value = false;
}

function onDocumentPointerDown(event: PointerEvent) {
    if (!root.value?.contains(event.target as Node)) close();
}

document.addEventListener('pointerdown', onDocumentPointerDown);
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown));
</script>

<template>
  <div ref="root" :class="['mobile-action-menu', { 'is-open': open }]">
    <button
      type="button"
      class="bw-btn sm mobile-action-trigger"
      :aria-label="label || 'Actions'"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <span aria-hidden="true">...</span>
    </button>
    <div v-if="open" class="mobile-action-panel" @click="close">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.mobile-action-menu {
  display: none;
  position: relative;
  justify-content: flex-end;
}

.mobile-action-trigger {
  min-width: 42px;
  justify-content: center;
  font-weight: 900;
}

.mobile-action-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 40;
  min-width: 158px;
  padding: 6px;
  border: 1px solid var(--glass-border);
  border-radius: var(--r-md);
  background: var(--glass-bg-strong);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  box-shadow: var(--glass-shine), var(--glass-shadow-float);
}

:deep(.mobile-action-item) {
  width: 100%;
  min-height: 38px;
  display: flex;
  align-items: center;
  padding: 9px 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text);
  text-decoration: none;
  font: inherit;
  font-size: var(--t-sm);
  line-height: 1.2;
  cursor: pointer;
  text-align: left;
}

:deep(.mobile-action-item:hover),
:deep(.mobile-action-item:focus-visible) {
  background: var(--surface-2);
  outline: none;
}

:deep(.mobile-action-item.danger) {
  color: var(--danger);
}

:deep(.mobile-action-item.primary) {
  color: var(--brand);
}

@media (max-width: 720px) {
  .mobile-action-menu {
    display: flex;
  }
}
</style>
