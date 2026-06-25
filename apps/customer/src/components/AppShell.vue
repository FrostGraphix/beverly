<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth';

defineProps<{ title?: string; hideTabbar?: boolean }>();
const auth = useAuthStore();

// PWA install prompt
const installPrompt = ref<any>(null);
const installDismissed = ref(false);

onMounted(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        installPrompt.value = e;
    });
});

async function promptInstall() {
    if (!installPrompt.value) return;
    installPrompt.value.prompt();
    const { outcome } = await installPrompt.value.userChoice;
    if (outcome === 'accepted') installPrompt.value = null;
}
</script>

<template>
  <div class="bw-mobile-shell">
    <!-- PWA install banner -->
    <div v-if="installPrompt && !installDismissed" class="bw-install-banner">
      <span>Add Beverly to your home screen for the best experience</span>
      <button class="bw-btn small" @click="promptInstall">Install</button>
      <button class="bw-icon-btn" @click="installDismissed = true" aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- App bar -->
    <header class="bw-appbar">
      <RouterLink to="/" class="bw-appbar-brand">
        <div class="bw-mark" style="width:28px; height:28px; font-size:13px; border-radius: var(--r-md)">B</div>
        <span>Beverly</span>
      </RouterLink>
      <span class="bw-appbar-spacer"></span>
      <slot name="appbar-end" />
    </header>

    <!-- Main scroll -->
    <main class="bw-mobile-main">
      <div class="bw-mobile-main-inner">
        <slot />
      </div>
    </main>

    <!-- Bottom tab bar -->
    <nav v-if="!hideTabbar" class="bw-tabbar">
      <RouterLink to="/" class="bw-tab">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 13l9-9 9 9M5 11v9h14v-9"/>
        </svg>
        Home
      </RouterLink>
      <RouterLink to="/buy-token" class="bw-tab">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        Buy
      </RouterLink>
      <RouterLink to="/wallet" class="bw-tab">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2"/>
          <path d="M2 10h20"/>
        </svg>
        Wallet
      </RouterLink>
      <RouterLink to="/meters" class="bw-tab">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 7v5l3 2"/>
        </svg>
        Meters
      </RouterLink>
      <RouterLink to="/profile" class="bw-tab">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 22v-2a8 8 0 0116 0v2"/>
        </svg>
        Profile
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.bw-install-banner {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-2) var(--s-4);
  background: oklch(70% 0.19 145 / 0.12);
  border-bottom: 1px solid oklch(70% 0.19 145 / 0.2);
  font-size: var(--t-sm);
}
.bw-install-banner span { flex: 1; }
</style>
