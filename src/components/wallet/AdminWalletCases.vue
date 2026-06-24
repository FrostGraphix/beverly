<template>
  <section class="page-stack">
    <WalletDataTable :title="activePage === 'reversals' ? 'Reversal Requests' : 'Disputes'" :columns="caseColumns" :rows="filteredCases">
      <template #row="{ row }">
        <td><code>{{ row.id }}</code></td>
        <td>{{ row.vendor }}</td>
        <td>{{ row.customer }}</td>
        <td>{{ row.amount }}</td>
        <td><span :class="['status-pill', row.tone]">{{ row.status }}</span></td>
        <td>{{ row.priority }}</td>
        <td><BaseButton class="mini-button" size="sm">Review</BaseButton></td>
      </template>
    </WalletDataTable>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import WalletDataTable from "./WalletDataTable.vue";

export default {
  name: "AdminWalletCases",
  components: { BaseButton, WalletDataTable },
  props: {
    caseRows: { type: Array, required: true },
    query: { type: String, default: "" },
    activePage: { type: String, required: true }
  },
  data() {
    return {
      caseColumns: ["Case ID", "Vendor", "Customer", "Amount", "Status", "Priority", "Action"]
    };
  },
  computed: {
    filteredCases() {
      const q = this.query;
      if (!q) return this.caseRows;
      return this.caseRows.filter(row => JSON.stringify(row).toLowerCase().includes(q));
    }
  }
};
</script>
