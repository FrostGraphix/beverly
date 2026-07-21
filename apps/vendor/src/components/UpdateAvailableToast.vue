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
    <span>A new version of Beverly Vendor is available.</span>
    <button class="bw-btn small primary" @click="reload">Refresh</button>
    <button class="bw-icon-btn" @click="dismiss" aria-label="Dismiss">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
</template>

<style scoped>
/*
 * Anchored top-right, below the 60px topbar — deliberately NOT bottom-right
 * (ChatWidget's bubble owns that corner: fixed, right:20px, bottom:20px) and
 * NOT bottom-left (the sidebar's sticky footer — account card + sign-out —
 * sits there on desktop). This is the one corner nothing else claims.
 */
.bw-update-toast {
  position: fixed;
  right: var(--s-6);
  top: calc(60px + var(--s-4));
  z-index: var(--z-toast, 2000);
  display: flex;
  align-items: center;
  gap: var(--s-3);
  max-width: 360px;
  padding: var(--s-3) var(--s-4);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg, 12px);
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.3));
  font-size: var(--t-sm);
  color: var(--text);
}
.bw-update-toast span { flex: 1; }
</style>
