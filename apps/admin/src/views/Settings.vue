<script setup lang="ts">
import { RouterLink } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { toggleTheme } from '@beverly/tokens';
</script>

<template>
  <AppShell title="Settings">
    <div class="bw-grid cols-2">
      <section class="bw-card">
        <p class="bw-label" style="color: var(--brand)">Preferences</p>
        <h1 class="bw-h1">Workspace settings</h1>
        <p class="bw-muted">Control local display behavior for this admin workspace.</p>

        <div class="bw-row" style="margin-top: var(--s-5)">
          <button type="button" class="bw-btn primary" @click="toggleTheme">Toggle theme</button>
        </div>
      </section>

      <section class="bw-card">
        <p class="bw-label" style="color: var(--warn)">Security</p>
        <h2 class="bw-h2">Two-factor authentication</h2>
        <p class="bw-muted">
          Add an authenticator app to require a one-time code at sign-in. Recommended for every
          staff member with access to money movement or launch controls.
        </p>
        <div class="bw-row" style="margin-top: var(--s-5)">
          <RouterLink to="/security" class="bw-btn primary">Manage 2FA &amp; security</RouterLink>
        </div>
      </section>
    </div>
  </AppShell>
</template>
