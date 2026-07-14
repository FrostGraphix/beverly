<template>
  <section class="page-stack wallet-crm-table-page">
    <div class="filter-toolbar wallet-table-toolbar">
      <div class="tab-row">
        <BaseButton :class="['filter-pill', userTab === 'staff' ? 'active' : '']" @click="userTab = 'staff'">Wallet Staff Users</BaseButton>
        <BaseButton :class="['filter-pill', userTab === 'vendor' ? 'active' : '']" @click="userTab = 'vendor'">Vendor Users</BaseButton>
      </div>
      <BaseSelect v-model="userRoleFilter" class="mini-select">
        <option value="">All Roles</option>
        <option>Platform Admin</option>
        <option>Finance Checker</option>
        <option>Support Reviewer</option>
        <option>Vendor</option>
        <option>Vendor User</option>
      </BaseSelect>
      <BaseSelect v-model="userStatusFilter" class="mini-select">
        <option value="">All Statuses</option>
        <option>Active</option>
        <option>Suspended</option>
        <option>Inactive</option>
      </BaseSelect>
    </div>
    <WalletDataTable title="Users" :columns="userColumns" :rows="filteredUsers">
      <template #row="{ row }">
        <td><strong>{{ row.name }}</strong><small>{{ row.team }}</small></td>
        <td>{{ row.email }}</td>
        <td><span :class="['status-pill', row.roleTone]">{{ row.role }}</span></td>
        <td>{{ row.approvalAuthority }}</td>
        <td>{{ row.limitAuthority }}</td>
        <td><span :class="['status-pill', row.status === 'Suspended' ? 'danger' : 'good']">{{ row.status }}</span></td>
        <td>{{ row.lastActive }}</td>
        <td class="row-actions">
          <BaseButton class="mini-button" size="sm" @click="suspendUser(row)">Suspend</BaseButton>
          <BaseButton class="mini-button" size="sm" @click="resetUser(row)">Reset</BaseButton>
          <BaseButton class="mini-button" size="sm" @click="openAudit(row)">Audit</BaseButton>
        </td>
      </template>
    </WalletDataTable>
    <article class="panel role-matrix-panel">
      <h2>Role & Permissions Matrix</h2>
      <table class="matrix-table">
        <thead>
          <tr>
            <th>Permission Area</th>
            <th v-for="role in roleMatrix" :key="role.role">{{ role.role }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="area in permissionAreas" :key="area">
            <td>{{ area }}</td>
            <td v-for="role in roleMatrix" :key="role.role + area" :class="role.permissions[area].tone">{{ role.permissions[area].value }}</td>
          </tr>
        </tbody>
      </table>
    </article>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import BaseSelect from "../base/BaseSelect.vue";
import WalletDataTable from "./WalletDataTable.vue";

export default {
  name: "AdminWalletUsers",
  components: { BaseButton, BaseSelect, WalletDataTable },
  props: {
    users: { type: Array, required: true },
    query: { type: String, default: "" }
  },
  emits: ["audit"],
  data() {
    return {
      userTab: "staff",
      userRoleFilter: "",
      userStatusFilter: "",
      userColumns: ["Name", "Email", "Role", "Approval Authority", "Limits Authority", "Status", "Last Active", "Actions"]
    };
  },
  computed: {
    filteredUsers() {
      const q = this.query;
      return this.users.filter(row =>
        row.kind === this.userTab &&
        (!this.userRoleFilter || row.role === this.userRoleFilter) &&
        (!this.userStatusFilter || row.status === this.userStatusFilter) &&
        (!q || JSON.stringify(row).toLowerCase().includes(q))
      );
    },
    roleMatrix() {
      const full = { value: "Full Access", tone: "tone-good" };
      const limited = (value) => ({ value, tone: "tone-warn" });
      const view = { value: "View Only", tone: "tone-info" };
      const none = { value: "No Access", tone: "tone-danger" };
      return [
        { role: "Platform Admin", permissions: { "Route Permissions": full, "API Permissions": full, "Approval Authority": full, "Limits Authority": full, "Impersonation / Testing": full } },
        { role: "Finance Checker", permissions: { "Route Permissions": limited("Limited"), "API Permissions": view, "Approval Authority": limited("Up to NGN 250,000"), "Limits Authority": limited("Up to NGN 250,000"), "Impersonation / Testing": limited("Limited") } },
        { role: "Support Reviewer", permissions: { "Route Permissions": view, "API Permissions": view, "Approval Authority": limited("Up to NGN 25,000"), "Limits Authority": view, "Impersonation / Testing": limited("Limited") } },
        { role: "Vendor", permissions: { "Route Permissions": limited("Limited"), "API Permissions": limited("Limited"), "Approval Authority": limited("Up to NGN 100,000"), "Limits Authority": limited("Up to NGN 100,000"), "Impersonation / Testing": none } },
        { role: "Vendor User", permissions: { "Route Permissions": view, "API Permissions": none, "Approval Authority": limited("Up to NGN 10,000"), "Limits Authority": limited("Up to NGN 10,000"), "Impersonation / Testing": none } }
      ];
    },
    permissionAreas() {
      return ["Route Permissions", "API Permissions", "Approval Authority", "Limits Authority", "Impersonation / Testing"];
    }
  },
  methods: {
    suspendUser(row) {
      row.status = "Suspended";
      this.$emit("audit", { time: "13 May 10:32:00", actor: "admin", role: "super-admin", event: "wallet_user_suspended", target: row.email, ip: "local" });
    },
    resetUser(row) {
      this.$emit("audit", { time: "13 May 10:33:00", actor: "admin", role: "super-admin", event: "temporary_password_generated", target: row.email, ip: "local" });
    },
    openAudit(row) {
      this.$emit("audit", { time: "13 May 10:39:00", actor: "admin", role: "super-admin", event: "viewed_record", target: row.email, ip: "local" });
    }
  }
};
</script>
