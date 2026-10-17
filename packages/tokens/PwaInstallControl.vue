<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { getDeferredInstallPrompt, isIos, isStandalone, onInstallPromptChange, triggerInstallPrompt } from './index.js';

const installPrompt = ref(getDeferredInstallPrompt());
const installed = ref(isStandalone());
const installing = ref(false);
const message = ref('');
let unsubscribe: (() => void) | undefined;

onMounted(() => {
  unsubscribe = onInstallPromptChange((event) => {
    installPrompt.value = event;
    installed.value = isStandalone();
  });
});
onUnmounted(() => unsubscribe?.());

async function install() {
  if (installPrompt.value) {
    try {
      const choice = await triggerInstallPrompt();
      if (choice?.outcome === 'accepted') {
        installing.value = true;
        message.value = 'Installation started. Find Beverly on your home screen.';
      }
    } catch {
      message.value = 'Open your browser menu and choose Install app.';
    }
    return;
  }
  message.value = isIos()
    ? 'In Safari, tap Share, then Add to Home Screen.'
    : 'Open your browser menu and choose Install app or Add to Home screen.';
}
</script>

<template>
  <div class="pwa-install-control">
    <button v-if="!installed && !installing" type="button" class="bw-btn" @click="install">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      Install app
    </button>
    <p v-if="installed" class="bw-muted" role="status">App installed</p>
    <p v-if="message" class="bw-muted" role="status">{{ message }}</p>
  </div>
</template>

<style scoped>
.pwa-install-control { display: grid; gap: var(--s-2); }
.pwa-install-control .bw-btn { justify-content: flex-start; width: 100%; }
.pwa-install-control p { margin: 0; font-size: var(--t-xs); }
</style>
