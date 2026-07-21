<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue';

const { needRefresh, updateServiceWorker } = useRegisterSW();

function reload() {
    void updateServiceWorker(true);
}

function dismiss() {
    needRefresh.value = false;
}
</script>

<template>
  <div v-if="needRefresh" class="bw-update-toast" role="status">
    <span>A new version of Beverly is available.</span>
    <button class="bw-btn small primary" @click="reload">Refresh</button>
    <button class="bw-icon-btn" @click="dismiss" aria-label="Dismiss">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
</template>

<style scoped>
/*
 * Anchored bottom-LEFT deliberately — ChatWidget's floating bubble owns the
 * bottom-right corner (fixed, right:16px, bottom: tabbar+8px, 46x46) on every
 * viewport size. Sharing that corner with a same-z-index toast would let this
 * cover the bubble and make it untappable, so this stays on the opposite side.
 */
.bw-update-toast {
  position: fixed;
  left: var(--s-4);
  right: auto;
  max-width: calc(100% - 32px);
  bottom: calc(var(--bw-tabbar-height, 0px) + var(--s-4));
  z-index: var(--z-toast, 2000);
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg, 12px);
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.3));
  font-size: var(--t-sm);
  color: var(--text);
}
.bw-update-toast span { flex: 1; }

@media (min-width: 640px) {
  .bw-update-toast {
    bottom: var(--s-6);
    max-width: 360px;
  }
}
</style>
