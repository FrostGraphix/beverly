<template>
  <section class="page-stack">
    <div class="tab-row">
      <BaseButton class="filter-pill active">Funding Requests</BaseButton>
      <BaseButton class="filter-pill">Manual Credits</BaseButton>
    </div>
    <WalletDataTable title="Funding Approval Queue" :columns="fundingColumns" :rows="filteredFundingRows">
      <template #row="{ row }">
        <td><code>{{ row.ref }}</code></td>
        <td><strong>{{ row.vendor }}</strong></td>
        <td>{{ row.amount }}</td>
        <td>{{ row.channel }}</td>
        <td>{{ row.bankRef }}</td>
        <td>{{ row.submitted }}</td>
        <td><span :class="['status-pill', row.tone]">{{ row.status }}</span></td>
        <td class="row-actions">
          <BaseButton class="mini-button" size="sm" @click="openProof(row)">Proof</BaseButton>
          <BaseButton class="primary-button" variant="primary" size="sm" @click="approveFunding(row)">Approve</BaseButton>
          <BaseButton class="danger-button" variant="danger" size="sm" @click="rejectFunding(row)">Reject</BaseButton>
        </td>
      </template>
    </WalletDataTable>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import WalletDataTable from "./WalletDataTable.vue";

export default {
  name: "AdminWalletFundingQueue",
  components: { BaseButton, WalletDataTable },
  props: {
    fundingRows: { type: Array, required: true },
    query: { type: String, default: "" }
  },
  emits: ["audit"],
  data() {
    return {
      fundingColumns: ["Reference", "Vendor", "Amount", "Channel", "Bank Ref", "Submitted", "Status", "Actions"]
    };
  },
  computed: {
    filteredFundingRows() {
      const q = this.query;
      if (!q) return this.fundingRows;
      return this.fundingRows.filter(row => JSON.stringify(row).toLowerCase().includes(q));
    }
  },
  methods: {
    approveFunding(row) {
      row.status = "posted";
      row.tone = "good";
      this.$emit("audit", { time: "13 May 10:37:00", actor: "finance-checker", role: "finance-checker", event: "funding_approved", target: row.ref, ip: "local" });
    },
    rejectFunding(row) {
      row.status = "rejected";
      row.tone = "danger";
      this.$emit("audit", { time: "13 May 10:38:00", actor: "finance-checker", role: "finance-checker", event: "funding_rejected", target: row.ref, ip: "local" });
    },
    openProof(row) {
      this.$emit("audit", { time: "13 May 10:39:00", actor: "admin", role: "super-admin", event: "viewed_record", target: row.ref, ip: "local" });
    }
  }
};
</script>
