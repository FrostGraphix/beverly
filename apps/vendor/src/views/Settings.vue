<script setup lang="ts">
import AppShell from '../components/AppShell.vue';
import PwaInstallControl from '@beverly/tokens/PwaInstallControl.vue';
import { toggleTheme } from '@beverly/tokens';
</script>

<template>
  <AppShell title="Settings">
    <div class="settings-stack">
      <section class="bw-card settings-card">
        <p class="bw-label" style="color:var(--brand)">App</p>
        <h1 class="bw-h1">Settings</h1>
        <p class="bw-muted">Keep Beverly Vendor on your home screen.</p>
        <PwaInstallControl />
      </section>
      <section class="bw-card settings-card">
        <h2 class="bw-h2">Appearance</h2>
        <button type="button" class="bw-btn" @click="toggleTheme">Toggle theme</button>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.settings-stack { display:grid; gap:var(--s-4); max-width:760px; }
.settings-card { display:grid; gap:var(--s-4); }
</style>
