<template>
  <section class="page-stack">
    <div class="kpi-grid">
      <WalletKpiCard label="Total Float" value="NGN 2.01M" tone="good" />
      <WalletKpiCard label="Total Reserved" value="NGN 165K" tone="warn" />
      <WalletKpiCard label="Active Wallets" value="4 / 5" tone="good" />
      <WalletKpiCard label="Frozen Wallets" value="1" tone="danger" />
    </div>
    <div class="policy-banner">
      <strong>Admin Credit Policy:</strong> balances are never edited directly. Credits post through approved funding, maker-checker manual credits, or compensating entries.
    </div>
    <WalletDataTable title="Wallet Balances" :columns="walletColumns" :rows="walletCards">
      <template #row="{ row }">
        <td><strong>{{ row.name }}</strong><small>{{ row.code }} / {{ row.site }}</small></td>
        <td>{{ row.available }}</td>
        <td>{{ row.float }}</td>
        <td>{{ row.reserved }}</td>
        <td><span class="status-pill good">{{ row.risk }}</span></td>
        <td class="row-actions">
          <BaseButton class="mini-button" size="sm">Ledger</BaseButton>
          <BaseButton class="mini-button" size="sm">Transactions</BaseButton>
          <BaseButton class="danger-button" variant="danger" size="sm">Freeze</BaseButton>
        </td>
      </template>
    </WalletDataTable>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import WalletKpiCard from "./WalletKpiCard.vue";
import WalletDataTable from "./WalletDataTable.vue";

export default {
  name: "AdminWalletBalances",
  components: { BaseButton, WalletKpiCard, WalletDataTable },
  props: {
    walletCards: { type: Array, required: true }
  },
  data() {
    return {
      walletColumns: ["Wallet", "Available", "Posted Float", "Reserved", "Risk", "Actions"]
    };
  }
};
</script>
