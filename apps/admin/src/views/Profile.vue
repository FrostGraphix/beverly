<script setup lang="ts">
import AppShell from '../components/AppShell.vue';
import { useStaffAuthStore } from '../stores/auth';

const auth = useStaffAuthStore();
</script>

<template>
  <AppShell title="Profile">
    <div class="bw-grid cols-2">
      <section class="bw-card">
        <p class="bw-label" style="color: var(--brand)">Staff identity</p>
        <h1 class="bw-h1">{{ auth.user?.full_name || 'Staff user' }}</h1>
        <p class="bw-muted">Your Beverly Wallet Admin access profile.</p>

        <dl class="bw-detail-list">
          <div>
            <dt>Email</dt>
            <dd>{{ auth.user?.email || 'Not provided' }}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{{ auth.user?.role || 'admin' }}</dd>
          </div>
          <div>
            <dt>User ID</dt>
            <dd class="bw-mono">{{ auth.user?.id || 'local-session' }}</dd>
          </div>
        </dl>
      </section>

      <section class="bw-card">
        <p class="bw-label" style="color: var(--info)">Access posture</p>
        <h2 class="bw-h2">Admin controls</h2>
        <p class="bw-muted">
          Profile editing should stay connected to the staff identity provider.
          This page intentionally shows the current signed-in session only.
        </p>
      </section>
    </div>
  </AppShell>
</template>
