<template>
  <section class="page-stack">
    <div class="info-banner">
      No policy permits UPDATE or DELETE on financial evidence. Role, password, approval, and ledger actions appear as immutable audit events.
    </div>
    <div style="margin-bottom: 12px;">
      <ExportToolbar :rows="filteredAuditRows" :columns="auditExportColumns" title="Audit Log Export" filename="beverly-audit-log" :disabled="!filteredAuditRows.length" />
    </div>
    <WalletDataTable title="Audit Log" :columns="auditColumns" :rows="filteredAuditRows">
      <template #row="{ row }">
        <td><code>{{ row.time }}</code></td>
        <td>{{ row.actor }}</td>
        <td><span class="status-pill info">{{ row.role }}</span></td>
        <td><code>{{ row.event }}</code></td>
        <td>{{ row.target }}</td>
        <td>{{ row.ip }}</td>
      </template>
    </WalletDataTable>
  </section>
</template>

<script>
import ExportToolbar from "../base/ExportToolbar.vue";
import WalletDataTable from "./WalletDataTable.vue";

export default {
  name: "AdminWalletAuditLog",
  components: { ExportToolbar, WalletDataTable },
  props: {
    auditRows: { type: Array, required: true },
    query: { type: String, default: "" }
  },
  data() {
    return {
      auditColumns: ["Time (WAT)", "Actor", "Role", "Event", "Target", "IP"],
      auditExportColumns: [
        { key: "time", label: "Time (WAT)" },
        { key: "actor", label: "Actor" },
        { key: "role", label: "Role" },
        { key: "event", label: "Event" },
        { key: "target", label: "Target" },
        { key: "ip", label: "IP" }
      ]
    };
  },
  computed: {
    filteredAuditRows() {
      const q = this.query;
      if (!q) return this.auditRows;
      return this.auditRows.filter(row => JSON.stringify(row).toLowerCase().includes(q));
    }
  }
};
</script>
