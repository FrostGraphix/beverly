<template>
  <section class="page-stack">
    <WalletDataTable title="Vending Monitor" :columns="purchaseColumns" :rows="filteredPurchases">
      <template #row="{ row }">
        <td><code>{{ row.id }}</code></td>
        <td>{{ row.date }}</td>
        <td>{{ row.vendor }}</td>
        <td><code>{{ row.meter }}</code></td>
        <td><span :class="['status-pill', row.delivery === 'Remote Send' ? 'info' : 'good']">{{ row.delivery }}</span></td>
        <td>{{ row.amount }}</td>
        <td><span :class="['status-pill', row.status === 'failed' ? 'danger' : 'good']">{{ row.status }}</span></td>
        <td><BaseButton class="mini-button" size="sm" @click="openReceipt(row)">Receipt</BaseButton></td>
      </template>
    </WalletDataTable>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import WalletDataTable from "./WalletDataTable.vue";

export default {
  name: "AdminWalletPurchase",
  components: { BaseButton, WalletDataTable },
  props: {
    purchases: { type: Array, required: true },
    query: { type: String, default: "" }
  },
  emits: ["audit"],
  data() {
    return {
      purchaseColumns: ["Order ID", "Date", "Vendor", "Meter SN", "Delivery", "Amount", "Status", "Receipt"]
    };
  },
  computed: {
    filteredPurchases() {
      const q = this.query;
      if (!q) return this.purchases;
      return this.purchases.filter(row => JSON.stringify(row).toLowerCase().includes(q));
    }
  },
  methods: {
    openReceipt(row) {
      this.$emit("audit", { time: "13 May 10:39:00", actor: "admin", role: "super-admin", event: "viewed_record", target: row.id, ip: "local" });
    }
  }
};
</script>
