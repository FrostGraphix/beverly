<script setup lang="ts">
import AppShell from '../components/AppShell.vue';
import { useVendorAuthStore } from '../stores/auth';
import { toggleTheme } from '@beverly/tokens';
const auth = useVendorAuthStore();
</script>
<template>
  <AppShell title="Profile">
    <div class="bw-stack">
      <div class="bw-card">
        <h1 class="bw-h1">{{ auth.user?.full_name || 'Vendor user' }}</h1>
        <p class="bw-muted bw-mono">{{ auth.user?.email }}</p>
        <p class="bw-muted" style="font-size: var(--t-sm); margin-top: var(--s-2)">{{ auth.user?.organization_name }} · {{ auth.user?.role }}</p>
      </div>
      <div class="bw-card">
        <button class="bw-btn" @click="toggleTheme">Toggle theme</button>
      </div>
      <div class="bw-card">
        <button class="bw-btn danger" @click="auth.logout()">Sign out</button>
      </div>
    </div>
  </AppShell>
</template>
