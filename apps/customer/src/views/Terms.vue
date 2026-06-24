<script setup lang="ts">
import CustomerAuthShell from '../components/CustomerAuthShell.vue';
</script>

<template>
  <CustomerAuthShell title="Terms of Service" subtitle="Beverly wallet customer terms" back="/login">
    <section class="legal-card">
      <p>
        Beverly provides wallet, meter, and electricity vending services for registered customers.
        You must keep your login details secure and provide accurate account information.
      </p>
      <p>
        Wallet funding, token purchases, refunds, disputes, and meter services are processed under
        Beverly operational rules, applicable Nigerian law, and verified transaction records.
      </p>
      <p>
        Beverly may pause, review, or restrict access where fraud, security risk, policy breach,
        or regulatory concern is detected.
      </p>
      <router-link to="/login" class="bw-btn primary legal-action">Back to sign in</router-link>
    </section>
  </CustomerAuthShell>
</template>

<style scoped>
.legal-card { display: grid; gap: var(--s-3); color: var(--text-2); line-height: 1.6; font-size: var(--t-sm); }
.legal-card p { margin: 0; }
.legal-action { justify-content: center; margin-top: var(--s-2); text-decoration: none; }
</style>
