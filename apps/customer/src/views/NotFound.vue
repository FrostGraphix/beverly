<script setup lang="ts">
</script>

<template>
  <div style="min-height:100dvh; display:grid; place-items:center; padding: var(--s-5); background: var(--canvas); text-align:center">
    <div>
      <p class="bw-mono" style="font-size: 72px; font-weight:800; color: var(--border); line-height:1; margin:0 0 var(--s-4)">404</p>
      <p class="bw-page-title" style="margin-bottom: var(--s-2)">Page not found</p>
      <p class="bw-muted" style="font-size: var(--t-sm); margin-bottom: var(--s-6)">The page you're looking for doesn't exist.</p>
      <router-link to="/" class="bw-btn primary" style="text-decoration:none; display:inline-flex">
        Go home
      </router-link>
    </div>
  </div>
</template>
