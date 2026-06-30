<script setup lang="ts">
import { computed } from 'vue';
import { useStaffAuthStore } from '../stores/auth';

const auth = useStaffAuthStore();
const homeTarget = computed(() => {
  if (auth.hasPermission('wallet.dashboard.view')) return '/';
  if (auth.hasPermission('wallet.vendors.review')) return '/vendors';
  if (auth.hasPermission('wallet.funding.view')) return '/funding';
  if (auth.hasPermission('wallet.vending.monitor')) return '/purchases';
  if (auth.hasPermission('wallet.audit.view')) return '/audit';
  return '/profile';
});
</script>
<template>
  <main style="min-height: 100dvh; display: grid; place-items: center; text-align: center">
    <div>
      <p class="bw-mono" style="font-size: var(--t-3xl); font-weight: 700; color: var(--text-dim); margin: 0 0 var(--s-2)">404</p>
      <p class="bw-muted" style="margin: 0 0 var(--s-5)">Route not found.</p>
      <router-link :to="homeTarget" class="bw-btn primary" style="text-decoration: none">Back to allowed area</router-link>
    </div>
  </main>
</template>
