<script setup lang="ts">
import CustomerAuthShell from '../components/CustomerAuthShell.vue';
</script>

<template>
  <CustomerAuthShell title="Privacy Policy" subtitle="How Beverly handles customer data" back="/login">
    <section class="legal-card">
      <p>
        Beverly collects account, contact, wallet, meter, transaction, support, and security data
        needed to operate the customer wallet safely.
      </p>
      <p>
        We use this data to verify identity, process vending, protect accounts, resolve disputes,
        meet audit duties, and improve reliability.
      </p>
      <p>
        Customers may request data export or account deletion from the profile page, subject to
        fraud, settlement, legal, and regulatory retention requirements.
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
