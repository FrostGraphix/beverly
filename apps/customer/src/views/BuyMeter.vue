<script setup lang="ts">
import AppShell from '../components/AppShell.vue';
</script>

<template>
  <AppShell>
    <div>
      <p class="bw-page-title">Order a meter</p>
      <p class="bw-page-sub">Beverly installs new prepaid meters in-house</p>
    </div>

    <div class="bw-card">
      <div style="font-size:40px; text-align:center; margin-bottom: var(--s-4)">⚡</div>
      <p style="font-weight:700; margin:0 0 var(--s-2)">New meter installation</p>
      <p class="bw-muted" style="font-size: var(--t-sm); margin:0 0 var(--s-5)">
        Beverly's team installs certified prepaid meters at your property.
        Contact your account manager or Beverly support to start the process.
      </p>
      <div class="bw-stack" style="gap: var(--s-2)">
        <div class="bw-row" style="gap: var(--s-3)">
          <div style="width:32px; height:32px; border-radius:50%; background: oklch(70% 0.19 145 / 0.12); display:grid; place-items:center; flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <p style="font-size: var(--t-sm); margin:0">Licensed NERC-certified installation</p>
        </div>
        <div class="bw-row" style="gap: var(--s-3)">
          <div style="width:32px; height:32px; border-radius:50%; background: oklch(70% 0.19 145 / 0.12); display:grid; place-items:center; flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <p style="font-size: var(--t-sm); margin:0">Linked to your account instantly</p>
        </div>
        <div class="bw-row" style="gap: var(--s-3)">
          <div style="width:32px; height:32px; border-radius:50%; background: oklch(70% 0.19 145 / 0.12); display:grid; place-items:center; flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <p style="font-size: var(--t-sm); margin:0">Buy tokens immediately after installation</p>
        </div>
      </div>
    </div>

    <div class="bw-card" style="text-align:center">
      <p class="bw-muted" style="font-size: var(--t-sm); margin:0 0 var(--s-3)">Contact Beverly to get started</p>
      <a href="tel:+2340000000000" class="bw-btn primary" style="text-decoration:none; display:inline-flex; justify-content:center">
        Call support
      </a>
    </div>
  </AppShell>
</template>
