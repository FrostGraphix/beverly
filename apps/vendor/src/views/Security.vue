<script setup lang="ts">
import AppShell from '../components/AppShell.vue';
import { useVendorAuthStore } from '../stores/auth';
const auth = useVendorAuthStore();
</script>
<template>
  <AppShell title="Security">
    <div class="bw-stack">
      <div class="bw-card">
        <h1 class="bw-h1">Two-factor authentication</h1>
        <p class="bw-muted">Mandatory for all vendor users.</p>
        <p style="margin-top: var(--s-3)">
          <span v-if="auth.user?.mfa_enrolled" style="color: var(--brand); font-weight: 600">✓ Enabled</span>
          <span v-else style="color: var(--warn); font-weight: 600">⚠ Not configured</span>
        </p>
        <button class="bw-btn primary" style="margin-top: var(--s-4)">
          {{ auth.user?.mfa_enrolled ? 'Reset 2FA' : 'Enable 2FA' }}
        </button>
      </div>
    </div>
  </AppShell>
</template>
