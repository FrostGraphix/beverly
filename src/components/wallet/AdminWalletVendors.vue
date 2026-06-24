<template>
  <section class="page-stack">
    <div class="kpi-grid">
      <WalletKpiCard label="Total Vendors" value="1,248" tone="good" note="+12.4% vs May 11 - May 17" />
      <WalletKpiCard label="Verified Vendors" value="982" tone="good" note="+15.6% verified" />
      <WalletKpiCard label="Pending Verification" value="186" tone="warn" note="-4.2% this week" />
      <WalletKpiCard label="Frozen Vendors" value="80" tone="danger" note="+3.1% watched" />
    </div>
    <div class="filter-toolbar wallet-table-toolbar">
      <BaseSelect v-model="vendorStatusFilter" class="mini-select">
        <option value="">All Statuses</option><option>Active</option><option>Pending</option><option>Inactive</option>
      </BaseSelect>
      <BaseSelect v-model="vendorKycFilter" class="mini-select">
        <option value="">All KYC</option><option>Verified</option><option>Under Review</option><option>Pending</option><option>Failed</option>
      </BaseSelect>
      <BaseButton class="quiet-button" @click="clearFilters">Clear all</BaseButton>
    </div>
    <div class="content-grid">
      <WalletDataTable title="Vendor Directory" :columns="vendorColumns" :rows="filteredVendors">
        <template #row="{ row }">
          <td><strong>{{ row.name }}</strong><small>{{ row.email }}</small></td>
          <td><code>{{ row.code }}</code></td>
          <td>{{ row.contact }}</td>
          <td><span :class="['status-pill', row.kycTone]">{{ row.kyc }}</span></td>
          <td><strong>{{ row.balance }}</strong></td>
          <td>{{ row.held }}</td>
          <td><span :class="['status-pill', row.limitTone]">{{ row.limit }}</span></td>
          <td><span :class="['status-pill', row.statusTone]">{{ row.status }}</span></td>
          <td class="row-actions">
            <a class="mini-button" href="#/wallet/admin/verification">Review</a>
            <BaseButton class="mini-button" size="sm" @click="freezeVendor(row)">Freeze</BaseButton>
          </td>
        </template>
      </WalletDataTable>
      <aside class="side-stack">
        <article class="panel">
          <h2>Onboarding Funnel</h2>
          <div v-for="step in onboardingFunnel" :key="step.label" class="funnel-row">
            <span>{{ step.label }}</span><b>{{ step.count }}</b>
          </div>
          <strong class="tone-good">45.5% conversion</strong>
        </article>
        <article class="panel">
          <h2>Recent Vendor Activities</h2>
          <div v-for="item in vendorActivity" :key="item.text" class="activity-item">
            <span :class="['dot', item.tone]"></span>
            <p>{{ item.text }}<small>{{ item.time }}</small></p>
          </div>
        </article>
      </aside>
    </div>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import BaseSelect from "../base/BaseSelect.vue";
import WalletKpiCard from "./WalletKpiCard.vue";
import WalletDataTable from "./WalletDataTable.vue";

const money = (value) => `NGN ${Number(value).toLocaleString("en-NG")}`;

export default {
  name: "AdminWalletVendors",
  components: { BaseButton, BaseSelect, WalletKpiCard, WalletDataTable },
  props: {
    vendors: { type: Array, required: true },
    query: { type: String, default: "" }
  },
  emits: ["audit"],
  data() {
    return {
      vendorStatusFilter: "",
      vendorKycFilter: "",
      vendorColumns: ["Vendor", "Organization ID", "Contact", "KYC", "Wallet Balance", "Held", "Limit", "Status", "Actions"]
    };
  },
  computed: {
    filteredVendors() {
      const q = this.query;
      return this.vendors.filter(row =>
        (!this.vendorStatusFilter || row.status === this.vendorStatusFilter) &&
        (!this.vendorKycFilter || row.kyc === this.vendorKycFilter) &&
        (!q || JSON.stringify(row).toLowerCase().includes(q))
      );
    },
    onboardingFunnel() {
      return [{ label: "Invited", count: 312 }, { label: "Profile Created", count: 246 }, { label: "KYC Submitted", count: 198 }, { label: "Verified", count: 142 }];
    },
    vendorActivity() {
      return [
        { text: "FreshStop Mart wallet funded successfully", time: "10:42 AM", tone: "good" },
        { text: "QuickVend KYC verified successfully", time: "10:21 AM", tone: "good" },
        { text: "SnackHub KYC submission pending", time: "08:54 AM", tone: "warn" },
        { text: "Metro Vending vendor was frozen", time: "08:31 AM", tone: "danger" }
      ];
    }
  },
  methods: {
    clearFilters() { this.vendorStatusFilter = ""; this.vendorKycFilter = ""; },
    freezeVendor(row) {
      row.status = "Inactive";
      row.statusTone = "danger";
      this.$emit("audit", { time: "13 May 10:34:00", actor: "admin", role: "super-admin", event: "wallet_frozen", target: row.code, ip: "local" });
    }
  }
};
</script>
