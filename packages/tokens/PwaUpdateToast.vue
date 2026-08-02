<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue';

withDefaults(defineProps<{ appName?: string }>(), {
  appName: 'Beverly',
});

const { needRefresh, updateServiceWorker } = useRegisterSW();
</script>

<template>
  <div v-if="needRefresh" class="bw-pwa-update" role="status">
    <span>A new {{ appName }} version is ready.</span>
    <button type="button" class="bw-pwa-update-action" @click="updateServiceWorker(true)">Refresh</button>
    <button type="button" class="bw-pwa-update-close" aria-label="Dismiss update" @click="needRefresh = false">×</button>
  </div>
</template>

<style scoped>
.bw-pwa-update {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 3000;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(360px, calc(100vw - 32px));
  padding: 12px 14px;
  color: var(--text, #f8fafc);
  background: var(--surface-2, #111827);
  border: 1px solid var(--border, #334155);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgb(0 0 0 / 35%);
  font: 600 13px/1.4 var(--font-sans, sans-serif);
}
.bw-pwa-update span { flex: 1; }
.bw-pwa-update-action,
.bw-pwa-update-close {
  min-height: 36px;
  border: 0;
  border-radius: 8px;
  font: inherit;
  cursor: pointer;
}
.bw-pwa-update-action { padding: 0 12px; color: #07150c; background: var(--brand, #22c55e); }
.bw-pwa-update-close { width: 36px; color: inherit; background: transparent; font-size: 20px; }
.bw-pwa-update-action:focus-visible,
.bw-pwa-update-close:focus-visible { outline: 2px solid var(--brand, #22c55e); outline-offset: 2px; }
</style>
