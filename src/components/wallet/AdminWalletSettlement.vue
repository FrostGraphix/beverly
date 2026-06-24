<template>
  <section class="page-stack">
    <article v-for="batch in settlements" :key="batch.site" class="settlement-card">
      <div class="wallet-title">
        <div>
          <h2>{{ batch.date }} - {{ batch.site }}</h2>
          <p>Commission 0.00% pending activation / {{ batch.txns }} txns</p>
        </div>
        <span class="status-pill good">locked</span>
      </div>
      <div class="wallet-stat-grid">
        <WalletKpiCard label="Purchases" :value="batch.purchases" />
        <WalletKpiCard label="Commission" value="NGN 0.00" />
        <WalletKpiCard label="Transactions" :value="String(batch.txns)" />
        <WalletKpiCard label="Exceptions" value="0" tone="good" />
      </div>
    </article>
  </section>
</template>

<script>
import WalletKpiCard from "./WalletKpiCard.vue";

export default {
  name: "AdminWalletSettlement",
  components: { WalletKpiCard },
  props: {
    settlements: { type: Array, required: true }
  }
};
</script>
